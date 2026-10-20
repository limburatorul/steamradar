import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
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

/* ------------------------------------------------- folderul comun (cititor) */

/**
 * Peste atat, un fisier din folderul comun e gunoi, nu o biblioteca: 16 MB de
 * JSON inseamna zeci de mii de jocuri cu tot cu salvari, si JSON.parse pe el
 * tine procesul principal ocupat o fractiune de secunda la fiecare scanare.
 */
const MAX_SHARED_BYTES = 16 * 1024 * 1024
const DAY = 86_400_000

/** Un fisier al altei aplicatii: JSON cu schema 1, sub plafon. Orice altceva = absent. */
export async function readShared(file: string): Promise<Record<string, unknown> | null> {
  try {
    if ((await fs.stat(file)).size > MAX_SHARED_BYTES) return null
    // contractul cere UTF-8 fara BOM, dar Notepad si PowerShell 5 il pun; JSON.parse nu-l inghite
    const json = JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    return json && typeof json === 'object' && json.schema === 1 ? json : null
  } catch {
    return null
  }
}

/**
 * Un exe local, pe o litera de disc. Calea vine din fisierul altei aplicatii:
 * o cale UNC (`\\server\...`) sau de dispozitiv (`\\?\`, `\\.\`) ar face
 * Windows sa contacteze serverul doar ca sa raspunda la existsSync, deci o
 * refuz inainte de orice acces la disc.
 */
export function localExe(p: unknown): p is string {
  return typeof p === 'string' && /^[A-Za-z]:[\\/]/.test(p) && /\.exe$/i.test(p)
}

/** Cartea unei aplicatii instalate: exe-ul ei local inca exista. */
export function installed(card: Record<string, unknown> | null): boolean {
  return !!card && localExe(card.exe) && existsSync(card.exe)
}

/**
 * `shelf.games.json`, doar daca Shelf e instalat (cartea lui exista si exe-ul e
 * pe disc). Un fisier ramas de la un Shelf dezinstalat nu conteaza.
 */
export async function readShelf(root: string): Promise<Record<string, unknown> | null> {
  const card = await readShared(path.join(root, 'apps', 'shelf.json'))
  if (card?.id !== 'shelf' || !installed(card)) return null
  return readShared(path.join(root, 'data', 'shelf.games.json'))
}

/* ------------------------------------------------- folderul comun (scriitor) */

/**
 * Shelf ascunde ofertele din `steamradar.watch.json` cand `updated` are peste
 * 48 h, deci fisierul se rescrie si fara schimbari cat ruleaza aplicatia. La 12 h,
 * chiar si doua rescrieri pierdute (PC adormit, disc ocupat) raman sub prag.
 */
export const WATCH_SHARE_EVERY_MS = 12 * 3_600_000

/** Shelf potriveste doar pe appid intreg; orice altceva (text, null, gunoi) nu se scrie. */
export function shareAppid(v: unknown): number | undefined {
  return Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) : undefined
}

export interface ShelfIndex {
  /** Appid-urile Steam ale jocurilor din Shelf. */
  ids: Set<number>
  /** Numele normalizate ale jocurilor fara appid (GOG, Epic, manuale). */
  noIdNames: Set<string>
  allNames: Set<string>
}

/**
 * Ce jocuri are omul in Shelf. Fisierul e al altei aplicatii, deci orice forma
 * ciudata inseamna "nimic detinut". Vechimea nu conteaza: Shelf rescrie fisierul
 * doar la pornire si cand biblioteca se schimba, iar un joc detinut ramane detinut
 * si daca Shelf n-a fost deschis de o luna.
 */
export function shelfIndex(shelf: unknown, now = Date.now()): ShelfIndex {
  const out: ShelfIndex = { ids: new Set(), noIdNames: new Set(), allNames: new Set() }
  const s = shelf as { schema?: unknown; updated?: unknown; games?: unknown } | null
  if (!s || typeof s !== 'object' || s.schema !== 1) return out
  // `updated` e obligatoriu si valid; o zi in viitor e toleranta pentru ceasuri
  // decalate, mai mult inseamna un fisier fabricat, nu scris de Shelf
  const age = now - Date.parse(typeof s.updated === 'string' ? s.updated : '')
  if (!(age > -DAY)) return out
  for (const g of Array.isArray(s.games) ? s.games : []) {
    if (!g || typeof g.name !== 'string' || g.name.length > 500) continue
    const n = normName(g.name)
    if (!n) continue
    out.allNames.add(n)
    if (Number.isSafeInteger(g.steamAppId) && g.steamAppId > 0) out.ids.add(g.steamAppId)
    else out.noIdNames.add(n)
  }
  return out
}

/**
 * Predicatul "il ai deja in Shelf". Potrivirea e intai pe appid-ul Steam; numele
 * normalizat conteaza doar cand una dintre parti n-are appid (un joc GOG, sau un
 * joc din Shelf luat de pe Epic) - altfel "Doom" din 2016 s-ar potrivi cu "DOOM"
 * din 1993.
 */
export function shelfOwned(
  shelf: unknown,
  now = Date.now()
): (d: { store: string; appid: number | null; name: string }) => boolean {
  const { ids, noIdNames, allNames } = shelfIndex(shelf, now)
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
