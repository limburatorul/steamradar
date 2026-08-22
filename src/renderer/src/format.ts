import type { Deal, DealEvent } from '@shared/types'

/** O intrare de istoric arata la fel ca o oferta, deci o randez cu acelasi rand. */
export function eventToDeal(e: DealEvent): Deal {
  return {
    key: e.key,
    store: e.store,
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

/**
 * Steam e interogat mereu in engleza, ca eticheta recenziilor sa aiba acelasi
 * tipar indiferent de tara, deci de tradus nu e nimic - dar jocurile cu foarte
 * putine recenzii n-au eticheta, ci chiar textul "6 user reviews", care ar
 * dubla numarul afisat oricum alaturi.
 */
export function reviewLabel(summary: string | null): string | null {
  if (!summary) return null
  if (/^[\d,. ]+ user reviews$/i.test(summary)) return null
  if (/^Need more user reviews/i.test(summary)) return 'Too few reviews'
  return summary
}

export function reviewTone(pct: number | null): string {
  if (pct == null) return ''
  if (pct >= 70) return 'positive'
  if (pct >= 40) return 'mixed'
  return 'negative'
}

export function count(n: number | null): string {
  return n == null ? '' : n.toLocaleString('en-US')
}

export function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} ${d === 1 ? 'day' : 'days'} ago`
  return new Date(iso).toLocaleDateString('en-GB')
}

/** Cat mai tine reducerea. Steam da termenul doar pentru o parte din oferte. */
export function endsIn(unix: number | null): string | null {
  if (!unix) return null
  const h = Math.round((unix * 1000 - Date.now()) / 3600_000)
  if (h <= 0) return 'ending now'
  if (h < 24) return `${h} h left`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? 'day' : 'days'} left`
}

export function clock(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function num(n: number | null | undefined): string {
  return n == null ? '' : n.toLocaleString('en-US')
}

/** Cat mai e pana la un moment din viitor. Pentru ferestrele Epic. */
export function countdown(iso: string): string {
  const h = Math.round((Date.parse(iso) - Date.now()) / 3600_000)
  if (h <= 0) return 'a moment'
  if (h < 24) return `${h} h`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? 'day' : 'days'}`
}

/** Ora locala, ca sa se vada la ce ora a zilei se schimba oferta Epic. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}
