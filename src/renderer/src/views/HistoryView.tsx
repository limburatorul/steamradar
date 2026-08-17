import { useEffect, useState } from 'react'
import type { Deal, DealEvent, Tier } from '@shared/types'
import { TIERS, TIER_LABEL } from '@shared/types'
import DealRow from '../components/DealRow'
import { eventToDeal, timeAgo } from '../format'

interface Props {
  watched: Set<string>
  onToggleWatch: (deal: Deal) => void
  refreshKey: number
  onSeen: () => void
}

export default function HistoryView({
  watched,
  onToggleWatch,
  refreshKey,
  onSeen
}: Props): React.JSX.Element {
  const [events, setEvents] = useState<DealEvent[]>([])
  const [tier, setTier] = useState<Tier | null>(null)
  const [watchedOnly, setWatchedOnly] = useState(false)

  useEffect(() => {
    void window.api.events.list().then(setEvents)
  }, [refreshKey])

  // deschiderea istoricului inseamna ca le-ai vazut; bulina din meniu dispare
  useEffect(() => {
    void window.api.events.markSeen().then(onSeen)
  }, [onSeen])

  const shown = events.filter(
    (e) => (!tier || e.tier === tier) && (!watchedOnly || watched.has(e.key))
  )

  return (
    <>
      <div className="toolbar">
        <h1>Istoric alerte</h1>
        <span className="sub">{shown.length.toLocaleString('ro-RO')} intrări</span>
        <div className="spacer" />
        <div className="pill-row">
          <button className={`pill${tier === null ? ' on' : ''}`} onClick={() => setTier(null)}>
            Toate
          </button>
          {TIERS.map((t) => (
            <button
              key={t}
              className={`pill${tier === t ? ' on' : ''}`}
              onClick={() => setTier(t)}
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
        <label className="row" style={{ padding: 0, gap: 6 }}>
          <input
            type="checkbox"
            checked={watchedOnly}
            onChange={(e) => setWatchedOnly(e.target.checked)}
          />
          <span className="note">doar urmărite</span>
        </label>
        <button
          className="ghost danger"
          onClick={() => void window.api.events.clear().then(() => setEvents([]))}
        >
          Golește
        </button>
      </div>

      <div className="content">
        {shown.length === 0 ? (
          <div className="empty">
            <h3>Istoricul e gol</h3>
            <p>Apar aici toate jocurile care intră într-un prag, cu ora și prețul de atunci.</p>
          </div>
        ) : (
          <div className="deals">
            {shown.map((e) => (
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
                    {e.watched && <span className="event-time">★ urmărit</span>}
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
