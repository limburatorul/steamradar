import { contextBridge, ipcRenderer } from 'electron'
import type { DealQuery, DealQueryResult } from '../shared/query'
import type {
  AppConfig,
  Deal,
  DealEvent,
  ScanStatus,
  StatsSummary,
  Tier,
  WatchItem
} from '../shared/types'

/**
 * API-ul expus interfetei. Suprafata e deliberat mica si tipizata:
 * randarea nu are acces la Node, doar la operatiile de mai jos.
 */
const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
    set: (patch: Partial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke('config:set', patch),
    dataFolder: (): Promise<string> => ipcRenderer.invoke('config:data-folder'),
    openDataFolder: (): Promise<string> => ipcRenderer.invoke('config:open-data-folder')
  },

  deals: {
    query: (q: DealQuery): Promise<DealQueryResult> => ipcRenderer.invoke('deals:query', q),
    lookup: (keys: string[]): Promise<Deal[]> => ipcRenderer.invoke('deals:lookup', keys),
    stats: (): Promise<StatsSummary> => ipcRenderer.invoke('deals:stats')
  },

  events: {
    list: (tier?: Tier | null): Promise<DealEvent[]> => ipcRenderer.invoke('events:list', tier),
    markSeen: (ids?: string[]): Promise<void> => ipcRenderer.invoke('events:mark-seen', ids),
    clear: (): Promise<void> => ipcRenderer.invoke('events:clear')
  },

  watch: {
    list: (): Promise<WatchItem[]> => ipcRenderer.invoke('watch:list'),
    add: (item: WatchItem): Promise<WatchItem[]> => ipcRenderer.invoke('watch:add', item),
    remove: (key: string): Promise<WatchItem[]> => ipcRenderer.invoke('watch:remove', key),
    update: (key: string, patch: Partial<WatchItem>): Promise<WatchItem[]> =>
      ipcRenderer.invoke('watch:update', key, patch)
  },

  scan: {
    status: (): Promise<ScanStatus> => ipcRenderer.invoke('scan:status'),
    running: (): Promise<boolean> => ipcRenderer.invoke('scan:running'),
    full: (): Promise<DealEvent[]> => ipcRenderer.invoke('scan:full'),
    free: (): Promise<DealEvent[]> => ipcRenderer.invoke('scan:free'),
    cancel: (): Promise<void> => ipcRenderer.invoke('scan:cancel'),
    /** Intoarce functia de dezabonare, ca React sa poata curata la unmount. */
    onStatus: (cb: (s: ScanStatus) => void): (() => void) => {
      const listener = (_e: unknown, s: ScanStatus): void => cb(s)
      ipcRenderer.on('scan:status', listener)
      return () => ipcRenderer.removeListener('scan:status', listener)
    }
  },

  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:open-external', url)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
