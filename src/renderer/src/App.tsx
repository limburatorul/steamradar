import { useCallback, useEffect, useState } from 'react'
import type { AppConfig, Deal, ScanStatus, StatsSummary, Tier, WatchItem } from '@shared/types'
import DashboardView from './views/DashboardView'
import DealsView from './views/DealsView'
import HistoryView from './views/HistoryView'
import SettingsView from './views/SettingsView'
import WatchlistView from './views/WatchlistView'
import { clock } from './format'

type Page = 'radar' | 'free' | 'under5' | 'under10' | 'top' | 'watch' | 'history' | 'settings'

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('radar')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [stats, setStats] = useState<StatsSummary | null>(null)
  const [watchlist, setWatchlist] = useState<WatchItem[]>([])
  const [version, setVersion] = useState('')
  // creste dupa fiecare scanare terminata si obliga ecranele sa reciteasca datele
  const [refreshKey, setRefreshKey] = useState(0)

  const reloadStats = useCallback(() => void window.api.deals.stats().then(setStats), [])

  useEffect(() => {
    void window.api.config.get().then(setConfig)
    void window.api.scan.status().then(setStatus)
    void window.api.watch.list().then(setWatchlist)
    void window.api.version().then(setVersion)
    reloadStats()

    return window.api.scan.onStatus((s) => {
      setStatus(s)
      // datele s-au schimbat doar cand scanarea s-a terminat, nu la fiecare pagina
      if (s.phase === 'idle') {
        setRefreshKey((k) => k + 1)
        reloadStats()
      }
    })
  }, [reloadStats])

  const patchConfig = (patch: Partial<AppConfig>): void => {
    void window.api.config.set(patch).then(setConfig)
  }

  const toggleWatch = (deal: Deal): void => {
    const exists = watchlist.some((w) => w.key === deal.key)
    if (exists) {
      void window.api.watch.remove(deal.key).then(setWatchlist)
      return
    }
    void window.api.watch
      .add({
        key: deal.key,
        appid: deal.appid,
        name: deal.name,
        url: deal.url,
        image: deal.image,
        addedAt: new Date().toISOString(),
        priceAtAdd: deal.priceFinal,
        priceTextAtAdd: deal.priceText,
        targetPrice: null
      })
      .then(setWatchlist)
  }

  const updateWatch = (key: string, patch: Partial<WatchItem>): void => {
    void window.api.watch.update(key, patch).then(setWatchlist)
  }

  const watched = new Set(watchlist.map((w) => w.key))
  const scanning = status ? status.phase !== 'idle' && status.phase !== 'error' : false
  const pct =
    status && status.totalPages > 0 ? Math.round((status.page / status.totalPages) * 100) : 0

  const goTier = (t: Tier): void => setPage(t === 'free' ? 'free' : t)

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">◎</div>
          <div>
            <div className="brand-name">SteamRadar</div>
            <div className="brand-ver">{version}</div>
          </div>
        </div>

        <nav className="nav">
          <button
            className={`nav-item${page === 'radar' ? ' active' : ''}`}
            onClick={() => setPage('radar')}
          >
            Radar
            {stats && stats.unseen > 0 && <span className="dot">{stats.unseen}</span>}
          </button>

          <div className="nav-group">Praguri</div>
          <button
            className={`nav-item${page === 'free' ? ' active' : ''}`}
            onClick={() => setPage('free')}
          >
            Gratis acum <span className="count">{stats?.free ?? ''}</span>
          </button>
          <button
            className={`nav-item${page === 'under5' ? ' active' : ''}`}
            onClick={() => setPage('under5')}
          >
            Sub {config?.thresholdLow ?? 5}{' '}
            <span className="count">{stats?.under5?.toLocaleString('ro-RO') ?? ''}</span>
          </button>
          <button
            className={`nav-item${page === 'under10' ? ' active' : ''}`}
            onClick={() => setPage('under10')}
          >
            Sub {config?.thresholdHigh ?? 10}{' '}
            <span className="count">{stats?.under10?.toLocaleString('ro-RO') ?? ''}</span>
          </button>

          <div className="nav-group">Vânătoare</div>
          <button
            className={`nav-item${page === 'top' ? ' active' : ''}`}
            onClick={() => setPage('top')}
          >
            Top reduceri <span className="count">{stats?.tracked?.toLocaleString('ro-RO') ?? ''}</span>
          </button>
          <button
            className={`nav-item${page === 'watch' ? ' active' : ''}`}
            onClick={() => setPage('watch')}
          >
            Urmărite <span className="count">{watchlist.length || ''}</span>
          </button>
          <button
            className={`nav-item${page === 'history' ? ' active' : ''}`}
            onClick={() => setPage('history')}
          >
            Istoric alerte
          </button>

          <div className="nav-group">Aplicație</div>
          <button
            className={`nav-item${page === 'settings' ? ' active' : ''}`}
            onClick={() => setPage('settings')}
          >
            Setări
          </button>
        </nav>

        <div className="scanbar">
          {scanning && (
            <div className="progress">
              <div style={{ width: `${pct || 3}%` }} />
            </div>
          )}
          <div className={`line${status?.error ? ' err' : ''}`} title={status?.message}>
            {status?.error ?? status?.message ?? 'Se pregătește'}
          </div>
          {scanning && status && status.totalPages > 0 && (
            <div className="line">
              pagina {status.page} din {status.totalPages} · {status.found} oferte
            </div>
          )}
          {!scanning && (
            <div className="line">
              ultima scanare {clock(status?.lastFullScan ?? null)} · gratis{' '}
              {clock(status?.lastFreeScan ?? null)}
            </div>
          )}
          {scanning ? (
            <button className="ghost" onClick={() => void window.api.scan.cancel()}>
              Oprește scanarea
            </button>
          ) : (
            <button className="primary" onClick={() => void window.api.scan.full()}>
              Scanează acum
            </button>
          )}
        </div>
      </aside>

      <main className="main">
        {page === 'radar' && (
          <DashboardView
            watched={watched}
            onToggleWatch={toggleWatch}
            onGoTo={goTier}
            refreshKey={refreshKey}
          />
        )}
        {page === 'free' && (
          <DealsView
            tier="free"
            title="Gratis acum"
            hint="Nu e niciun joc la -100% în acest moment. Verific la fiecare câteva minute."
            watched={watched}
            onToggleWatch={toggleWatch}
            refreshKey={refreshKey}
          />
        )}
        {page === 'under5' && (
          <DealsView
            tier="under5"
            title={`Sub ${config?.thresholdLow ?? 5}`}
            hint="Nicio ofertă sub prag. Scanează sau coboară filtrul de reducere."
            watched={watched}
            onToggleWatch={toggleWatch}
            refreshKey={refreshKey}
          />
        )}
        {page === 'under10' && (
          <DealsView
            tier="under10"
            title={`Sub ${config?.thresholdHigh ?? 10}`}
            hint="Nicio ofertă în intervalul dintre praguri."
            watched={watched}
            onToggleWatch={toggleWatch}
            refreshKey={refreshKey}
          />
        )}
        {page === 'top' && (
          <DealsView
            tier={null}
            title="Top reduceri"
            hint="Catalogul e gol — pornește o scanare."
            watched={watched}
            onToggleWatch={toggleWatch}
            refreshKey={refreshKey}
          />
        )}
        {page === 'watch' && (
          <WatchlistView
            watchlist={watchlist}
            onToggleWatch={toggleWatch}
            onUpdate={updateWatch}
            refreshKey={refreshKey}
          />
        )}
        {page === 'history' && (
          <HistoryView
            watched={watched}
            onToggleWatch={toggleWatch}
            refreshKey={refreshKey}
            onSeen={reloadStats}
          />
        )}
        {page === 'settings' && config && (
          <SettingsView config={config} onChange={patchConfig} />
        )}
      </main>
    </div>
  )
}
