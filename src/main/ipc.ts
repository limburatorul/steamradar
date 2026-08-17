import { app, BrowserWindow, ipcMain, shell } from 'electron'
import type { AppConfig, DealEvent, StatsSummary, UpdateInfo, WatchItem } from '../shared/types'
import { checkForUpdate, downloadAndRestart } from './updater'
import { notificationIdentity } from './shortcut'
import { applyQuery, type DealQuery, type DealQueryResult } from '../shared/query'
import { dataRoot, loadConfig, saveConfig } from './config'
import {
  cancelScan,
  getStatus,
  isScanning,
  onStatus,
  scanFree,
  scanFull,
  schedule,
  tierOf
} from './scanner'
import {
  addWatch,
  clearEvents,
  getCatalog,
  getEvents,
  getWatchlist,
  markEventsSeen,
  removeWatch,
  updateWatch
} from './store'

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  onStatus((s) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send('scan:status', s)
  })

  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:set', async (_e, patch: Partial<AppConfig>) => {
    const next = await saveConfig(patch)
    if (patch.autoStart !== undefined || patch.startMinimized !== undefined) {
      app.setLoginItemSettings({
        openAtLogin: next.autoStart,
        args: next.startMinimized ? ['--hidden'] : []
      })
    }
    if (patch.fullIntervalMin !== undefined || patch.freeIntervalMin !== undefined) schedule()
    return next
  })
  ipcMain.handle('config:data-folder', () => dataRoot())
  ipcMain.handle('config:open-data-folder', () => shell.openPath(dataRoot()))

  ipcMain.handle('deals:query', async (_e, q: DealQuery): Promise<DealQueryResult> => {
    const cfg = await loadConfig()
    const cat = await getCatalog()
    const all = applyQuery(cat.deals, q, [cfg.thresholdLow, cfg.thresholdHigh])
    const offset = q.offset ?? 0
    const limit = q.limit ?? 100
    return {
      items: all.slice(offset, offset + limit),
      total: all.length,
      currency: cat.currency,
      updatedAt: cat.updatedAt
    }
  })

  // pentru lista de urmarire: preturile de acum ale catorva jocuri anume,
  // fara sa trec tot catalogul prin IPC
  ipcMain.handle('deals:lookup', async (_e, keys: string[]) => {
    const wanted = new Set(keys)
    return (await getCatalog()).deals.filter((d) => wanted.has(d.key))
  })

  ipcMain.handle('deals:stats', async (): Promise<StatsSummary> => {
    const cfg = await loadConfig()
    const cat = await getCatalog()
    const events = await getEvents()
    const since = new Date(Date.now() - 24 * 3600_000).toISOString()

    let free = 0
    let under5 = 0
    let under10 = 0
    for (const d of cat.deals) {
      const tier = tierOf(d.priceFinal, cfg)
      if (tier === 'free') free++
      else if (tier === 'under5') under5++
      else if (tier === 'under10') under10++
    }
    return {
      tracked: cat.deals.length,
      free,
      under5,
      under10,
      eventsToday: events.filter((e) => e.at >= since).length,
      unseen: events.filter((e) => !e.seen).length
    }
  })

  ipcMain.handle('events:list', async (_e, tier?: DealEvent['tier'] | null) => {
    const all = await getEvents()
    return tier ? all.filter((x) => x.tier === tier) : all
  })
  ipcMain.handle('events:mark-seen', (_e, ids?: string[]) => markEventsSeen(ids))
  ipcMain.handle('events:clear', () => clearEvents())

  ipcMain.handle('watch:list', () => getWatchlist())
  ipcMain.handle('watch:add', (_e, item: WatchItem) => addWatch(item))
  ipcMain.handle('watch:remove', (_e, key: string) => removeWatch(key))
  ipcMain.handle('watch:update', (_e, key: string, patch: Partial<WatchItem>) =>
    updateWatch(key, patch)
  )

  ipcMain.handle('scan:status', () => getStatus())
  ipcMain.handle('scan:running', () => isScanning())
  ipcMain.handle('scan:full', () => scanFull())
  ipcMain.handle('scan:free', () => scanFree())
  ipcMain.handle('scan:cancel', () => cancelScan())

  ipcMain.handle('update:check', () => checkForUpdate())
  ipcMain.handle('update:download', (_e, info: UpdateInfo) =>
    downloadAndRestart(info, (p) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('update:progress', p)
    })
  )
  ipcMain.handle('update:identity', () => notificationIdentity())

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('shell:open-external', async (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) return false
    await shell.openExternal(url)
    return true
  })
}
