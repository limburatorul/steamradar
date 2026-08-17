import type { PriceSeries } from '@shared/types'

/**
 * Graficul de pret, desenat direct in SVG.
 *
 * E in **trepte**, nu cu linii oblice intre puncte: un pret nu urca lin de la
 * 20 la 40 intr-o saptamana, ci sta la 20 pana in clipa in care sare la 40.
 * O linie oblica ar sugera preturi care n-au existat niciodata.
 *
 * Punctele se scriu doar cand pretul se schimba (vezi `history.ts`), deci ultima
 * treapta se prelungeste pana in momentul de fata, care e mereu "acum".
 */

const W = 760
const H = 200
const PAD_L = 52
const PAD_R = 14
const PAD_T = 14
const PAD_B = 26

interface Props {
  series: PriceSeries
  currency: string
}

function money(cents: number, currency: string): string {
  return cents <= 0 ? 'free' : `${(cents / 100).toFixed(2)}${currency}`
}

export default function PriceChart({ series, currency }: Props): React.JSX.Element {
  const pts = series.points
  if (pts.length === 0) {
    return <div className="empty">No price points recorded yet.</div>
  }

  const now = Math.floor(Date.now() / 1000)
  const t0 = pts[0][0]
  // un singur punct n-are interval; ii dau o zi, ca sa nu impart la zero
  const t1 = Math.max(now, t0 + 86400)
  const span = Math.max(1, t1 - t0)

  const prices = pts.map((p) => p[1])
  const listPrice = series.listPrice ?? 0
  const maxPrice = Math.max(listPrice, ...prices, 1)
  // scara porneste de la zero: un joc care ajunge gratis trebuie sa atinga baza
  const scaleY = (cents: number): number => H - PAD_B - (cents / maxPrice) * (H - PAD_T - PAD_B)
  const scaleX = (t: number): number => PAD_L + ((t - t0) / span) * (W - PAD_L - PAD_R)

  // linia in trepte: orizontal pana la momentul schimbarii, apoi vertical
  let path = ''
  pts.forEach((p, i) => {
    const x = scaleX(p[0])
    const y = scaleY(p[1])
    if (i === 0) {
      path = `M ${x} ${y}`
      return
    }
    path += ` H ${x} V ${y}`
  })
  // ultima treapta tine pana acum
  path += ` H ${scaleX(t1)}`

  const areaPath = `${path} V ${H - PAD_B} H ${scaleX(t0)} Z`

  const low = Math.min(...prices)
  const lowPoint = pts[prices.indexOf(low)]
  const current = pts[pts.length - 1]

  const ticks = [0, 0.5, 1].map((f) => Math.round(maxPrice * f))
  const dateLabel = (t: number): string =>
    new Date(t * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

  return (
    <div className="chart-wrap">
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(var(--accent-rgb), 0.35)" />
            <stop offset="100%" stopColor="rgba(var(--accent-rgb), 0.02)" />
          </linearGradient>
        </defs>

        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={scaleY(v)}
              y2={scaleY(v)}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
            <text
              x={PAD_L - 8}
              y={scaleY(v) + 4}
              textAnchor="end"
              fill="var(--text-2)"
              fontSize="11"
            >
              {money(v, currency)}
            </text>
          </g>
        ))}

        {listPrice > 0 && (
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={scaleY(listPrice)}
            y2={scaleY(listPrice)}
            stroke="var(--text-2)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        )}

        <path d={areaPath} fill="url(#fill)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />

        {pts.map((p, i) => (
          <circle
            key={i}
            cx={scaleX(p[0])}
            cy={scaleY(p[1])}
            r={p[1] <= 0 ? 4 : 3}
            fill={p[1] <= 0 ? 'var(--free)' : 'var(--accent-light)'}
          />
        ))}

        <text x={PAD_L} y={H - 8} fill="var(--text-2)" fontSize="11">
          {dateLabel(t0)}
        </text>
        <text x={W - PAD_R} y={H - 8} textAnchor="end" fill="var(--text-2)" fontSize="11">
          now
        </text>
      </svg>

      <div className="chart-legend">
        <span>
          now <b>{money(current[1], currency)}</b>
          {current[2] > 0 && ` (-${current[2]}%)`}
        </span>
        <span>
          lowest seen <b>{money(low, currency)}</b> on {dateLabel(lowPoint[0])}
        </span>
        {listPrice > 0 && (
          <span>
            list price <b>{money(listPrice, currency)}</b>
          </span>
        )}
        <span>
          {pts.length} {pts.length === 1 ? 'change' : 'changes'} since {dateLabel(t0)}
        </span>
      </div>
    </div>
  )
}
