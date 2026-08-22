import { contextBridge, ipcRenderer } from 'electron'
import type { DealQuery, DealQueryResult } from '../shared/query'
import type {
  AppConfig,
  Deal,
  DealEvent,
  EpicFreeGame,
  PriceSeries,
  ScanStatus,
  StatsSummary,
  Tier,
  UpdateInfo,
  UpdateProgress,
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

  epic: {
    /** Jocurile gratuite de pe Epic, cele de acum si cele anuntate. */
    list: (): Promise<{ updatedAt: string | null; games: EpicFreeGame[] }> =>
      ipcRenderer.invoke('epic:list')
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

  update: {
    check: (): Promise<UpdateInfo> => ipcRenderer.invoke('update:check'),
    download: (info: UpdateInfo): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('update:download', info),
    identity: (): Promise<{ ok: boolean; reason: string }> =>
      ipcRenderer.invoke('update:identity'),
    /** Notificarea de la pornire, cand exista o versiune mai noua. */
    onAvailable: (cb: (info: UpdateInfo) => void): (() => void) => {
      const listener = (_e: unknown, info: UpdateInfo): void => cb(info)
      ipcRenderer.on('update:available', listener)
      return () => ipcRenderer.removeListener('update:available', listener)
    },
    onProgress: (cb: (p: UpdateProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: UpdateProgress): void => cb(p)
      ipcRenderer.on('update:progress', listener)
      return () => ipcRenderer.removeListener('update:progress', listener)
    }
  },

  history: {
    get: (key: string): Promise<PriceSeries | null> => ipcRenderer.invoke('history:get', key),
    many: (keys: string[]): Promise<Record<string, PriceSeries>> =>
      ipcRenderer.invoke('history:many', keys),
    tracked: (): Promise<string[]> => ipcRenderer.invoke('history:tracked'),
    clear: (): Promise<void> => ipcRenderer.invoke('history:clear')
  },

  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:open-external', url),
  /** Pagina jocului in clientul Steam, cu pagina web ca rezerva. */
  openInSteam: (appid: number | null, fallbackUrl: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:open-steam', appid, fallbackUrl)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
