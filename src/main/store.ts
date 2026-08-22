import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dataRoot } from './config'
import type { Deal, DealEvent, EpicFreeGame, WatchItem } from '../shared/types'

/**
 * Tot ce trebuie sa supravietuiasca inchiderii aplicatiei, in fisiere JSON
 * separate: catalogul curent (ce e la reducere acum), istoricul de intrari in
 * praguri si lista de urmarire.
 *
 * Catalogul e si "fotografia" fata de care compar la scanarea urmatoare: fara
 * el n-as sti daca un joc tocmai a intrat sub prag sau statea acolo de o luna.
 *
 * Steam si GOG stau in acelasi catalog, deosebite prin campul `store` si prin
 * prefixul cheii; Epic are fisierul lui, fiindca acolo nu sunt preturi de
 * comparat, ci ferestre de timp in care un joc e gratis.
 */

const MAX_EVENTS = 3000

interface Catalog {
  updatedAt: string | null
  currency: string
  deals: Deal[]
}

const EMPTY: Catalog = { updatedAt: null, currency: '€', deals: [] }

interface EpicState {
  updatedAt: string | null
  games: EpicFreeGame[]
  /** Ce am anuntat deja, pe id de joc, ca sa nu repet acelasi toast la fiecare verificare. */
  notified: Record<string, string[]>
}

const EMPTY_EPIC: EpicState = { updatedAt: null, games: [], notified: {} }

let catalog: Catalog | null = null
let events: DealEvent[] | null = null
let watchlist: WatchItem[] | null = null
let epic: EpicState | null = null

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
  if (!catalog) {
    const read = await readJson<Catalog>('catalog.json', EMPTY)
    catalog = { ...read, deals: read.deals.map(stamp) }
  }
  return catalog
}

/**
 * Fisierele scrise inainte de a exista Epic si GOG n-au campul `store`. Fara
 * asta, ofertele vechi ar cadea intre sectiuni: nici la Steam, nici la GOG.
 */
function stamp<T extends { store?: Deal['store'] }>(item: T): T {
  return item.store ? item : { ...item, store: 'steam' as const }
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
  if (!events) events = (await readJson<DealEvent[]>('events.json', [])).map(stamp)
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
  if (!watchlist) watchlist = (await readJson<WatchItem[]>('watchlist.json', [])).map(stamp)
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

/* --------------------------------------------------------------------- Epic */

export async function getEpic(): Promise<EpicState> {
  if (!epic) epic = await readJson<EpicState>('epic.json', EMPTY_EPIC)
  return epic
}

export async function saveEpic(games: EpicFreeGame[]): Promise<void> {
  const current = await getEpic()
  // curat insemnarile jocurilor care au iesit din lista, altfel fisierul creste
  // la nesfarsit cu id-uri de acum doi ani
  const live = new Set(games.map((g) => g.id))
  const notified: Record<string, string[]> = {}
  for (const [id, kinds] of Object.entries(current.notified)) {
    if (live.has(id)) notified[id] = kinds
  }
  epic = { updatedAt: new Date().toISOString(), games, notified }
  await writeJson('epic.json', epic)
}

/** True daca anuntul asta nu s-a dat inca; il si insemneaza ca dat. */
export async function claimEpicNotice(id: string, kind: string): Promise<boolean> {
  const state = await getEpic()
  const kinds = state.notified[id] ?? []
  if (kinds.includes(kind)) return false
  state.notified[id] = [...kinds, kind]
  await writeJson('epic.json', state)
  return true
}
