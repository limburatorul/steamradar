import { useEffect, useState } from 'react'
import type { Deal, DealEvent, StatsSummary, Tier } from '@shared/types'
import { TIER_LABEL } from '@shared/types'
import DealRow from '../components/DealRow'
import { eventToDeal, timeAgo } from '../format'

interface Props {
  watched: Set<string>
  onToggleWatch: (deal: Deal) => void
  onGoTo: (tier: Tier) => void
  refreshKey: number
}

/** Ce s-a schimbat de cand n-ai fost atent: pragurile, apoi ultimele intrari. */
export default function DashboardView({
  watched,
  onToggleWatch,
  onGoTo,
  refreshKey
}: Props): React.JSX.Element {
  const [stats, setStats] = useState<StatsSummary | null>(null)
  const [events, setEvents] = useState<DealEvent[]>([])
  const [freeDeals, setFreeDeals] = useState<Deal[]>([])

  useEffect(() => {
    void window.api.deals.stats().then(setStats)
    void window.api.events.list().then((all) => setEvents(all.slice(0, 40)))
    void window.api.deals
      .query({ tier: 'free', sort: 'reviews', limit: 20 })
      .then((r) => setFreeDeals(r.items))
  }, [refreshKey])

  return (
    <>
      <div className="toolbar">
        <h1>Radar</h1>
        <span className="sub">ce s-a mișcat de la ultima scanare</span>
      </div>

      <div className="content">
        <div className="tiles">
          <div className="tile free" onClick={() => onGoTo('free')} style={{ cursor: 'pointer' }}>
            <div className="k">Gratis acum</div>
            <div className="v">{stats?.free ?? '—'}</div>
          </div>
          <div className="tile" onClick={() => onGoTo('under5')} style={{ cursor: 'pointer' }}>
            <div className="k">Sub 5</div>
            <div className="v">{stats?.under5?.toLocaleString('ro-RO') ?? '—'}</div>
          </div>
          <div className="tile" onClick={() => onGoTo('under10')} style={{ cursor: 'pointer' }}>
            <div className="k">Sub 10</div>
            <div className="v">{stats?.under10?.toLocaleString('ro-RO') ?? '—'}</div>
          </div>
          <div className="tile">
            <div className="k">Oferte în catalog</div>
            <div className="v">{stats?.tracked?.toLocaleString('ro-RO') ?? '—'}</div>
          </div>
          <div className="tile">
            <div className="k">Alerte în 24 h</div>
            <div className="v">{stats?.eventsToday ?? '—'}</div>
          </div>
        </div>

        {freeDeals.length > 0 && (
          <>
            <div className="section-title">Gratis chiar acum — ia-le cât sunt</div>
            <div className="deals" style={{ marginBottom: 22 }}>
              {freeDeals.map((d) => (
                <DealRow
                  key={d.key}
                  deal={d}
                  watched={watched.has(d.key)}
                  onToggleWatch={onToggleWatch}
                />
              ))}
            </div>
          </>
        )}

        <div className="section-title">Ultimele intrări în praguri</div>
        {events.length === 0 ? (
          <div className="empty">
            <h3>Încă n-am ce raporta</h3>
            <p>
              Prima scanare doar construiește referința. De la a doua încolo apar aici toate
              jocurile care intră într-un prag.
            </p>
          </div>
        ) : (
          <div className="deals">
            {events.map((e) => (
              <DealRow
                key={e.id}
                deal={eventToDeal(e)}
                watched={watched.has(e.key)}
                onToggleWatch={onToggleWatch}
                aside={
                  <>
                    <span className={`badge small tier-${e.tier}`}>{TIER_LABEL[e.tier]}</span>
                    <span className="event-time">{timeAgo(e.at)}</span>
                    {e.fromPriceText && <span className="event-time">era {e.fromPriceText}</span>}
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
