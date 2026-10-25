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

// Fiecare versiune are o poza facuta cu sablonul de bannere al studioului (Marketing\banners), 1920 x 340:
// a ei, cu numele versiunii (assets/whats-new/0.9.webp), sau, daca nu are, poza lunii in care a iesit
// (m10.webp). Poza n-are text, deci nu se scrie nimic peste ea.
const PICTURES: Record<string, string> = {
  '0.9': new URL('../assets/whats-new/0.9.webp', import.meta.url).href,
  m08: new URL('../assets/whats-new/m08.webp', import.meta.url).href,
  m09: new URL('../assets/whats-new/m09.webp', import.meta.url).href,
  m10: new URL('../assets/whats-new/m10.webp', import.meta.url).href
}

const picture = (r: Release): string => PICTURES[r.minor] ?? PICTURES[`m${r.entries[0].date.slice(5, 7)}`]

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
              <img
                className="whats-new-banner-art"
                src={picture(release)}
                alt={`What’s new in ${release.minor}${release.title ? `: ${release.title}` : ''}`}
              />
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
