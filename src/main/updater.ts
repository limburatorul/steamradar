import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { UpdateInfo, UpdateProgress } from '../shared/types'
import { checksumOk } from './checksum'
import { dataRoot } from './config'

/**
 * Auto-actualizare prin instalator, dupa tiparul din File Labs (verificarea
 * SHA-256):
 *
 *  - descarc `SteamRadar-<ver>-setup.exe` in %TEMP%, ii verific marimea si
 *    SHA-256-ul publicat de GitHub.
 *  - de la 0.9.0 instalatorul e per-masina (Program Files\ProtagonistLabs\SteamRadar)
 *    si cere drepturi de administrator. Pornit cu CreateProcess (spawn, sau `call`
 *    dintr-un .cmd) da eroarea 740, deci il pornesc prin ShellExecute
 *    (`Start-Process -Verb RunAs`) si Windows cere UAC. Ies abia dupa ce a pornit;
 *    instalatorul inchide ce a mai ramas si, cu `--force-run`, porneste aplicatia
 *    la loc ca userul obisnuit. Daca omul refuza UAC, aplicatia merge mai departe
 *    si spune ca actualizarea nu s-a instalat.
 *  - silentios doar cand e deja instalata. Varianta portabila ruleaza din
 *    %TEMP%\<random>\, deci n-are un folder de instalare de refolosit: ea primeste
 *    o singura data instalatorul vizibil, iar datele ei se copiaza inainte in
 *    %APPDATA%, ca istoricul sa nu se piarda.
 */

const UPDATE_REPO = 'limburatorul/steamradar'
/** Ce cauta actualizarea: instalatorul. Portabilul ramane in release doar pentru versiunile vechi. */
const SETUP_PATTERN = /^SteamRadar-(\d+\.\d+\.\d+)-setup\.exe$/i
const PORTABLE_PATTERN = /^SteamRadar-(\d+\.\d+\.\d+)-portabil\.exe$/i

const USER_AGENT = 'SteamRadar-Updater'

interface GitHubRelease {
  tag_name?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
  assets?: Array<{ name?: string; browser_download_url?: string; size?: number; digest?: string }>
}

/** Folderul in care sta .exe-ul portabil, sau null cand rulam instalata. */
export function portableDir(): string | null {
  const dir = process.env.PORTABLE_EXECUTABLE_DIR
  return dir && dir.trim() ? dir : null
}

/** Compara `1.10.0` cu `1.9.0` numeric, nu alfabetic. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Versiunea gasita de ultima verificare din acest proces. Descarcarea foloseste
 * doar adresa si digest-ul de aici, nu ce trimite renderer-ul.
 */
let offered: { version: string; url: string; size?: number; digest: string } | null = null

export async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion()

  try {
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`,
      15_000
    )
    if (!res.ok) return { available: false, currentVersion, error: `GitHub returned ${res.status}` }

    const release = (await res.json()) as GitHubRelease
    if (release.draft || release.prerelease) return { available: false, currentVersion }

    const latestVersion = (release.tag_name ?? '').replace(/^v/i, '')
    if (!latestVersion) return { available: false, currentVersion, error: 'release has no version' }
    if (compareVersions(latestVersion, currentVersion) <= 0) {
      return { available: false, currentVersion, latestVersion }
    }

    const asset = (release.assets ?? []).find((a) => a.name && SETUP_PATTERN.test(a.name))
    if (!asset?.browser_download_url) {
      return { available: false, currentVersion, latestVersion, error: 'release has no installer' }
    }
    // fara SHA-256 publicat nu avem cu ce verifica instalatorul: nu-l oferim
    if (!asset.digest) {
      return { available: false, currentVersion, latestVersion, error: 'release has no checksum' }
    }
    offered = { version: latestVersion, url: asset.browser_download_url, size: asset.size, digest: asset.digest }

    return {
      available: true,
      currentVersion,
      latestVersion,
      notes: release.body?.slice(0, 4000),
      downloadUrl: asset.browser_download_url,
      sizeBytes: asset.size,
      digest: asset.digest
    }
  } catch (err) {
    return {
      available: false,
      currentVersion,
      error: err instanceof Error ? err.message : 'update check failed'
    }
  }
}

/** La trecerea de la portabil: datele de langa exe merg in %APPDATA%, o singura data. */
async function migratePortableData(): Promise<void> {
  const from = dataRoot()
  const to = app.getPath('userData')
  if (from === to) return
  const exists = (f: string): Promise<boolean> =>
    fs.access(f).then(
      () => true,
      () => false
    )
  if (await exists(path.join(to, 'config.json'))) return
  await fs.mkdir(to, { recursive: true })
  for (const name of await fs.readdir(from).catch(() => [])) {
    if (name.endsWith('.json')) await fs.copyFile(path.join(from, name), path.join(to, name))
  }
}

/**
 * Porneste instalatorul prin ShellExecute, cu UAC. True cand a pornit, false cand
 * omul a refuzat sau n-a putut porni. Calea merge prin mediu, nu in comanda, ca
 * un apostrof din numele userului sa n-o rupa. Silentios: fara /D= (calea vine din
 * registry), iar `--force-run` porneste aplicatia la loc. Cel vizibil (portabilul)
 * are propriul "Run SteamRadar" la final.
 */
function startInstaller(installer: string, silent: boolean): Promise<boolean> {
  const args = silent ? " -ArgumentList '/S','--updated','--force-run'" : ''
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `try { Start-Process -FilePath $env:STEAMRADAR_SETUP${args} -Verb RunAs; exit 0 } catch { exit 1 }`
      ],
      { env: { ...process.env, STEAMRADAR_SETUP: installer }, windowsHide: true },
      (err) => resolve(!err)
    )
  })
}

/**
 * Descarca instalatorul, il verifica si il preda scriptului, apoi inchide
 * aplicatia. Nu sterge nimic: instalatorul inlocuieste fisierele pe loc.
 */
export async function downloadAndRestart(
  info: UpdateInfo,
  onProgress: (p: UpdateProgress) => void
): Promise<{ ok: boolean; error?: string }> {
  if (!app.isPackaged) return { ok: false, error: 'auto-update only works from a built app' }
  // doar versiunea pe care a gasit-o chiar procesul asta; banner-ul spune doar care
  const release = offered
  if (!release || release.version !== info.latestVersion) {
    return { ok: false, error: 'Check for updates again, then update.' }
  }

  const target = path.join(app.getPath('temp'), `SteamRadar Setup ${release.version}.exe`)
  const temp = `${target}.partial`

  try {
    onProgress({ phase: 'downloading', receivedBytes: 0, totalBytes: release.size })

    const res = await fetchWithTimeout(release.url, 300_000)
    if (!res.ok || !res.body) throw new Error(`download returned ${res.status}`)

    const total = Number(res.headers.get('content-length')) || release.size
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      chunks.push(value)
      received += value.byteLength
      onProgress({ phase: 'downloading', receivedBytes: received, totalBytes: total })
    }

    onProgress({ phase: 'verifying', message: 'Checking the file...' })

    // marimea prinde descarcarile trunchiate, SHA-256 restul: fisierul asta e pe
    // cale sa fie rulat ca instalator
    if (release.size && received !== release.size) {
      throw new Error(`incomplete file: ${received} of ${release.size} bytes`)
    }
    const buffer = Buffer.concat(chunks, received)
    if (!checksumOk(buffer, release.digest)) {
      throw new Error("the download doesn't match the checksum GitHub published for it")
    }

    // intai cu alt nume: un instalator pe jumatate scris n-are voie sa existe sub numele final
    await fs.writeFile(temp, buffer)
    await fs.rename(temp, target)

    const portable = portableDir() !== null
    if (portable) await migratePortableData()

    onProgress({ phase: 'restarting', message: 'Starting the installer — Windows asks for permission...' })
    if (!(await startInstaller(target, !portable))) {
      const error = 'Update not installed: Windows did not get permission to install it.'
      onProgress({ phase: 'error', message: error })
      return { ok: false, error }
    }

    setTimeout(() => app.quit(), 800)
    return { ok: true }
  } catch (err) {
    await fs.unlink(temp).catch(() => undefined)
    const message = err instanceof Error ? err.message : String(err)
    onProgress({ phase: 'error', message })
    return { ok: false, error: message }
  }
}

/**
 * Sterge executabilele portabile mai vechi ramase langa cel curent (de la
 * actualizarile facute de versiunile dinainte de instalator).
 *
 * Ruleaza de trei ori: imediat, apoi la 5 si 20 de secunde. Procesul inlocuit
 * poate tine inca lock pe fisierul lui in momentul pornirii noastre, iar o
 * singura incercare esueaza tacut - exact bug-ul prins in Game Browser.
 */
export function cleanupOldExecutables(): void {
  const dir = portableDir()
  if (!dir) return
  const current = app.getVersion()

  const sweep = async (): Promise<void> => {
    try {
      for (const name of await fs.readdir(dir)) {
        const match = name.match(PORTABLE_PATTERN)
        if (!match) continue
        if (compareVersions(match[1], current) >= 0) continue
        await fs.unlink(path.join(dir, name)).catch(() => undefined)
      }
    } catch {
      // folderul poate fi indisponibil momentan; reincercarile acopera cazul
    }
  }

  void sweep()
  void delay(5_000).then(sweep)
  void delay(20_000).then(sweep)
}

/* ------------------------------------------------------ verificare periodica */

let updateTimer: NodeJS.Timeout | null = null
let notifier: ((info: UpdateInfo) => void) | null = null

export function onUpdateAvailable(cb: (info: UpdateInfo) => void): void {
  notifier = cb
}

/** Verifica si anunta doar cand chiar exista o versiune mai noua. */
export async function announceUpdate(): Promise<void> {
  const info = await checkForUpdate()
  if (info.available) notifier?.(info)
}

/**
 * Reverificare periodica (implicit la 60 de minute), nu doar la pornire: aplicatia sta zile intregi in
 * tray, deci o verificare facuta doar la boot ar insemna sa afli de o versiune
 * noua abia la urmatoarea repornire a calculatorului.
 */
export function scheduleUpdateChecks(minutes: number): void {
  if (updateTimer) clearInterval(updateTimer)
  updateTimer = null
  if (!minutes || minutes <= 0 || !app.isPackaged) return
  updateTimer = setInterval(() => void announceUpdate(), Math.max(15, minutes) * 60_000)
}

export function stopUpdateChecks(): void {
  if (updateTimer) clearInterval(updateTimer)
  updateTimer = null
}

export { UPDATE_REPO }
