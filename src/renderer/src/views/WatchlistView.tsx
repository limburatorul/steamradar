import { useEffect, useState } from 'react'
import type { Deal, WatchItem } from '@shared/types'
import DealRow from '../components/DealRow'
import { timeAgo } from '../format'

interface Props {
  watchlist: WatchItem[]
  onToggleWatch: (deal: Deal) => void
  onUpdate: (key: string, patch: Partial<WatchItem>) => void
  refreshKey: number
}

/**
 * Lista de urmarire e singurul loc care alerteaza si la scaderi care nu ating
 * niciun prag: daca ai pus ochii pe un joc de 40 EUR, vrei sa stii cand ajunge
 * la 24 EUR, chiar daca nu intra nici macar sub 10.
 */
export default function WatchlistView({
  watchlist,
  onToggleWatch,
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
        <h1>Urmărite</h1>
        <span className="sub">{watchlist.length} jocuri</span>
      </div>

      <div className="content">
        {watchlist.length === 0 ? (
          <div className="empty">
            <h3>Nu urmărești niciun joc</h3>
            <p>
              Apasă steaua de pe orice ofertă. Jocurile urmărite te anunță la orice scădere de
              preț, nu doar când trec de praguri — și le poți pune un preț țintă al tău.
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
                  aside={
                    <>
                      <span className="event-time">adăugat {timeAgo(w.addedAt)}</span>
                      {!onSale && <span className="event-time">nu e la reducere acum</span>}
                      <label className="note" style={{ display: 'flex', gap: 5 }}>
                        țintă
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
