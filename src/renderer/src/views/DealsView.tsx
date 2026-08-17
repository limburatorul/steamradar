import { useEffect, useState } from 'react'
import type { Deal, Tier } from '@shared/types'
import type { DealQuery, SortKey } from '@shared/query'
import DealRow from '../components/DealRow'

const PAGE = 60

const SORTS: Array<{ k: SortKey; label: string }> = [
  { k: 'discount', label: 'Reducere' },
  { k: 'price', label: 'Preț crescător' },
  { k: 'priceDesc', label: 'Preț descrescător' },
  { k: 'reviewPct', label: 'Scor recenzii' },
  { k: 'reviews', label: 'Popularitate' },
  { k: 'name', label: 'Nume' }
]

interface Props {
  tier: Tier | null
  title: string
  hint: string
  watched: Set<string>
  onToggleWatch: (deal: Deal) => void
  /** Se schimba dupa fiecare scanare, ca lista sa se reincarce singura. */
  refreshKey: number
}

export default function DealsView({
  tier,
  title,
  hint,
  watched,
  onToggleWatch,
  refreshKey
}: Props): React.JSX.Element {
  const [items, setItems] = useState<Deal[]>([])
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(PAGE)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>(tier === 'free' ? 'reviews' : 'discount')
  const [minDiscount, setMinDiscount] = useState(0)
  const [reviewedOnly, setReviewedOnly] = useState(false)
  const [loading, setLoading] = useState(true)

  // pragul si sortarea se reseteaza cand schimb sectiunea, altfel as ramane cu
  // filtre de la ecranul anterior si lista ar parea goala fara motiv
  useEffect(() => {
    setSort(tier === 'free' ? 'reviews' : 'discount')
    setLimit(PAGE)
    setSearch('')
    setMinDiscount(0)
  }, [tier])

  useEffect(() => {
    let alive = true
    const q: DealQuery = { tier, search, sort, minDiscount, reviewedOnly, limit, offset: 0 }
    // mica intarziere ca sa nu interoghez la fiecare litera tastata
    const t = setTimeout(() => {
      setLoading(true)
      void window.api.deals.query(q).then((res) => {
        if (!alive) return
        setItems(res.items)
        setTotal(res.total)
        setLoading(false)
      })
    }, search ? 180 : 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [tier, search, sort, minDiscount, reviewedOnly, limit, refreshKey])

  return (
    <>
      <div className="toolbar">
        <h1>{title}</h1>
        <span className="sub">
          {loading ? 'se încarcă…' : `${total.toLocaleString('ro-RO')} rezultate`}
        </span>
        <div className="spacer" />
        <input
          type="search"
          placeholder="Caută după nume"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setLimit(PAGE)
          }}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {SORTS.map((s) => (
            <option key={s.k} value={s.k}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={minDiscount}
          onChange={(e) => {
            setMinDiscount(Number(e.target.value))
            setLimit(PAGE)
          }}
        >
          <option value={0}>Orice reducere</option>
          <option value={50}>-50% sau mai mult</option>
          <option value={75}>-75% sau mai mult</option>
          <option value={90}>-90% sau mai mult</option>
        </select>
        <label className="row" style={{ padding: 0, gap: 6 }}>
          <input
            type="checkbox"
            checked={reviewedOnly}
            onChange={(e) => setReviewedOnly(e.target.checked)}
          />
          <span className="note">doar cu recenzii</span>
        </label>
      </div>

      <div className="content">
        {!loading && !items.length ? (
          <div className="empty">
            <h3>Nimic aici</h3>
            <p>{hint}</p>
          </div>
        ) : (
          <div className="deals">
            {items.map((d) => (
              <DealRow
                key={d.key}
                deal={d}
                watched={watched.has(d.key)}
                onToggleWatch={onToggleWatch}
              />
            ))}
          </div>
        )}

        {items.length < total && (
          <div className="load-more">
            <button onClick={() => setLimit(limit + PAGE * 2)}>
              Mai arată {Math.min(PAGE * 2, total - items.length)}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
