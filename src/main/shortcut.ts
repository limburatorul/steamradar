import { app, shell } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { portableDir } from './updater'

/**
 * Identitatea aplicatiei in notificarile Windows.
 *
 * Windows nu ia numele din titlul ferestrei si nici din `productName`. Toast-ul
 * afiseaza numele scurtaturii din Start Menu a carei AppUserModelID se
 * potriveste cu cea setata de proces. Fara scurtatura, Windows cade pe
 * identitatea implicita a runtime-ului si scrie "electron.app.Electron" deasupra
 * notificarii - sau nu o arata deloc.
 *
 * Deci scriu o scurtatura in Start Menu, cu acelasi AUMID pe care il declara
 * procesul. E singura cale acceptata de Windows pentru o aplicatie fara
 * instalator. Se scrie o singura data si tinteste .exe-ul portabil real
 * (`PORTABLE_EXECUTABLE_DIR`), nu copia din `%TEMP%`.
 */

export const APP_USER_MODEL_ID = 'ro.steamradar.app'

/** Numele fisierului .lnk e chiar textul care apare deasupra notificarii. */
const SHORTCUT_NAME = 'SteamRadar.lnk'

function shortcutPath(): string {
  return path.join(app.getPath('appData'), 'Microsoft/Windows/Start Menu/Programs', SHORTCUT_NAME)
}

/** Executabilul spre care are rost sa arate scurtatura, sau null in dezvoltare. */
function exeTarget(): string | null {
  const dir = portableDir()
  if (dir) {
    // wrapper-ul portabil pune calea completa a exe-ului real in
    // PORTABLE_EXECUTABLE_FILE; process.execPath ar arata spre copia din %TEMP%
    const file = process.env.PORTABLE_EXECUTABLE_FILE
    if (file && existsSync(file)) return file
    const name = process.env.PORTABLE_EXECUTABLE_APP_FILENAME
    const candidate = name ? path.join(dir, name) : null
    return candidate && existsSync(candidate) ? candidate : null
  }
  // build impachetat obisnuit: execPath e chiar aplicatia
  return app.isPackaged ? process.execPath : null
}

export interface IdentityStatus {
  ok: boolean
  reason: string
}

let cached: IdentityStatus = { ok: false, reason: 'not checked yet' }

/** Starea de la ultima verificare, pentru ecranul de setari. */
export function notificationIdentity(): IdentityStatus {
  return cached
}

/**
 * Se asigura ca notificarile apar sub numele aplicatiei. Intoarce ce s-a
 * intamplat, ca sa pot spune omului in Settings de ce vede sau nu numele.
 */
export function ensureNotificationIdentity(): IdentityStatus {
  cached = computeIdentity()
  return cached
}

function computeIdentity(): IdentityStatus {
  app.setAppUserModelId(APP_USER_MODEL_ID)

  if (process.platform !== 'win32') return { ok: true, reason: 'not Windows' }

  const target = exeTarget()
  if (!target) {
    return {
      ok: false,
      reason: 'running unpackaged — Windows will show the Electron name on notifications'
    }
  }

  const link = shortcutPath()
  try {
    const existing = shell.readShortcutLink(link)
    // scurtatura poate fi ramasa de la o copie mutata intre timp
    if (existing.target === target && existing.appUserModelId === APP_USER_MODEL_ID) {
      return { ok: true, reason: 'shortcut already in place' }
    }
  } catch {
    // nu exista inca; o scriu mai jos
  }

  const written = shell.writeShortcutLink(link, 'create', {
    target,
    cwd: path.dirname(target),
    description: 'Steam deal radar',
    appUserModelId: APP_USER_MODEL_ID
  })

  return written
    ? { ok: true, reason: 'Start Menu shortcut created for notification identity' }
    : { ok: false, reason: 'could not write the Start Menu shortcut' }
}

export { shortcutPath }
