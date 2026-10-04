import { app } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { UpdateInfo, UpdateProgress } from '../shared/types'
import { checksumOk } from './checksum'
import { dataRoot } from './config'

/**
 * Auto-actualizare prin instalator, dupa tiparul din File Labs (verificarea
 * SHA-256) si Shelf (predarea catre un .cmd detasat):
 *
 *  - descarc `SteamRadar-<ver>-setup.exe` in %TEMP%, ii verific marimea si
 *    SHA-256-ul publicat de GitHub, apoi predau unui .cmd detasat si ies: nimic
 *    din acest proces nu poate supravietui instalatorului care ii suprascrie exe-ul.
 *    Scriptul asteapta sa se deblocheze exe-ul, ruleaza instalatorul si abia apoi
 *    porneste aplicatia (un NSIS silentios nu o mai porneste el).
 *  - silentios doar cand e deja instalata. Varianta portabila ruleaza din
 *    %TEMP%\<random>\, deci n-are un folder de instalare de refolosit: ea primeste
 *    o singura data instalatorul vizibil, iar datele ei se copiaza inainte in
 *    %APPDATA%, ca istoricul sa nu se piarda.
 *
 * Capcanele din Shelf, platite acolo: bucla de asteptare foloseste doar comenzi
 * cmd (un `tasklist | find` intr-un proces fara consola se blocheaza la nesfarsit),
 * `/D=` trebuie sa fie ultimul parametru si fara ghilimele, iar instalatorul se
 * ruleaza cu `call`, nu cu `start /wait`.
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

/** Aproximativ doua minute, la ~0,35 s pe iteratie (masurat in Shelf). */
const EXE_UNLOCK_MAX_TRIES = 340

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

async function runInstallerAndRelaunch(installer: string, silent: boolean): Promise<void> {
  const exe = process.execPath
  const script = path.join(app.getPath('temp'), `steamradar-update-${Date.now()}.cmd`)
  const lines = [
    '@echo off',
    'set /a tries=0',
    ':waitloop',
    'set /a tries+=1',
    `if %tries% gtr ${EXE_UNLOCK_MAX_TRIES} goto runinstaller`,
    // exe-ul care ruleaza e blocat: daca il pot deschide pentru scriere, a iesit
    `2>nul (>>"${exe}" call ) && goto runinstaller`,
    'for /l %%i in (1,1,700000) do @rem',
    'goto waitloop',
    ':runinstaller',
    silent ? `call "${installer}" /S /D=${path.dirname(exe)}` : `call "${installer}"`,
    // instalatorul vizibil are propriul "Run SteamRadar" la final
    silent ? `start "" "${exe}"` : '',
    'del "%~f0"'
  ].filter(Boolean)
  await fs.writeFile(script, lines.join('\r\n'), 'utf-8')
  spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
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
  if (!info.downloadUrl || !info.latestVersion) return { ok: false, error: 'download link missing' }

  const target = path.join(app.getPath('temp'), `SteamRadar Setup ${info.latestVersion}.exe`)
  const temp = `${target}.partial`

  try {
    onProgress({ phase: 'downloading', receivedBytes: 0, totalBytes: info.sizeBytes })

    const res = await fetchWithTimeout(info.downloadUrl, 300_000)
    if (!res.ok || !res.body) throw new Error(`download returned ${res.status}`)

    const total = Number(res.headers.get('content-length')) || info.sizeBytes
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
    if (info.sizeBytes && received !== info.sizeBytes) {
      throw new Error(`incomplete file: ${received} of ${info.sizeBytes} bytes`)
    }
    const buffer = Buffer.concat(chunks, received)
    if (!checksumOk(buffer, info.digest)) {
      throw new Error("the download doesn't match the checksum GitHub published for it")
    }

    // intai cu alt nume: un instalator pe jumatate scris n-are voie sa existe sub numele final
    await fs.writeFile(temp, buffer)
    await fs.rename(temp, target)

    const portable = portableDir() !== null
    if (portable) await migratePortableData()

    onProgress({ phase: 'restarting', message: 'Starting the installer...' })
    await runInstallerAndRelaunch(target, !portable)

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
 * Reverificare periodica, nu doar la pornire: aplicatia sta zile intregi in
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
