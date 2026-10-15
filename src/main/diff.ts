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

/** Numele redus la litere si cifre, ca "DOOM™: Eternal" si "Doom Eternal" sa fie acelasi joc. */
export function normName(name: string): string {
  // lowercase inainte de NFKD: asa "™" devine "TM" mare si cade odata cu restul semnelor
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')
}

/**
 * Jocurile pe care omul le are deja in Shelf, din `shelf.games.json`. Fisierul e
 * al altei aplicatii, deci orice forma ciudata inseamna "nimic detinut".
 *
 * Potrivirea e intai pe appid-ul Steam; numele normalizat conteaza doar cand una
 * dintre parti n-are appid (un joc GOG, sau un joc din Shelf luat de pe Epic) -
 * altfel "Doom" din 2016 s-ar potrivi cu "DOOM" din 1993.
 */
export function shelfOwned(
  shelf: unknown
): (d: { store: string; appid: number | null; name: string }) => boolean {
  const games = (shelf as { games?: unknown } | null)?.games
  const ids = new Set<number>()
  const noIdNames = new Set<string>()
  const allNames = new Set<string>()
  for (const g of Array.isArray(games) ? games : []) {
    if (!g || typeof g.name !== 'string') continue
    const n = normName(g.name)
    if (!n) continue
    allNames.add(n)
    if (Number.isInteger(g.steamAppId) && g.steamAppId > 0) ids.add(g.steamAppId)
    else noIdNames.add(n)
  }
  return (d) => {
    const n = normName(d.name)
    if (d.store === 'steam' && d.appid) return ids.has(d.appid) || noIdNames.has(n)
    return allNames.has(n)
  }
}

/** Intrarile care chiar suna: pragul e pornit, GOG e pornit, si jocul nu e deja in Shelf. */
export function toNotify(
  events: DealEvent[],
  cfg: AppConfig,
  owned: (e: DealEvent) => boolean
): DealEvent[] {
  // un joc detinut ramane in istoric, doar nu mai trimite notificare
  return events.filter(
    (e) => cfg.notify[e.tier] && (e.store !== 'gog' || cfg.notifyGog) && !owned(e)
  )
}
