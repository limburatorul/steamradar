import { useEffect, useState } from 'react'
import type { EpicFreeGame } from '@shared/types'
import EpicCard from '../components/EpicCard'
import { timeAgo } from '../format'

/**
 * Sectiunea Epic. N-are praguri de pret, fiindca reducerile Epic nu se pot citi
 * (vezi `epic.ts`) - are doar jocurile date gratis: cele revendicabile acum si
 * cele pe care Epic le-a anuntat pentru saptamanile urmatoare.
 */
export default function EpicView({ refreshKey }: { refreshKey: number }): React.JSX.Element {
  const [games, setGames] = useState<EpicFreeGame[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void window.api.epic.list().then((r) => {
      setGames(r.games)
      setUpdatedAt(r.updatedAt)
      setLoading(false)
    })
  }, [refreshKey])

  const current = games.filter((g) => g.current)
  const upcoming = games.filter((g) => !g.current)

  return (
    <>
      <div className="toolbar">
        <h1>Epic free games</h1>
        <span className="sub">
          {loading ? 'loading…' : updatedAt ? `checked ${timeAgo(updatedAt)}` : 'not checked yet'}
        </span>
        <div className="spacer" />
        <button
          onClick={() =>
            void window.api.openExternal('https://store.epicgames.com/en-US/free-games')
          }
        >
          Epic free games page
        </button>
      </div>

      <div className="content">
        {!loading && !games.length ? (
          <div className="empty">
            <h3>Nothing from Epic yet</h3>
            <p>
              The list is refreshed on every scan. Epic hands out games weekly, so this fills up at
              the next check.
            </p>
          </div>
        ) : (
          <>
            {current.length > 0 && (
              <>
                <div className="section-title">Free right now — claim them and they stay yours</div>
                <div className="epic-grid">
                  {current.map((g) => (
                    <EpicCard key={g.id} game={g} />
                  ))}
                </div>
              </>
            )}

            {upcoming.length > 0 && (
              <>
                <div className="section-title" style={{ marginTop: 22 }}>
                  Coming up — announced by Epic, not claimable yet
                </div>
                <div className="epic-grid">
                  {upcoming.map((g) => (
                    <EpicCard key={g.id} game={g} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
