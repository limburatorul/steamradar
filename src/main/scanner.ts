import { randomUUID } from 'node:crypto'
import type { AppConfig, Deal, DealEvent, ScanStatus, Tier } from '../shared/types'
import { loadConfig } from './config'
import { notifyEvents, notifyWatch } from './notify'
import {
  addEvents,
  getCatalog,
  getWatchlist,
  isSeeded,
  saveCatalog,
  updateWatch
} from './store'
import {
  currencyOf,
  fetchDiscountedPage,
  fetchFreeToKeep,
  QUERY_PAGE,
  SteamHttpError
} from './steam'

/**
 * Scanarea si compararea.
 *
 * O maturare completa inseamna ~13 cereri si vreo 30 de secunde: toate jocurile
 * la reducere incap in 12 pagini de 500, plus una pentru lista jocurilor
 * devenite gratis. Sortarea dupa reducere nu exista la Steam, dar nici nu e
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
  message: 'In asteptare',
  lastFullScan: null,
  lastFreeScan: null,
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
      const http = err instanceof SteamHttpError ? err : null
      if (signal.aborted || !http?.retryable || attempt >= waits.length) throw err
      const wait = http.retryAfterMs ?? waits[attempt]
      setStatus({ message: `${label} — Steam a limitat cererile, reiau in ${Math.round(wait / 1000)}s` })
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
    setStatus({ phase: 'free', message: 'Verific jocurile devenite gratis', error: null })

    const fresh = await withRetry(
      'Jocuri gratis',
      () => fetchFreeToKeep(cfg.countryCode, signal),
      signal
    )

    const cat = await getCatalog()
    const seeded = cat.updatedAt !== null
    const previous = new Map(cat.deals.map((d) => [d.key, d]))

    // catalogul pastreaza restul ofertelor neatinse; inlocuiesc doar zona "gratis"
    const merged = cat.deals.filter((d) => d.priceFinal > 0)
    merged.push(...fresh)

    const events = seeded ? diff(fresh, previous, cfg) : []
    await saveCatalog(sortDeals(merged), cat.currency)
    await commit(events, fresh, cfg)

    setStatus({
      phase: 'idle',
      message: `${fresh.length} ${fresh.length === 1 ? 'joc gratis' : 'jocuri gratis'} acum`,
      lastFreeScan: new Date().toISOString(),
      found: fresh.length
    })
    return events
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus({ phase: 'error', message: 'Verificarea a esuat', error: msg })
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
      message: seeded ? 'Scanez ofertele' : 'Prima scanare, construiesc referinta'
    })

    const deals: Deal[] = []
    const seen = new Set<string>()

    for (let page = 0; page < cfg.maxPages; page++) {
      if (signal.aborted) break

      const res = await withRetry(
        `Pagina ${page + 1}`,
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

      const totalPages = Math.min(cfg.maxPages, Math.ceil(res.total / QUERY_PAGE) || 1)
      for (const d of res.deals) {
        // sortarea alfabetica face paginile sa nu se suprapuna, dar oferte pot
        // aparea sau disparea in timpul scanarii, deci verific oricum
        if (seen.has(d.key)) continue
        seen.add(d.key)
        deals.push(d)
      }

      setStatus({
        page: page + 1,
        totalPages,
        found: deals.length,
        message: seeded ? 'Scanez ofertele' : 'Prima scanare, construiesc referinta'
      })

      if (res.received < QUERY_PAGE) break
      await sleep(cfg.requestDelayMs)
    }

    if (!deals.length) throw new Error('Steam n-a intors nicio oferta')

    // lista jocurilor la -100% vine din cautarea veche, care e singura care le
    // filtreaza exact; o cerere in plus care face pragul cel mai important sigur
    if (!signal.aborted) {
      setStatus({ phase: 'free', message: 'Verific jocurile devenite gratis' })
      try {
        const free = await withRetry(
          'Jocuri gratis',
          () => fetchFreeToKeep(cfg.countryCode, signal),
          signal
        )
        for (const d of free) {
          if (seen.has(d.key)) continue
          seen.add(d.key)
          deals.push(d)
        }
      } catch {
        // maturarea completa le prinde oricum pe majoritatea; nu pierd tot
        // catalogul din cauza unei singure cereri esuate
      }
    }

    // o scanare oprita la mijloc are un catalog incomplet; daca l-as salva,
    // scanarea urmatoare ar crede ca tot ce lipseste tocmai a intrat la reducere
    // si ar trimite mii de alerte false
    if (signal.aborted) {
      setStatus({ phase: 'idle', message: 'Scanare oprită, catalogul a rămas neatins' })
      return []
    }

    const cat = await getCatalog()
    const previous = new Map(cat.deals.map((d) => [d.key, d]))
    const events = seeded ? diff(deals, previous, cfg) : []

    await saveCatalog(sortDeals(deals), currencyOf(deals))
    await commit(events, deals, cfg)

    setStatus({
      phase: 'idle',
      message: seeded
        ? `${deals.length} oferte, ${events.length} intrari noi in praguri`
        : `${deals.length} oferte inregistrate; de acum alertez la schimbari`,
      lastFullScan: new Date().toISOString(),
      lastFreeScan: new Date().toISOString()
    })
    return events
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus({ phase: 'error', message: 'Scanarea a esuat', error: msg })
    return []
  } finally {
    running = false
    abort = null
    schedule()
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

/** Salveaza evenimentele, marcheaza cele urmarite si trimite notificarile. */
async function commit(events: DealEvent[], deals: Deal[], cfg: AppConfig): Promise<void> {
  const watchlist = await getWatchlist()
  const watched = new Set(watchlist.map((w) => w.key))
  for (const e of events) e.watched = watched.has(e.key)

  await addEvents(events)

  const wanted = events.filter((e) => cfg.notify[e.tier])
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
