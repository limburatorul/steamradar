import { useEffect, useState } from 'react'
import type { Deal, DealEvent, StatsSummary, Tier } from '@shared/types'
import { TIER_LABEL } from '@shared/types'
import DealRow from '../components/DealRow'
import { eventToDeal, num, timeAgo } from '../format'

interface Props {
  watched: Set<string>
  onToggleWatch: (deal: Deal) => void
  onOpen: (deal: Deal) => void
  onGoTo: (tier: Tier) => void
  lowThreshold: number
  highThreshold: number
  refreshKey: number
}

/** Ce s-a schimbat de cand n-ai fost atent: pragurile, apoi ultimele intrari. */
export default function DashboardView({
  watched,
  onToggleWatch,
  onOpen,
  onGoTo,
  lowThreshold,
  highThreshold,
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
        <span className="sub">what moved since the last scan</span>
      </div>

      <div className="content">
        <div className="tiles">
          <div className="tile free" onClick={() => onGoTo('free')} style={{ cursor: 'pointer' }}>
            <div className="k">Free right now</div>
            <div className="v">{stats?.free ?? '—'}</div>
          </div>
          <div className="tile" onClick={() => onGoTo('under5')} style={{ cursor: 'pointer' }}>
            <div className="k">Under {lowThreshold}</div>
            <div className="v">{stats ? num(stats.under5) : '—'}</div>
          </div>
          <div className="tile" onClick={() => onGoTo('under10')} style={{ cursor: 'pointer' }}>
            <div className="k">Under {highThreshold}</div>
            <div className="v">{stats ? num(stats.under10) : '—'}</div>
          </div>
          <div className="tile">
            <div className="k">Deals tracked</div>
            <div className="v">{stats ? num(stats.tracked) : '—'}</div>
          </div>
          <div className="tile">
            <div className="k">Alerts in 24 h</div>
            <div className="v">{stats?.eventsToday ?? '—'}</div>
          </div>
        </div>

        {freeDeals.length > 0 && (
          <>
            <div className="section-title">Free right now — grab them while they last</div>
            <div className="deals" style={{ marginBottom: 22 }}>
              {freeDeals.map((d) => (
                <DealRow
                  key={d.key}
                  deal={d}
                  watched={watched.has(d.key)}
                  onToggleWatch={onToggleWatch}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </>
        )}

        <div className="section-title">Latest threshold entries</div>
        {events.length === 0 ? (
          <div className="empty">
            <h3>Nothing to report yet</h3>
            <p>
              The first scan only builds the baseline. From the second one on, every game that
              drops into a threshold shows up here.
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
                onOpen={onOpen}
                aside={
                  <>
                    <span className={`badge small tier-${e.tier}`}>{TIER_LABEL[e.tier]}</span>
                    <span className="event-time">{timeAgo(e.at)}</span>
                    {e.fromPriceText && <span className="event-time">was {e.fromPriceText}</span>}
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
