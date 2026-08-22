import { useEffect, useState } from 'react'
import type { Deal, WatchItem } from '@shared/types'
import DealRow from '../components/DealRow'
import { timeAgo } from '../format'

interface Props {
  watchlist: WatchItem[]
  onToggleWatch: (deal: Deal) => void
  onOpen: (deal: Deal) => void
  onUpdate: (key: string, patch: Partial<WatchItem>) => void
  refreshKey: number
}

/**
 * Lista de urmarire e singurul loc care alerteaza si la scaderi care nu ating
 * niciun prag: daca ai pus ochii pe un joc de 40, vrei sa stii cand ajunge la
 * 24, chiar daca nu intra nici macar sub 10.
 */
export default function WatchlistView({
  watchlist,
  onToggleWatch,
  onOpen,
  onUpdate,
  refreshKey
}: Props): React.JSX.Element {
  const [current, setCurrent] = useState<Map<string, Deal>>(new Map())

  useEffect(() => {
    if (!watchlist.length) {
      setCurrent(new Map())
      return
    }
    void window.api.deals.lookup(watchlist.map((w) => w.key)).then((deals) => {
      setCurrent(new Map(deals.map((d) => [d.key, d])))
    })
  }, [watchlist, refreshKey])

  const asDeal = (w: WatchItem): Deal =>
    current.get(w.key) ?? {
      key: w.key,
      store: w.store,
      appid: w.appid,
      kind: 'app',
      name: w.name,
      url: w.url,
      image: w.image,
      released: null,
      priceFinal: w.priceAtAdd ?? 0,
      priceOriginal: 0,
      discountPct: 0,
      priceText: w.priceTextAtAdd ?? '—',
      priceOriginalText: null,
      discountEndsAt: null,
      reviewSummary: null,
      reviewPct: null,
      reviewCount: null,
      platforms: { win: true, mac: false, linux: false }
    }

  return (
    <>
      <div className="toolbar">
        <h1>Watchlist</h1>
        <span className="sub">{watchlist.length} games</span>
      </div>

      <div className="content">
        {watchlist.length === 0 ? (
          <div className="empty">
            <h3>You are not watching any game</h3>
            <p>
              Hit the star on any deal. Watched games alert you on every price drop, not only when
              they cross a threshold — and you can give each one your own target price.
            </p>
          </div>
        ) : (
          <div className="deals">
            {watchlist.map((w) => {
              const deal = asDeal(w)
              const onSale = current.has(w.key)
              return (
                <DealRow
                  key={w.key}
                  deal={deal}
                  watched
                  onToggleWatch={onToggleWatch}
                  onOpen={onOpen}
                  aside={
                    <>
                      <span className="event-time">added {timeAgo(w.addedAt)}</span>
                      {!onSale && <span className="event-time">not on sale right now</span>}
                      <label className="note" style={{ display: 'flex', gap: 5 }}>
                        target
                        <input
                          type="number"
                          min={0}
                          step={1}
                          style={{ width: 62, padding: '2px 6px' }}
                          value={w.targetPrice ?? ''}
                          placeholder="—"
                          onChange={(e) =>
                            onUpdate(w.key, {
                              targetPrice: e.target.value === '' ? null : Number(e.target.value)
                            })
                          }
                        />
                      </label>
                    </>
                  }
                />
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
