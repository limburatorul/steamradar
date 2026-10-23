import { useEffect, useState } from 'react'
import { CHANGELOG, type ChangelogEntry } from '../changelog'

interface Release {
  minor: string
  title?: string
  entries: ChangelogEntry[]
}

const fmt = (iso: string, o: Intl.DateTimeFormatOptions): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', o)

// Ca la celelalte aplicatii ale studioului (Shelf, Lume): un rand pe versiune x.y, cu toate
// patch-urile ei, sub luna in care a iesit; in dreapta versiunea aleasa, sub un banner 960 x 170.
function groupReleases(entries: ChangelogEntry[]): Release[] {
  const releases: Release[] = []
  for (const e of entries) {
    const minor = e.version.split('.').slice(0, 2).join('.')
    const last = releases[releases.length - 1]
    if (last?.minor === minor) last.entries.push(e)
    else releases.push({ minor, entries: [e] })
    if (e.title) releases[releases.length - 1].title = e.title
  }
  return releases
}

/** Culorile SteamRadar sub cateva randuri de oferte si o eticheta de pret, desenate, nu poza. */
function Banner(): React.JSX.Element {
  return (
    <svg className="whats-new-banner-art" viewBox="0 0 960 170" aria-hidden="true">
      <defs>
        <linearGradient id="wn-bg" x1="0" y1="0" x2="1" y2=".6">
          <stop offset="0" stopColor="#0f1115" />
          <stop offset="1" stopColor="#16223a" />
        </linearGradient>
        <radialGradient id="wn-glow">
          <stop offset="0" stopColor="#4c8bf5" stopOpacity=".45" />
          <stop offset="1" stopColor="#4c8bf5" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="960" height="170" fill="url(#wn-bg)" />
      <ellipse cx="760" cy="50" rx="280" ry="190" fill="url(#wn-glow)" />
      <g transform="translate(540 22) rotate(-5 180 60)" opacity=".92">
        <rect width="360" height="130" rx="12" fill="#101012" fillOpacity=".75" stroke="#7aabf8" strokeOpacity=".35" />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(12 ${12 + i * 38})`}>
            <rect width="64" height="28" rx="4" fill={['#2f4f8f', '#3a3f4a', '#2b3a2a'][i]} />
            <rect x="76" y="6" width={[150, 120, 170][i]} height="6" rx="3" fill="#ececee" opacity=".8" />
            <rect x="76" y="17" width="70" height="5" rx="2.5" fill="#a5a8ae" opacity=".6" />
            <rect x="268" y="4" width="64" height="20" rx="4" fill={i === 0 ? '#a4d007' : '#4c8bf5'} opacity=".9" />
          </g>
        ))}
      </g>
      <g transform="translate(880 30) rotate(18)">
        <path d="M0 0 h46 l18 18 -18 18 h-46 z" fill="#a4d007" />
        <circle cx="8" cy="18" r="4" fill="#0f1115" />
      </g>
    </svg>
  )
}

export default function WhatsNewDialog({ version, onClose }: { version: string; onClose: () => void }): React.JSX.Element {
  const releases = groupReleases(CHANGELOG)
  // versiunea care ruleaza, de obicei cea mai noua
  const [selected, setSelected] = useState(() =>
    Math.max(0, releases.findIndex((r) => version.startsWith(r.minor + '.')))
  )
  const release = releases[selected]

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog whats-new" role="dialog" aria-label="What’s new" onClick={(e) => e.stopPropagation()}>
        <h2 className="whats-new-head">What’s new in SteamRadar</h2>
        <div className="whats-new-body">
          <nav className="whats-new-nav" aria-label="Releases">
            {releases.map((r, i) => {
              const newest = r.entries[0].date
              const month = fmt(newest, { month: 'long', year: 'numeric' })
              const newMonth = i === 0 || fmt(releases[i - 1].entries[0].date, { month: 'long', year: 'numeric' }) !== month
              return (
                <div key={r.minor}>
                  {newMonth && <div className="whats-new-month">{month}</div>}
                  <button
                    className={`whats-new-nav-item${i === selected ? ' active' : ''}`}
                    aria-current={i === selected ? 'true' : undefined}
                    title={r.title}
                    onClick={() => setSelected(i)}
                  >
                    <span>{r.minor}</span>
                    <span className="whats-new-nav-meta">
                      {r.entries.length > 1 ? `${r.entries.length} updates` : fmt(newest, { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                </div>
              )
            })}
          </nav>
          <div className="whats-new-list" key={release.minor}>
            <div className="whats-new-banner">
              <Banner />
              <div className="whats-new-banner-text">
                <div className="whats-new-banner-kicker">What’s new in</div>
                <div className="whats-new-banner-version">{release.minor}</div>
                {release.title && <div className="whats-new-banner-title">{release.title}</div>}
              </div>
            </div>
            {release.entries.map((entry) => (
              <section key={entry.version} className="whats-new-entry">
                <div className="whats-new-version">
                  v{entry.version}
                  <span className="whats-new-date">{fmt(entry.date, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <ul>
                  {entry.changes.map((change, i) => (
                    <li key={i}>{change}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
        <div className="dialog-actions whats-new-actions">
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
