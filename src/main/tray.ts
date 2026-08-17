import { app, Menu, nativeImage, Tray } from 'electron'
import { ICON_TRAY } from './icon'
import { isScanning, scanFree, scanFull, tierOf } from './scanner'
import { getCatalog } from './store'
import { loadConfig } from './config'

/**
 * Aplicatia isi are rostul cand ruleaza in fundal, deci traieste in tray:
 * fereastra inchisa nu inseamna proces oprit, ci doar fereastra ascunsa.
 * Iesirea reala se face din meniul de aici sau din setari.
 */

let tray: Tray | null = null
let quitting = false

export function isQuitting(): boolean {
  return quitting
}

export function beginQuit(): void {
  quitting = true
}

export function createTray(showWindow: () => void): Tray {
  const image = nativeImage.createFromBuffer(Buffer.from(ICON_TRAY, 'base64'))
  tray = new Tray(image)
  tray.setToolTip('SteamRadar')
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)
  void refreshTray(showWindow)
  return tray
}

export async function refreshTray(showWindow: () => void): Promise<void> {
  if (!tray) return
  const cfg = await loadConfig()
  const cat = await getCatalog()

  let free = 0
  let under5 = 0
  let under10 = 0
  for (const d of cat.deals) {
    const t = tierOf(d.priceFinal, cfg)
    if (t === 'free') free++
    else if (t === 'under5') under5++
    else if (t === 'under10') under10++
  }

  tray.setToolTip(
    cat.updatedAt
      ? `SteamRadar — ${free} free, ${under5} under ${cfg.thresholdLow}, ${under10} under ${cfg.thresholdHigh}`
      : 'SteamRadar — no scan yet'
  )

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open SteamRadar', click: showWindow },
      { type: 'separator' },
      { label: `${free} free right now`, enabled: false },
      { label: `${under5} under ${cfg.thresholdLow}`, enabled: false },
      { label: `${under10} under ${cfg.thresholdHigh}`, enabled: false },
      { type: 'separator' },
      {
        label: isScanning() ? 'Scanning...' : 'Scan everything now',
        enabled: !isScanning(),
        click: () => void scanFull()
      },
      {
        label: 'Check free games only',
        enabled: !isScanning(),
        click: () => void scanFree()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
