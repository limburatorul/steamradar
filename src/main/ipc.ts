import { app, BrowserWindow, ipcMain, shell } from 'electron'
import type {
  AppConfig,
  DealEvent,
  StatsSummary,
  StoreStats,
  UpdateInfo,
  WatchItem
} from '../shared/types'
import { checkForUpdate, downloadAndRestart, scheduleUpdateChecks } from './updater'
import { notificationIdentity } from './shortcut'
import { clearHistory, getManySeries, getSeries, trackedKeys } from './history'
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
  getEpic,
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
    if (patch.updateCheckMin !== undefined) scheduleUpdateChecks(next.updateCheckMin)
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
    const epic = await getEpic()
    const events = await getEvents()
    const since = new Date(Date.now() - 24 * 3600_000).toISOString()

    // fiecare magazin isi numara singur pragurile: sectiunile din interfata sunt
    // separate, iar un total amestecat n-ar spune nimic despre niciuna
    const steam: StoreStats = { tracked: 0, free: 0, under5: 0, under10: 0 }
    const gog: StoreStats = { tracked: 0, free: 0, under5: 0, under10: 0 }
    for (const d of cat.deals) {
      const bucket = d.store === 'gog' ? gog : steam
      bucket.tracked++
      const tier = tierOf(d.priceFinal, cfg)
      if (tier) bucket[tier]++
    }

    return {
      steam,
      gog,
      epic: {
        current: epic.games.filter((g) => g.current).length,
        upcoming: epic.games.filter((g) => !g.current).length
      },
      eventsToday: events.filter((e) => e.at >= since).length,
      unseen: events.filter((e) => !e.seen).length
    }
  })

  ipcMain.handle('epic:list', async () => {
    const epic = await getEpic()
    return { updatedAt: epic.updatedAt, games: epic.games }
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

  ipcMain.handle('history:get', (_e, key: string) => getSeries(key))
  ipcMain.handle('history:many', (_e, keys: string[]) => getManySeries(keys))
  ipcMain.handle('history:tracked', () => trackedKeys())
  ipcMain.handle('history:clear', () => clearHistory())

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('shell:open-external', async (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) return false
    await shell.openExternal(url)
    return true
  })

  /**
   * Deschide pagina jocului in clientul Steam. `steam://` e inregistrat de
   * client la instalare; daca lipseste, Windows n-ar face nimic vizibil, deci
   * cad pe pagina din browser cand nu am appid sau cand omul a cerut altfel.
   */
  ipcMain.handle('shell:open-steam', async (_e, appid: number | null, fallbackUrl: string) => {
    const cfg = await loadConfig()
    if (cfg.openInSteamClient && appid) {
      await shell.openExternal(`steam://store/${appid}`)
      return true
    }
    if (/^https?:\/\//i.test(fallbackUrl)) {
      await shell.openExternal(fallbackUrl)
      return true
    }
    return false
  })
}
