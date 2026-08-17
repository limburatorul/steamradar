import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dataRoot } from './config'
import type { Deal, DealEvent, WatchItem } from '../shared/types'

/**
 * Tot ce trebuie sa supravietuiasca inchiderii aplicatiei, in fisiere JSON
 * separate: catalogul curent (ce e la reducere acum), istoricul de intrari in
 * praguri si lista de urmarire.
 *
 * Catalogul e si "fotografia" fata de care compar la scanarea urmatoare: fara
 * el n-as sti daca un joc tocmai a intrat sub prag sau statea acolo de o luna.
 */

const MAX_EVENTS = 3000

interface Catalog {
  updatedAt: string | null
  currency: string
  deals: Deal[]
}

const EMPTY: Catalog = { updatedAt: null, currency: '€', deals: [] }

let catalog: Catalog | null = null
let events: DealEvent[] | null = null
let watchlist: WatchItem[] | null = null

function file(name: string): string {
  return path.join(dataRoot(), name)
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file(name), 'utf8')) as T
  } catch {
    return fallback
  }
}

async function writeJson(name: string, value: unknown): Promise<void> {
  await fs.mkdir(dataRoot(), { recursive: true })
  // scriu intai intr-un fisier temporar: daca aplicatia moare la mijloc, nu
  // raman cu un JSON taiat in doua si cu istoricul pierdut
  const tmp = file(`${name}.tmp`)
  await fs.writeFile(tmp, JSON.stringify(value), 'utf8')
  await fs.rename(tmp, file(name))
}

/* --------------------------------------------------------------- catalogul */

export async function getCatalog(): Promise<Catalog> {
  if (!catalog) catalog = await readJson<Catalog>('catalog.json', EMPTY)
  return catalog
}

export async function saveCatalog(deals: Deal[], currency: string): Promise<void> {
  catalog = { updatedAt: new Date().toISOString(), currency, deals }
  await writeJson('catalog.json', catalog)
}

/** Prima pornire: nu am cu ce compara, deci nu am ce alerta. */
export async function isSeeded(): Promise<boolean> {
  return (await getCatalog()).updatedAt !== null
}

/* --------------------------------------------------------------- istoricul */

export async function getEvents(): Promise<DealEvent[]> {
  if (!events) events = await readJson<DealEvent[]>('events.json', [])
  return events
}

export async function addEvents(fresh: DealEvent[]): Promise<void> {
  if (!fresh.length) return
  const all = await getEvents()
  events = [...fresh, ...all].slice(0, MAX_EVENTS)
  await writeJson('events.json', events)
}

export async function markEventsSeen(ids?: string[]): Promise<void> {
  const all = await getEvents()
  const set = ids ? new Set(ids) : null
  let changed = false
  for (const e of all) {
    if ((!set || set.has(e.id)) && !e.seen) {
      e.seen = true
      changed = true
    }
  }
  if (changed) await writeJson('events.json', all)
}

export async function clearEvents(): Promise<void> {
  events = []
  await writeJson('events.json', events)
}

/* --------------------------------------------------------------- urmarirea */

export async function getWatchlist(): Promise<WatchItem[]> {
  if (!watchlist) watchlist = await readJson<WatchItem[]>('watchlist.json', [])
  return watchlist
}

export async function addWatch(item: WatchItem): Promise<WatchItem[]> {
  const all = await getWatchlist()
  if (!all.some((w) => w.key === item.key)) watchlist = [item, ...all]
  await writeJson('watchlist.json', watchlist)
  return watchlist!
}

export async function removeWatch(key: string): Promise<WatchItem[]> {
  watchlist = (await getWatchlist()).filter((w) => w.key !== key)
  await writeJson('watchlist.json', watchlist)
  return watchlist
}

export async function updateWatch(key: string, patch: Partial<WatchItem>): Promise<WatchItem[]> {
  const all = await getWatchlist()
  watchlist = all.map((w) => (w.key === key ? { ...w, ...patch, key: w.key } : w))
  await writeJson('watchlist.json', watchlist)
  return watchlist
}
