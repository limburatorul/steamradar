import { randomUUID } from 'node:crypto'
import type { AppConfig, Deal, DealEvent, Tier } from '../shared/types'

export const RANK: Record<Tier, number> = { free: 0, under5: 1, under10: 2 }

/** Pragul in care cade un pret, sau null daca e peste ambele. */
export function tierOf(priceFinal: number, cfg: AppConfig): Tier | null {
  if (priceFinal <= 0) return 'free'
  if (priceFinal < cfg.thresholdLow * 100) return 'under5'
  if (priceFinal < cfg.thresholdHigh * 100) return 'under10'
  return null
}

/** Ce s-a schimbat fata de fotografia precedenta, tradus in intrari de istoric. */
export function diff(deals: Deal[], previous: Map<string, Deal>, cfg: AppConfig): DealEvent[] {
  const out: DealEvent[] = []
  const at = new Date().toISOString()

  for (const d of deals) {
    const now = tierOf(d.priceFinal, cfg)
    if (!now) continue
    // un joc ascuns din liste nu trimite nici alerta, nici intrare in istoric
    if (d.adult && !cfg.showAdult) continue

    const before = previous.get(d.key)
    const was = before ? tierOf(before.priceFinal, cfg) : null

    // alertez doar cand jocul coboara intr-un prag mai bun decat cel in care era;
    // altfel as repeta acelasi joc la fiecare scanare cat timp sta la reducere
    if (was && RANK[was] <= RANK[now]) continue

    out.push({
      id: randomUUID(),
      key: d.key,
      store: d.store,
      name: d.name,
      appid: d.appid,
      url: d.url,
      image: d.image,
      tier: now,
      priceFinal: d.priceFinal,
      priceText: d.priceText,
      priceOriginalText: d.priceOriginalText,
      discountPct: d.discountPct,
      reviewSummary: d.reviewSummary,
      reviewPct: d.reviewPct,
      reviewCount: d.reviewCount,
      at,
      fromTier: was,
      fromPriceText: before?.priceText ?? null,
      watched: false,
      seen: false
    })
  }

  // gratis intai, apoi cele mai mari reduceri
  return out.sort((a, b) => RANK[a.tier] - RANK[b.tier] || b.discountPct - a.discountPct)
}
