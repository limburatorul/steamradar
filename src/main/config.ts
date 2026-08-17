import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { AppConfig } from '../shared/types'

/**
 * Configurarea si datele stau intr-un singur folder. In varianta portabila e
 * langa executabil, ca aplicatia sa poata fi mutata pe stick cu tot cu istoric.
 * `PORTABLE_EXECUTABLE_DIR` e setata de electron-builder si arata unde e .exe-ul
 * real, nu folderul temporar in care se dezarhiveaza.
 */

const PORTABLE_FOLDER = 'SteamRadar-Date'

const DEFAULTS: AppConfig = {
  countryCode: 'RO',
  freeIntervalMin: 10,
  fullIntervalMin: 60,
  requestDelayMs: 1200,
  maxPages: 40,
  thresholdLow: 5,
  thresholdHigh: 10,
  notify: { free: true, under5: true, under10: true },
  notifyMode: 'grouped',
  notifySound: true,
  includeDlc: false,
  minDiscountPct: 0,
  startMinimized: false,
  autoStart: false,
  closeToTray: true
}

let cached: AppConfig | null = null

function portableExeDir(): string | null {
  const dir = process.env.PORTABLE_EXECUTABLE_DIR
  return dir && dir.trim() ? dir : null
}

export function isPortable(): boolean {
  return portableExeDir() !== null
}

export function dataRoot(): string {
  const exeDir = portableExeDir()
  return exeDir ? path.join(exeDir, PORTABLE_FOLDER) : app.getPath('userData')
}

function configFile(): string {
  return path.join(dataRoot(), 'config.json')
}

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached
  try {
    const raw = await fs.readFile(configFile(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    // merge cu DEFAULTS ca sa nu crape dupa ce adaug campuri noi intr-o versiune viitoare
    cached = { ...DEFAULTS, ...parsed, notify: { ...DEFAULTS.notify, ...(parsed.notify ?? {}) } }
  } catch {
    cached = { ...DEFAULTS }
  }
  return cached
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const current = await loadConfig()
  const next: AppConfig = {
    ...current,
    ...patch,
    notify: { ...current.notify, ...(patch.notify ?? {}) }
  }
  await fs.mkdir(path.dirname(configFile()), { recursive: true })
  await fs.writeFile(configFile(), JSON.stringify(next, null, 2), 'utf8')
  cached = next
  return next
}

export function defaultConfig(): AppConfig {
  return { ...DEFAULTS, notify: { ...DEFAULTS.notify } }
}
