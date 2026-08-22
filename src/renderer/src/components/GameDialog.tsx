import { useEffect, useState } from 'react'
import type { Deal, PriceSeries } from '@shared/types'
import { STORE_LABEL } from '@shared/types'
import PriceChart from './PriceChart'
import { count, endsIn, reviewLabel, reviewTone } from '../format'

interface Props {
  deal: Deal
  currency: string
  watched: boolean
  onToggleWatch: (deal: Deal) => void
  onClose: () => void
}

/**
 * Fereastra unui joc: capul cu datele de acum, apoi evolutia pretului.
 * Istoricul exista doar pentru jocurile care au ajuns macar o data intr-un prag
 * sau sunt urmarite - vezi `history.ts` pentru de ce nu le tin pe toate.
 */
export default function GameDialog({
  deal,
  currency,
  watched,
  onToggleWatch,
  onClose
}: Props): React.JSX.Element {
  const [series, setSeries] = useState<PriceSeries | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void window.api.history.get(deal.key).then((s) => {
      setSeries(s)
      setLoading(false)
    })
  }, [deal.key])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const free = deal.priceFinal <= 0

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          {deal.image && <img src={deal.image} alt="" />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{deal.name}</h2>
            <div className="deal meta" style={{ background: 'none', border: 0, padding: 0 }}>
              <div className="meta">
                {deal.reviewPct != null && (
                  <span className={`reviews ${reviewTone(deal.reviewPct)}`}>
                    {[
                      reviewLabel(deal.reviewSummary),
                      `${deal.reviewPct}% of ${count(deal.reviewCount)}`
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
                {deal.released && <span>{deal.released}</span>}
                {endsIn(deal.discountEndsAt) && <span>{endsIn(deal.discountEndsAt)}</span>}
              </div>
            </div>
          </div>
          <div className="price">
            {deal.priceOriginalText && <div className="old">{deal.priceOriginalText}</div>}
            <div className={`now${free ? ' free' : ''}`}>{free ? 'FREE' : deal.priceText}</div>
            {deal.discountPct > 0 && (
              <span className="badge small">-{deal.discountPct}%</span>
            )}
          </div>
          <button className="ghost" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="dialog-body">
          {loading ? (
            <div className="empty">Loading price history…</div>
          ) : series && series.points.length ? (
            <PriceChart series={series} currency={currency} />
          ) : (
            <div className="empty">
              <h3>No price history yet</h3>
              <p>
                History starts the moment a game first drops into a threshold, or the moment you
                add it to the watchlist. From then on every price change is recorded.
              </p>
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button
            className="primary"
            onClick={() => {
              if (deal.store === 'steam') void window.api.openInSteam(deal.appid, deal.url)
              else void window.api.openExternal(deal.url)
            }}
          >
            Open in {STORE_LABEL[deal.store]}
          </button>
          <button onClick={() => void window.api.openExternal(deal.url)}>Store page in browser</button>
          <button className={watched ? 'danger' : ''} onClick={() => onToggleWatch(deal)}>
            {watched ? '★ Stop watching' : '☆ Watch this game'}
          </button>
        </div>
      </div>
    </div>
  )
}
