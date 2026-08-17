import type { Deal, Tier } from './types'

export type SortKey = 'discount' | 'price' | 'priceDesc' | 'reviews' | 'reviewPct' | 'name'

export interface DealQuery {
  /** Gol = tot catalogul, indiferent de prag. */
  tier?: Tier | null
  search?: string
  minDiscount?: number
  minReviewPct?: number
  minReviews?: number
  /** Ascunde jocurile fara recenzii, care sunt aproape mereu zgomot. */
  reviewedOnly?: boolean
  sort?: SortKey
  offset?: number
  limit?: number
}

export interface DealQueryResult {
  items: Deal[]
  total: number
  currency: string
  updatedAt: string | null
}

/**
 * Filtrarea si sortarea se fac in procesul principal, pe catalogul intreg
 * (~10.000 de oferte), si trimit spre interfata doar felia ceruta. Altfel as
 * trece cateva megaocteti prin IPC la fiecare tastare in caseta de cautare.
 */
export function applyQuery(deals: Deal[], q: DealQuery, thresholds: [number, number]): Deal[] {
  const [low, high] = thresholds
  const needle = q.search?.trim().toLowerCase()

  const filtered = deals.filter((d) => {
    if (q.tier === 'free' && d.priceFinal > 0) return false
    if (q.tier === 'under5' && (d.priceFinal <= 0 || d.priceFinal >= low * 100)) return false
    if (q.tier === 'under10' && (d.priceFinal <= 0 || d.priceFinal >= high * 100)) return false
    if (q.minDiscount && d.discountPct < q.minDiscount) return false
    if (q.reviewedOnly && d.reviewCount == null) return false
    if (q.minReviews && (d.reviewCount ?? 0) < q.minReviews) return false
    if (q.minReviewPct && (d.reviewPct ?? 0) < q.minReviewPct) return false
    if (needle && !d.name.toLowerCase().includes(needle)) return false
    return true
  })

  const sorted = [...filtered]
  switch (q.sort ?? 'discount') {
    case 'discount':
      sorted.sort((a, b) => b.discountPct - a.discountPct || a.priceFinal - b.priceFinal)
      break
    case 'price':
      sorted.sort((a, b) => a.priceFinal - b.priceFinal || b.discountPct - a.discountPct)
      break
    case 'priceDesc':
      sorted.sort((a, b) => b.priceFinal - a.priceFinal)
      break
    case 'reviews':
      sorted.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))
      break
    case 'reviewPct':
      sorted.sort(
        (a, b) => (b.reviewPct ?? 0) - (a.reviewPct ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
      )
      break
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name))
      break
  }
  return sorted
}
