import { randomUUID } from 'node:crypto'
import type { AppConfig, Deal, DealEvent, EpicFreeGame, ScanStatus, Tier } from '../shared/types'
import { loadConfig } from './config'
import { recordScan, startTracking } from './history'
import { notifyEpic, notifyEvents, notifyWatch } from './notify'
import { StoreHttpError } from './http'
import {
  addEvents,
  claimEpicNotice,
  getCatalog,
  getEpic,
  getWatchlist,
  isSeeded,
  saveCatalog,
  saveEpic,
  updateWatch
} from './store'
import { currencyOf, fetchDiscountedPage, fetchFreeToKeep, QUERY_PAGE } from './steam'
import { fetchGogGiveaway, fetchGogPage, GOG_PAGE } from './gog'
import { fetchEpicFreeGames } from './epic'

/**
 * Scanarea si compararea.
 *
 * Trei magazine, doua feluri de date. Steam si GOG dau preturi, deci trec prin
 * acelasi catalog, aceleasi praguri si acelasi istoric - se deosebesc doar prin
 * campul `store`. Epic nu are reduceri de citit (vezi `epic.ts`), ci doar jocuri
 * gratuite cu o fereastra de timp, deci merge pe langa, cu anunturile lui.
 *
 * O maturare completa inseamna ~44 de cereri si un minut: 12 pagini de 500 la
 * Steam, 30 de pagini de 100 la GOG, plus cate una pentru jocurile devenite
 * gratis, pentru giveaway-ul GOG si pentru Epic. Sortarea dupa reducere nu exista la Steam, dar nici nu e
 * nevoie - avand tot setul in mana, si pragurile, si topul reducerilor se
 * calculeaza local.
 *
 * Verificarea jocurilor gratis costa o singura cerere si ruleaza mult mai des
 * decat maturarea completa, fiindca acolo se pierde cel mai mult daca afli tarziu.
 */

const RANK: Record<Tier, number> = { free: 0, under5: 1, under10: 2 }

let running = false
let abort: AbortController | null = null
let fullTimer: NodeJS.Timeout | null = null
let freeTimer: NodeJS.Timeout | null = null
// mai multi ascultatori: unul trimite starea in fereastra, altul reimprospateaza
// meniul din tray. Cu o singura referinta, al doilea l-ar sterge pe primul.
const listeners = new Set<(s: ScanStatus) => void>()

let status: ScanStatus = {
  phase: 'idle',
  page: 0,
  totalPages: 0,
  found: 0,
  message: 'Idle',
  lastFullScan: null,
  lastFreeScan: null,
  lastEpicScan: null,
  nextScanAt: null,
  error: null
}

export function getStatus(): ScanStatus {
  return status
}

export function onStatus(cb: (s: ScanStatus) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function setStatus(patch: Partial<ScanStatus>): void {
  status = { ...status, ...patch }
  for (const cb of listeners) cb(status)
}

export function tierOf(priceFinal: number, cfg: AppConfig): Tier | null {
  if (priceFinal <= 0) return 'free'
  if (priceFinal < cfg.thresholdLow * 100) return 'under5'
  if (priceFinal < cfg.thresholdHigh * 100) return 'under10'
  return null
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Reincearca la 429 si la erorile de server. Steam raspunde 429 dupa vreo 20 de
 * cereri intr-o rafala si isi revine in 15-30 de secunde, deci abandonarea
 * scanarii ar fi o risipa: mai bine astept si continui de unde am ramas.
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  signal: AbortSignal
): Promise<T> {
  const waits = [15_000, 30_000, 60_000]
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const http = err instanceof StoreHttpError ? err : null
      if (signal.aborted || !http?.retryable || attempt >= waits.length) throw err
      const wait = http.retryAfterMs ?? waits[attempt]
      setStatus({ message: `${label} — rate-limited, retrying in ${Math.round(wait / 1000)}s` })
      await sleep(wait)
      if (signal.aborted) throw err
    }
  }
}

/* ---------------------------------------------------------------- scanarea */

/** Scanarea rapida: doar ce e la -100% acum. O cerere, deci o pot face des. */
export async function scanFree(): Promise<DealEvent[]> {
  if (running) return []
  running = true
  abort = new AbortController()
  const signal = abort.signal
  try {
    const cfg = await loadConfig()
    setStatus({ phase: 'free', message: 'Checking for games that went free', error: null })

    const fresh = await withRetry(
      'Free games',
      () => fetchFreeToKeep(cfg.countryCode, signal),
      signal
    )

    const gift = await gogGiveaway(signal)
    if (gift) fresh.push(gift)

    const cat = await getCatalog()
    const seeded = cat.updatedAt !== null
    const previous = new Map(cat.deals.map((d) => [d.key, d]))

    // catalogul pastreaza restul ofertelor neatinse; inlocuiesc doar zona "gratis"
    const merged = cat.deals.filter((d) => d.priceFinal > 0)
    merged.push(...fresh)

    const events = seeded ? diff(fresh, previous, cfg) : []
    await saveCatalog(sortDeals(merged), cat.currency)
    await commit(events, fresh, cfg, false)

    await epicCheck(cfg, signal)

    setStatus({
      phase: 'idle',
      message: `${fresh.length} ${fresh.length === 1 ? 'game is' : 'games are'} free right now`,
      lastFreeScan: new Date().toISOString(),
      found: fresh.length
    })
    return events
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus({ phase: 'error', message: 'Check failed', error: msg })
    return []
  } finally {
    running = false
    abort = null
    schedule()
  }
}

/** Scanarea completa: toate jocurile la reducere, in pagini de 500. */
export async function scanFull(): Promise<DealEvent[]> {
  if (running) return []
  running = true
  abort = new AbortController()
  const signal = abort.signal

  try {
    const cfg = await loadConfig()
    const seeded = await isSeeded()
    setStatus({
      phase: 'tiers',
      page: 0,
      totalPages: 0,
      found: 0,
      error: null,
      message: seeded ? 'Scanning deals' : 'First scan, building the baseline'
    })

    const deals: Deal[] = []
    const seen = new Set<string>()
    // sortarea face paginile sa nu se suprapuna, dar oferte pot aparea sau
    // disparea in timpul scanarii, deci verific oricum
    const add = (list: Deal[]): void => {
      for (const d of list) {
        if (seen.has(d.key)) continue
        seen.add(d.key)
        deals.push(d)
      }
    }

    // cererile numara mai departe de la un magazin la altul, ca bara de progres
    // sa arate scanarea intreaga, nu doar bucata de Steam
    let done = 0
    let total = 0

    for (let page = 0; page < cfg.maxPages; page++) {
      if (signal.aborted) break

      const res = await withRetry(
        `Page ${page + 1}`,
        () =>
          fetchDiscountedPage(
            {
              countryCode: cfg.countryCode,
              start: page * QUERY_PAGE,
              includeDlc: cfg.includeDlc,
              minDiscountPct: cfg.minDiscountPct
            },
            signal
          ),
        signal
      )

      done++
      total = Math.min(cfg.maxPages, Math.ceil(res.total / QUERY_PAGE) || 1)
      add(res.deals)

      setStatus({
        page: done,
        totalPages: total,
        found: deals.length,
        message: seeded ? 'Scanning Steam deals' : 'First scan, building the baseline'
      })

      if (res.received < QUERY_PAGE) break
      await sleep(cfg.requestDelayMs)
    }

    if (!deals.length) throw new Error('Steam returned no deals')

    // lista jocurilor la -100% vine din cautarea veche, care e singura care le
    // filtreaza exact; o cerere in plus care face pragul cel mai important sigur
    if (!signal.aborted) {
      setStatus({ phase: 'free', message: 'Checking for games that went free' })
      try {
        const free = await withRetry(
          'Free games',
          () => fetchFreeToKeep(cfg.countryCode, signal),
          signal
        )
        add(free)
      } catch {
        // maturarea completa le prinde oricum pe majoritatea; nu pierd tot
        // catalogul din cauza unei singure cereri esuate
      }
      const gift = await gogGiveaway(signal)
      if (gift) add([gift])
    }

    // GOG intra in acelasi catalog si trece prin aceleasi praguri; difera doar
    // sursa si prefixul cheii
    let gogOk = false
    const gog: Deal[] = []
    if (!signal.aborted) {
      setStatus({ phase: 'gog', message: 'Scanning GOG deals' })
      try {
        for (let page = 1; page <= cfg.maxPages; page++) {
          if (signal.aborted) break

          const res = await withRetry(
            `GOG page ${page}`,
            () =>
              fetchGogPage(
                { countryCode: cfg.countryCode, page, includeDlc: cfg.includeDlc },
                signal
              ),
            signal
          )

          done++
          total = done + Math.max(0, res.pages - page)
          // catalogul GOG n-are filtru de reducere minima in interogare
          gog.push(...res.deals.filter((d) => d.discountPct >= cfg.minDiscountPct))

          setStatus({
            page: done,
            totalPages: total,
            found: deals.length + gog.length,
            message: 'Scanning GOG deals'
          })

          if (page >= res.pages || res.received < GOG_PAGE) break
          await sleep(cfg.requestDelayMs)
        }
        gogOk = !signal.aborted
      } catch {
        // vezi mai jos: mai bine fotografia veche decat una pe jumatate
      }
    }

    // o maturare GOG intrerupta la mijloc ar lasa catalogul fara jumatate din
    // jocurile lui, iar scanarea urmatoare le-ar vedea ca "tocmai au intrat la
    // reducere" si ar trimite mii de alerte false. E acelasi motiv pentru care o
    // scanare Steam oprita nu se salveaza deloc - doar ca aici pot pastra
    // fotografia precedenta a GOG-ului, in loc sa arunc si restul scanarii.
    add(gogOk ? gog : (await getCatalog()).deals.filter((d) => d.store === 'gog'))

    // o scanare oprita la mijloc are un catalog incomplet; daca l-as salva,
    // scanarea urmatoare ar crede ca tot ce lipseste tocmai a intrat la reducere
    // si ar trimite mii de alerte false
    if (signal.aborted) {
      setStatus({ phase: 'idle', message: 'Scan stopped, the catalog was left untouched' })
      return []
    }

    const cat = await getCatalog()
    const previous = new Map(cat.deals.map((d) => [d.key, d]))
    const events = seeded ? diff(deals, previous, cfg) : []

    await saveCatalog(sortDeals(deals), currencyOf(deals))
    await commit(events, deals, cfg, true)
    await epicCheck(cfg, signal)

    setStatus({
      phase: 'idle',
      message: seeded
        ? `${deals.length} deals, ${events.length} new threshold entries`
        : `${deals.length} deals recorded; from now on I alert on changes`,
      lastFullScan: new Date().toISOString(),
      lastFreeScan: new Date().toISOString()
    })
    return events
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus({ phase: 'error', message: 'Scan failed', error: msg })
    return []
  } finally {
    running = false
    abort = null
    schedule()
  }
}

/* ------------------------------------------------------------ Epic si GOG */

/** Cu cat timp inainte de expirare dau ultimul avertisment. */
const EXPIRY_WARNING_MS = 24 * 3600_000

/**
 * Jocurile gratuite de pe Epic: o cerere, si pentru ce e gratis acum, si pentru
 * ce urmeaza. Fiecare anunt pleaca o singura data pe joc, iar la prima
 * verificare doar se construieste referinta - altfel, la prima pornire ai primi
 * deodata si jocurile anuntate pentru peste o luna.
 *
 * Ruleaza pe langa scanarea de preturi, nu in ea: daca Epic tace, catalogul
 * Steam si GOG se salveaza oricum.
 */
async function epicCheck(cfg: AppConfig, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  try {
    setStatus({ phase: 'epic', message: 'Checking Epic free games' })
    const seeded = (await getEpic()).updatedAt !== null
    const games = await withRetry(
      'Epic',
      () => fetchEpicFreeGames(cfg.countryCode, signal),
      signal
    )
    await saveEpic(games)
    setStatus({ lastEpicScan: new Date().toISOString() })

    const soon = Date.now() + EXPIRY_WARNING_MS
    const fresh: EpicFreeGame[] = []
    const upcoming: EpicFreeGame[] = []
    const ending: EpicFreeGame[] = []

    for (const g of games) {
      if (!g.current) {
        if (await claimEpicNotice(g.id, 'upcoming')) upcoming.push(g)
        continue
      }
      if (await claimEpicNotice(g.id, 'free')) fresh.push(g)
      if (Date.parse(g.endsAt) <= soon && (await claimEpicNotice(g.id, 'expiring'))) ending.push(g)
    }

    if (!seeded) return
    if (cfg.notifyEpic.free && fresh.length) notifyEpic('free', fresh, cfg)
    if (cfg.notifyEpic.upcoming && upcoming.length) notifyEpic('upcoming', upcoming, cfg)
    if (cfg.notifyEpic.expiring && ending.length) notifyEpic('expiring', ending, cfg)
  } catch {
    // Epic e o singura cerere pe langa; daca pica, restul scanarii ramane bun
  }
}

/** Giveaway-ul GOG. Raspunde 404 aproape mereu, deci tacerea lui nu e o eroare. */
async function gogGiveaway(signal: AbortSignal): Promise<Deal | null> {
  try {
    return await fetchGogGiveaway(signal)
  } catch {
    return null
  }
}

export function cancelScan(): void {
  abort?.abort()
}

export function isScanning(): boolean {
  return running
}

/* --------------------------------------------------------------- compararea */

/** Ce s-a schimbat fata de fotografia precedenta, tradus in intrari de istoric. */
function diff(deals: Deal[], previous: Map<string, Deal>, cfg: AppConfig): DealEvent[] {
  const out: DealEvent[] = []
  const at = new Date().toISOString()

  for (const d of deals) {
    const now = tierOf(d.priceFinal, cfg)
    if (!now) continue

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

/**
 * Salveaza evenimentele, marcheaza cele urmarite si trimite notificarile.
 *
 * `full` spune daca `deals` e catalogul intreg sau doar felia de jocuri gratis.
 * Conteaza pentru istoricul de pret: acolo, un joc absent din lista inseamna
 * "a iesit din reducere", iar verificarea rapida ar declara asa toate jocurile
 * urmarite, la fiecare zece minute.
 */
async function commit(
  events: DealEvent[],
  deals: Deal[],
  cfg: AppConfig,
  full: boolean
): Promise<void> {
  const watchlist = await getWatchlist()
  const watched = new Set(watchlist.map((w) => w.key))
  for (const e of events) e.watched = watched.has(e.key)

  await addEvents(events)

  // un joc care a intrat o data intr-un prag ramane in istoricul de pret, ca sa
  // se vada ciclul intreg, nu doar reducerea care l-a adus in lista
  const byKey = new Map(deals.map((d) => [d.key, d]))
  for (const e of events) {
    const deal = byKey.get(e.key)
    if (deal) await startTracking(deal)
  }
  if (full) await recordScan(deals, [...watched])

  const wanted = events.filter((e) => cfg.notify[e.tier] && (e.store !== 'gog' || cfg.notifyGog))
  if (wanted.length) notifyEvents(wanted, cfg)

  if (watchlist.length) await checkWatchlist(watchlist, deals, cfg)
}

/** Lista de urmarire alerteaza la orice scadere, nu doar la trecerea unui prag. */
async function checkWatchlist(
  watchlist: Awaited<ReturnType<typeof getWatchlist>>,
  deals: Deal[],
  cfg: AppConfig
): Promise<void> {
  const byKey = new Map(deals.map((d) => [d.key, d]))
  const hits: Array<{ deal: Deal; target: number | null }> = []

  for (const w of watchlist) {
    const deal = byKey.get(w.key)
    if (!deal) continue

    const target = w.targetPrice != null ? w.targetPrice * 100 : null
    const dropped = w.priceAtAdd == null || deal.priceFinal < w.priceAtAdd
    const underTarget = target == null || deal.priceFinal <= target
    if (!dropped || !underTarget) continue

    hits.push({ deal, target: w.targetPrice })
    // rescriu pretul de referinta, altfel as anunta aceeasi scadere la nesfarsit
    await updateWatch(w.key, { priceAtAdd: deal.priceFinal, priceTextAtAdd: deal.priceText })
  }

  if (hits.length) notifyWatch(hits, cfg)
}

function sortDeals(deals: Deal[]): Deal[] {
  return [...deals].sort((a, b) => a.priceFinal - b.priceFinal || b.discountPct - a.discountPct)
}

/* ------------------------------------------------------------ programarea */

export function schedule(): void {
  void (async () => {
    const cfg = await loadConfig()
    if (fullTimer) clearTimeout(fullTimer)
    if (freeTimer) clearTimeout(freeTimer)

    const fullMs = Math.max(5, cfg.fullIntervalMin) * 60_000
    const freeMs = Math.max(2, cfg.freeIntervalMin) * 60_000

    fullTimer = setTimeout(() => void scanFull(), fullMs)
    freeTimer = setTimeout(() => void scanFree(), freeMs)
    setStatus({ nextScanAt: new Date(Date.now() + Math.min(fullMs, freeMs)).toISOString() })
  })()
}

export function stopSchedule(): void {
  if (fullTimer) clearTimeout(fullTimer)
  if (freeTimer) clearTimeout(freeTimer)
  fullTimer = null
  freeTimer = null
}
