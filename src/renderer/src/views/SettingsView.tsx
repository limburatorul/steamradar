import { useEffect, useState } from 'react'
import type { AppConfig, UpdateInfo } from '@shared/types'

/** Codul de tara decide moneda in care raspunde Steam, nu limba. */
const COUNTRIES: Array<[string, string]> = [
  ['RO', 'Romania (EUR)'],
  ['DE', 'Germany (EUR)'],
  ['FR', 'France (EUR)'],
  ['PL', 'Poland (PLN)'],
  ['UK', 'United Kingdom (GBP)'],
  ['US', 'United States (USD)']
]

interface Props {
  config: AppConfig
  onChange: (patch: Partial<AppConfig>) => void
}

export default function SettingsView({ config, onChange }: Props): React.JSX.Element {
  const [folder, setFolder] = useState('')
  const [version, setVersion] = useState('')
  const [identity, setIdentity] = useState<{ ok: boolean; reason: string } | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    void window.api.config.dataFolder().then(setFolder)
    void window.api.version().then(setVersion)
    void window.api.update.identity().then(setIdentity)
  }, [])

  const checkUpdate = (): void => {
    setChecking(true)
    void window.api.update.check().then((info) => {
      setUpdate(info)
      setChecking(false)
    })
  }

  return (
    <>
      <div className="toolbar">
        <h1>Settings</h1>
        <span className="sub">SteamRadar {version}</span>
      </div>

      <div className="content">
        <div className="settings">
          <div className="card">
            <h2>Thresholds</h2>
            <p className="hint">
              How cheap a game has to get before it is worth an alert. Free is always the first
              threshold and cannot be turned off here, only in notifications.
            </p>
            <div className="row">
              <label className="k">Lower threshold</label>
              <input
                type="number"
                min={1}
                max={100}
                value={config.thresholdLow}
                onChange={(e) => onChange({ thresholdLow: Number(e.target.value) })}
              />
              <span className="note">default 5</span>
            </div>
            <div className="row">
              <label className="k">Upper threshold</label>
              <input
                type="number"
                min={1}
                max={200}
                value={config.thresholdHigh}
                onChange={(e) => onChange({ thresholdHigh: Number(e.target.value) })}
              />
              <span className="note">default 10</span>
            </div>
            <div className="row">
              <label className="k">Minimum discount</label>
              <input
                type="number"
                min={0}
                max={99}
                value={config.minDiscountPct}
                onChange={(e) => onChange({ minDiscountPct: Number(e.target.value) })}
              />
              <span className="note">% — ignore weaker deals entirely</span>
            </div>
            <div className="row">
              <label className="k">Include DLC</label>
              <input
                type="checkbox"
                checked={config.includeDlc}
                onChange={(e) => onChange({ includeDlc: e.target.checked })}
              />
              <span className="note">there are twice as many discounted DLCs as games</span>
            </div>
          </div>

          <div className="card">
            <h2>Notifications</h2>
            <p className="hint">
              Windows does not queue toasts forever — when many arrive at once it drops the ones
              behind. A single scan can push dozens of games under 5, and hundreds during a big
              sale. So grouped mode sends one toast per threshold, with the count and the first
              names. Games that went free always get their own toast either way.
            </p>
            <div className="row">
              <label className="k">Alert me about</label>
              <div className="pill-row">
                <button
                  className={`pill${config.notify.free ? ' on' : ''}`}
                  onClick={() =>
                    onChange({ notify: { ...config.notify, free: !config.notify.free } })
                  }
                >
                  Free
                </button>
                <button
                  className={`pill${config.notify.under5 ? ' on' : ''}`}
                  onClick={() =>
                    onChange({ notify: { ...config.notify, under5: !config.notify.under5 } })
                  }
                >
                  Under {config.thresholdLow}
                </button>
                <button
                  className={`pill${config.notify.under10 ? ' on' : ''}`}
                  onClick={() =>
                    onChange({ notify: { ...config.notify, under10: !config.notify.under10 } })
                  }
                >
                  Under {config.thresholdHigh}
                </button>
              </div>
            </div>
            <div className="row">
              <label className="k">Mode</label>
              <select
                value={config.notifyMode}
                onChange={(e) =>
                  onChange({ notifyMode: e.target.value as AppConfig['notifyMode'] })
                }
              >
                <option value="grouped">Grouped — one per threshold</option>
                <option value="individual">Individual — one per game</option>
              </select>
            </div>
            <div className="row">
              <label className="k">Sound</label>
              <input
                type="checkbox"
                checked={config.notifySound}
                onChange={(e) => onChange({ notifySound: e.target.checked })}
              />
            </div>
            <div className="row">
              <label className="k">Shown as</label>
              <span className={`note${identity && !identity.ok ? ' warn' : ''}`}>
                {identity
                  ? identity.ok
                    ? 'SteamRadar — Windows knows the app by its Start Menu shortcut'
                    : `Electron — ${identity.reason}`
                  : '…'}
              </span>
            </div>
          </div>

          <div className="card">
            <h2>Scanning</h2>
            <p className="hint">
              A full scan walks every discounted game on Steam, 500 per request — about 13 requests
              and 30 seconds. Checking for games that went free costs a single request, so it can
              run far more often. Steam answers 429 past roughly 20 requests in a burst, but the
              app waits it out and resumes on its own.
            </p>
            <div className="row">
              <label className="k">Check free games every</label>
              <input
                type="number"
                min={2}
                max={240}
                value={config.freeIntervalMin}
                onChange={(e) => onChange({ freeIntervalMin: Number(e.target.value) })}
              />
              <span className="note">minutes</span>
            </div>
            <div className="row">
              <label className="k">Full scan every</label>
              <input
                type="number"
                min={15}
                max={1440}
                value={config.fullIntervalMin}
                onChange={(e) => onChange({ fullIntervalMin: Number(e.target.value) })}
              />
              <span className="note">minutes</span>
            </div>
            <div className="row">
              <label className="k">Delay between requests</label>
              <input
                type="number"
                min={300}
                max={5000}
                step={100}
                value={config.requestDelayMs}
                onChange={(e) => onChange({ requestDelayMs: Number(e.target.value) })}
              />
              <span className="note">ms — below 800 raises the odds of a 429</span>
            </div>
            <div className="row">
              <label className="k">Page cap</label>
              <input
                type="number"
                min={5}
                max={100}
                value={config.maxPages}
                onChange={(e) => onChange({ maxPages: Number(e.target.value) })}
              />
              <span className="note">500 games each; 40 is three times more than needed</span>
            </div>
            <div className="row">
              <label className="k">Pricing country</label>
              <select
                value={config.countryCode}
                onChange={(e) => onChange({ countryCode: e.target.value })}
              >
                {COUNTRIES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card">
            <h2>Appearance</h2>
            <p className="hint">
              Same recipe as Game Browser: the style only swaps the blur scale, the saturation lift
              and the grain — every surface keeps its own tint and alpha. What separates acrylic
              from plain blur is the saturation and the grain, not more blur. Without the rotating
              backdrop there is nothing behind the glass, so all three look the same.
            </p>
            <div className="row">
              <label className="k">Glass style</label>
              <div className="pill-row">
                {(['glass', 'acrylic', 'frosted'] as const).map((g) => (
                  <button
                    key={g}
                    className={`pill${config.glassStyle === g ? ' on' : ''}`}
                    onClick={() => onChange({ glassStyle: g })}
                  >
                    {g[0].toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <label className="k">Rotating backdrop</label>
              <input
                type="checkbox"
                checked={config.backdrop}
                onChange={(e) => onChange({ backdrop: e.target.checked })}
              />
              <span className="note">built from the capsule art of the best-reviewed deals</span>
            </div>
            <div className="row">
              <label className="k">Steam button opens</label>
              <select
                value={config.openInSteamClient ? 'client' : 'browser'}
                onChange={(e) => onChange({ openInSteamClient: e.target.value === 'client' })}
              >
                <option value="client">The Steam client</option>
                <option value="browser">The store page in a browser</option>
              </select>
            </div>
          </div>

          <div className="card">
            <h2>Startup</h2>
            <div className="row">
              <label className="k">Start with Windows</label>
              <input
                type="checkbox"
                checked={config.autoStart}
                onChange={(e) => onChange({ autoStart: e.target.checked })}
              />
            </div>
            <div className="row">
              <label className="k">Start minimized to tray</label>
              <input
                type="checkbox"
                checked={config.startMinimized}
                onChange={(e) => onChange({ startMinimized: e.target.checked })}
              />
            </div>
            <div className="row">
              <label className="k">Closing the window hides it</label>
              <input
                type="checkbox"
                checked={config.closeToTray}
                onChange={(e) => onChange({ closeToTray: e.target.checked })}
              />
              <span className="note">unchecked, closing the window stops the watching too</span>
            </div>
          </div>

          <div className="card">
            <h2>Updates</h2>
            <p className="hint">
              The portable build updates itself: it downloads the new .exe next to the current one,
              starts it and deletes the old file on the next launch.
            </p>
            <div className="row">
              <label className="k">Check every</label>
              <input
                type="number"
                min={0}
                max={1440}
                step={15}
                value={config.updateCheckMin}
                onChange={(e) => onChange({ updateCheckMin: Number(e.target.value) })}
              />
              <span className="note">minutes — 0 turns the periodic check off</span>
            </div>
            <div className="row">
              <button onClick={checkUpdate} disabled={checking}>
                {checking ? 'Checking…' : 'Check for updates'}
              </button>
              <span className="note">
                {update
                  ? update.available
                    ? `Version ${update.latestVersion} is available`
                    : update.error
                      ? update.error
                      : `You are on the latest version (${update.currentVersion})`
                  : ''}
              </span>
            </div>
          </div>

          <div className="card">
            <h2>Data</h2>
            <p className="hint">
              The catalog, the alert history, the price history and the watchlist live in{' '}
              <code>{folder}</code>. Price history is kept only for games that reached a threshold
              at least once or that you watch — keeping it for all ~5900 deals would be hundreds of
              thousands of points a day for games nobody looks at.
            </p>
            <div className="row" style={{ padding: 0 }}>
              <button onClick={() => void window.api.config.openDataFolder()}>
                Open the folder
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (confirm('Delete every recorded price history? This cannot be undone.')) {
                    void window.api.history.clear()
                  }
                }}
              >
                Clear price history
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
