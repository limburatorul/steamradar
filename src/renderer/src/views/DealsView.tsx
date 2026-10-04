import { useEffect, useState } from 'react'
import type { Deal, Store, Tier } from '@shared/types'
import type { DealQuery, Platform, SortKey } from '@shared/query'
import DealRow from '../components/DealRow'
import { num } from '../format'

const PAGE = 60

const SORTS: Array<{ k: SortKey; label: string }> = [
  { k: 'discount', label: 'Discount' },
  { k: 'price', label: 'Price, low to high' },
  { k: 'priceDesc', label: 'Price, high to low' },
  { k: 'reviewPct', label: 'Review score' },
  { k: 'reviews', label: 'Popularity' },
  { k: 'name', label: 'Name' }
]

interface Props {
  store: Store
  tier: Tier | null
  title: string
  hint: string
  watched: Set<string>
  onToggleWatch: (deal: Deal) => void
  onOpen: (deal: Deal) => void
  /** Se schimba dupa fiecare scanare, ca lista sa se reincarce singura. */
  refreshKey: number
}

export default function DealsView({
  store,
  tier,
  title,
  hint,
  watched,
  onToggleWatch,
  onOpen,
  refreshKey
}: Props): React.JSX.Element {
  const [items, setItems] = useState<Deal[]>([])
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(PAGE)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>(tier === 'free' ? 'reviews' : 'discount')
  const [minDiscount, setMinDiscount] = useState(0)
  const [reviewedOnly, setReviewedOnly] = useState(false)
  const [minReviewPct, setMinReviewPct] = useState(0)
  const [minReviews, setMinReviews] = useState(0)
  const [maxPrice, setMaxPrice] = useState(0)
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [appsOnly, setAppsOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('')

  // filtrele se reseteaza cand schimb sectiunea, altfel as ramane cu setari de
  // la ecranul anterior si lista ar parea goala fara motiv
  useEffect(() => {
    setSort(tier === 'free' ? 'reviews' : 'discount')
    setLimit(PAGE)
    setSearch('')
    setMinDiscount(0)
    setMinReviewPct(0)
    setMinReviews(0)
    setMaxPrice(0)
    setPlatform('')
    setAppsOnly(false)
  }, [tier, store])

  useEffect(() => {
    let alive = true
    const q: DealQuery = {
      store,
      tier,
      search,
      sort,
      minDiscount,
      reviewedOnly,
      minReviewPct,
      minReviews,
      maxPrice: maxPrice || undefined,
      platform: platform || undefined,
      appsOnly,
      limit,
      offset: 0
    }
    // mica intarziere ca sa nu interoghez la fiecare litera tastata
    const t = setTimeout(
      () => {
        setLoading(true)
        void window.api.deals.query(q).then((res) => {
          if (!alive) return
          setItems(res.items)
          setTotal(res.total)
          setCurrency(res.currency)
          setLoading(false)
        })
      },
      search ? 180 : 0
    )
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [
    store,
    tier,
    search,
    sort,
    minDiscount,
    reviewedOnly,
    minReviewPct,
    minReviews,
    maxPrice,
    platform,
    appsOnly,
    limit,
    refreshKey
  ])

  return (
    <>
      <div className="toolbar">
        <h1>{title}</h1>
        <span className="sub">{loading ? 'loading…' : `${num(total)} results`}</span>
        <div className="spacer" />
        <input
          type="search"
          placeholder="Search by name"
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
          <option value={0}>Any discount</option>
          <option value={50}>-50% or more</option>
          <option value={75}>-75% or more</option>
          <option value={90}>-90% or more</option>
        </select>
        <label className="row" style={{ padding: 0, gap: 6 }}>
          <input
            type="checkbox"
            checked={reviewedOnly}
            onChange={(e) => setReviewedOnly(e.target.checked)}
          />
          <span className="note">reviewed only</span>
        </label>

        <div className="filters">
          <select
            aria-label="Minimum review score"
            value={minReviewPct}
            onChange={(e) => {
              setMinReviewPct(Number(e.target.value))
              setLimit(PAGE)
            }}
          >
            <option value={0}>Any review score</option>
            <option value={70}>70% positive or more</option>
            <option value={80}>80% positive or more</option>
            <option value={90}>90% positive or more</option>
          </select>
          <select
            aria-label="Minimum number of reviews"
            value={minReviews}
            onChange={(e) => {
              setMinReviews(Number(e.target.value))
              setLimit(PAGE)
            }}
          >
            <option value={0}>Any number of reviews</option>
            <option value={50}>50+ reviews</option>
            <option value={500}>500+ reviews</option>
            <option value={5000}>5,000+ reviews</option>
          </select>
          <select
            aria-label="Maximum price"
            value={maxPrice}
            onChange={(e) => {
              setMaxPrice(Number(e.target.value))
              setLimit(PAGE)
            }}
          >
            <option value={0}>Any price</option>
            <option value={100}>Up to 1 {currency}</option>
            <option value={200}>Up to 2 {currency}</option>
            <option value={300}>Up to 3 {currency}</option>
          </select>
          <select
            aria-label="Platform"
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value as Platform | '')
              setLimit(PAGE)
            }}
          >
            <option value="">Any platform</option>
            <option value="win">Windows</option>
            <option value="mac">macOS</option>
            <option value="linux">Linux</option>
          </select>
          <label className="row" style={{ padding: 0, gap: 6 }}>
            <input
              type="checkbox"
              checked={appsOnly}
              onChange={(e) => {
                setAppsOnly(e.target.checked)
                setLimit(PAGE)
              }}
            />
            <span className="note">games only (no DLC or bundles)</span>
          </label>
        </div>
      </div>

      <div className="content">
        {!loading && !items.length ? (
          <div className="empty">
            <h3>Nothing here</h3>
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
                onOpen={onOpen}
              />
            ))}
          </div>
        )}

        {items.length < total && (
          <div className="load-more">
            <button onClick={() => setLimit(limit + PAGE * 2)}>
              Show {Math.min(PAGE * 2, total - items.length)} more
            </button>
          </div>
        )}
      </div>
    </>
  )
}
