import type { Deal, DealEvent } from '@shared/types'

/** O intrare de istoric arata la fel ca o oferta, deci o randez cu acelasi rand. */
export function eventToDeal(e: DealEvent): Deal {
  return {
    key: e.key,
    appid: e.appid,
    kind: 'app',
    name: e.name,
    url: e.url,
    image: e.image,
    released: null,
    priceFinal: e.priceFinal,
    priceOriginal: 0,
    discountPct: e.discountPct,
    priceText: e.priceText,
    priceOriginalText: e.priceOriginalText,
    discountEndsAt: null,
    reviewSummary: e.reviewSummary,
    reviewPct: e.reviewPct,
    reviewCount: e.reviewCount,
    platforms: { win: true, mac: false, linux: false }
  }
}

/** Steam e interogat mereu in engleza, ca sa pot citi acelasi tipar indiferent
 *  de tara; eticheta o traduc aici, la afisare. */
const REVIEWS: Record<string, string> = {
  'Overwhelmingly Positive': 'Copleșitor pozitive',
  'Very Positive': 'Foarte pozitive',
  Positive: 'Pozitive',
  'Mostly Positive': 'Majoritar pozitive',
  Mixed: 'Mixte',
  'Mostly Negative': 'Majoritar negative',
  Negative: 'Negative',
  'Very Negative': 'Foarte negative',
  'Overwhelmingly Negative': 'Copleșitor negative',
  'Need more user reviews to generate a score': 'Prea puține recenzii'
}

export function reviewLabel(summary: string | null): string | null {
  if (!summary) return null
  // jocurile cu foarte putine recenzii n-au eticheta, ci chiar textul
  // "6 user reviews"; procentul si numarul se arata oricum langa, deci il sar
  if (/^[\d,. ]+ user reviews$/i.test(summary)) return null
  return REVIEWS[summary] ?? summary
}

export function reviewTone(pct: number | null): string {
  if (pct == null) return ''
  if (pct >= 70) return 'positive'
  if (pct >= 40) return 'mixed'
  return 'negative'
}

export function count(n: number | null): string {
  return n == null ? '' : n.toLocaleString('ro-RO')
}

export function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (min < 1) return 'acum'
  if (min < 60) return `acum ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `acum ${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `acum ${d} ${d === 1 ? 'zi' : 'zile'}`
  return new Date(iso).toLocaleDateString('ro-RO')
}

/** Cat mai tine reducerea. Steam da termenul doar pentru o parte din oferte. */
export function endsIn(unix: number | null): string | null {
  if (!unix) return null
  const h = Math.round((unix * 1000 - Date.now()) / 3600_000)
  if (h <= 0) return 'expiră acum'
  if (h < 24) return `încă ${h} h`
  const d = Math.round(h / 24)
  return `încă ${d} ${d === 1 ? 'zi' : 'zile'}`
}

export function clock(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
}
