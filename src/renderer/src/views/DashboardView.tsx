import { useEffect, useState } from 'react'
import type { Deal, DealEvent, EpicFreeGame, StatsSummary, Store, Tier } from '@shared/types'
import { STORE_LABEL, TIER_LABEL } from '@shared/types'
import DealRow from '../components/DealRow'
import EpicCard from '../components/EpicCard'
import { eventToDeal, num, timeAgo } from '../format'

interface Props {
  watched: Set<string>
  onToggleWatch: (deal: Deal) => void
  onOpen: (deal: Deal) => void
  onGoTo: (store: Store, tier: Tier) => void
  onGoToEpic: () => void
  lowThreshold: number
  highThreshold: number
  refreshKey: number
}

/** Ce s-a schimbat de cand n-ai fost atent, la toate trei magazinele deodata. */
export default function DashboardView({
  watched,
  onToggleWatch,
  onOpen,
  onGoTo,
  onGoToEpic,
  lowThreshold,
  highThreshold,
  refreshKey
}: Props): React.JSX.Element {
  const [stats, setStats] = useState<StatsSummary | null>(null)
  const [events, setEvents] = useState<DealEvent[]>([])
  const [freeDeals, setFreeDeals] = useState<Deal[]>([])
  const [epic, setEpic] = useState<EpicFreeGame[]>([])

  useEffect(() => {
    void window.api.deals.stats().then(setStats)
    void window.api.events.list().then((all) => setEvents(all.slice(0, 40)))
    void window.api.deals
      .query({ tier: 'free', sort: 'reviews', limit: 20 })
      .then((r) => setFreeDeals(r.items))
    void window.api.epic.list().then((r) => setEpic(r.games.filter((g) => g.current)))
  }, [refreshKey])

  return (
    <>
      <div className="toolbar">
        <h1>Radar</h1>
        <span className="sub">what moved since the last scan</span>
      </div>

      <div className="content">
        {(['steam', 'gog'] as const).map((store) => {
          const shop = stats?.[store]
          return (
            <div className="tiles" key={store}>
              <div className="tile store" onClick={() => onGoTo(store, 'free')}>
                <div className="k">{STORE_LABEL[store]}</div>
                <div className="v small">{shop ? `${num(shop.tracked)} deals` : '—'}</div>
              </div>
              <div className="tile free" onClick={() => onGoTo(store, 'free')}>
                <div className="k">Free right now</div>
                <div className="v">{shop?.free ?? '—'}</div>
              </div>
              <div className="tile" onClick={() => onGoTo(store, 'under5')}>
                <div className="k">Under {lowThreshold}</div>
                <div className="v">{shop ? num(shop.under5) : '—'}</div>
              </div>
              <div className="tile" onClick={() => onGoTo(store, 'under10')}>
                <div className="k">Under {highThreshold}</div>
                <div className="v">{shop ? num(shop.under10) : '—'}</div>
              </div>
            </div>
          )
        })}

        <div className="tiles">
          <div className="tile store" onClick={onGoToEpic}>
            <div className="k">Epic</div>
            <div className="v small">weekly giveaways</div>
          </div>
          <div className="tile free" onClick={onGoToEpic}>
            <div className="k">Free right now</div>
            <div className="v">{stats?.epic.current ?? '—'}</div>
          </div>
          <div className="tile" onClick={onGoToEpic}>
            <div className="k">Announced next</div>
            <div className="v">{stats?.epic.upcoming ?? '—'}</div>
          </div>
          <div className="tile">
            <div className="k">Alerts in 24 h</div>
            <div className="v">{stats?.eventsToday ?? '—'}</div>
          </div>
        </div>

        {epic.length > 0 && (
          <>
            <div className="section-title">Free on Epic — claim them and they stay yours</div>
            <div className="epic-grid" style={{ marginBottom: 22 }}>
              {epic.map((g) => (
                <EpicCard key={g.id} game={g} />
              ))}
            </div>
          </>
        )}

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
