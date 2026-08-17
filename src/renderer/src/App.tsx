import { useCallback, useEffect, useState } from 'react'
import type { AppConfig, Deal, ScanStatus, StatsSummary, Tier, WatchItem } from '@shared/types'
import DashboardView from './views/DashboardView'
import DealsView from './views/DealsView'
import HistoryView from './views/HistoryView'
import SettingsView from './views/SettingsView'
import WatchlistView from './views/WatchlistView'
import UpdateBanner from './components/UpdateBanner'
import { clock, num } from './format'

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
    if (watchlist.some((w) => w.key === deal.key)) {
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
  const low = config?.thresholdLow ?? 5
  const high = config?.thresholdHigh ?? 10

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

          <div className="nav-group">Thresholds</div>
          <button
            className={`nav-item${page === 'free' ? ' active' : ''}`}
            onClick={() => setPage('free')}
          >
            Free right now <span className="count">{stats?.free ?? ''}</span>
          </button>
          <button
            className={`nav-item${page === 'under5' ? ' active' : ''}`}
            onClick={() => setPage('under5')}
          >
            Under {low} <span className="count">{stats ? num(stats.under5) : ''}</span>
          </button>
          <button
            className={`nav-item${page === 'under10' ? ' active' : ''}`}
            onClick={() => setPage('under10')}
          >
            Under {high} <span className="count">{stats ? num(stats.under10) : ''}</span>
          </button>

          <div className="nav-group">Hunting</div>
          <button
            className={`nav-item${page === 'top' ? ' active' : ''}`}
            onClick={() => setPage('top')}
          >
            Top discounts <span className="count">{stats ? num(stats.tracked) : ''}</span>
          </button>
          <button
            className={`nav-item${page === 'watch' ? ' active' : ''}`}
            onClick={() => setPage('watch')}
          >
            Watchlist <span className="count">{watchlist.length || ''}</span>
          </button>
          <button
            className={`nav-item${page === 'history' ? ' active' : ''}`}
            onClick={() => setPage('history')}
          >
            Alert history
          </button>

          <div className="nav-group">App</div>
          <button
            className={`nav-item${page === 'settings' ? ' active' : ''}`}
            onClick={() => setPage('settings')}
          >
            Settings
          </button>
        </nav>

        <div className="scanbar">
          {scanning && (
            <div className="progress">
              <div style={{ width: `${pct || 3}%` }} />
            </div>
          )}
          <div className={`line${status?.error ? ' err' : ''}`} title={status?.message}>
            {status?.error ?? status?.message ?? 'Starting up'}
          </div>
          {scanning && status && status.totalPages > 0 && (
            <div className="line">
              page {status.page} of {status.totalPages} · {num(status.found)} deals
            </div>
          )}
          {!scanning && (
            <div className="line">
              last full scan {clock(status?.lastFullScan ?? null)} · free{' '}
              {clock(status?.lastFreeScan ?? null)}
            </div>
          )}
          {scanning ? (
            <button className="ghost" onClick={() => void window.api.scan.cancel()}>
              Stop scanning
            </button>
          ) : (
            <button className="primary" onClick={() => void window.api.scan.full()}>
              Scan now
            </button>
          )}
        </div>
      </aside>

      <main className="main">
        <UpdateBanner />
        {page === 'radar' && (
          <DashboardView
            watched={watched}
            onToggleWatch={toggleWatch}
            onGoTo={(t: Tier) => setPage(t)}
            lowThreshold={low}
            highThreshold={high}
            refreshKey={refreshKey}
          />
        )}
        {page === 'free' && (
          <DealsView
            tier="free"
            title="Free right now"
            hint="No game is at -100% at the moment. I check every few minutes."
            watched={watched}
            onToggleWatch={toggleWatch}
            refreshKey={refreshKey}
          />
        )}
        {page === 'under5' && (
          <DealsView
            tier="under5"
            title={`Under ${low}`}
            hint="No deal under the threshold. Scan, or lower the discount filter."
            watched={watched}
            onToggleWatch={toggleWatch}
            refreshKey={refreshKey}
          />
        )}
        {page === 'under10' && (
          <DealsView
            tier="under10"
            title={`Under ${high}`}
            hint="Nothing in the band between the two thresholds."
            watched={watched}
            onToggleWatch={toggleWatch}
            refreshKey={refreshKey}
          />
        )}
        {page === 'top' && (
          <DealsView
            tier={null}
            title="Top discounts"
            hint="The catalog is empty — start a scan."
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
        {page === 'settings' && config && <SettingsView config={config} onChange={patchConfig} />}
      </main>
    </div>
  )
}
