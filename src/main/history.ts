import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dataRoot } from './config'
import type { Deal, PricePoint, PriceSeries } from '../shared/types'

/**
 * Istoricul de pret, joc cu joc.
 *
 * Nu tin evolutia pentru toate cele ~5900 de oferte: ar insemna sute de mii de
 * puncte pe zi pentru jocuri la care nimeni nu se uita. Tin doar jocurile care
 * "au ajuns in lista" - adica au declansat macar o data o alerta de prag - plus
 * cele urmarite manual. Un joc intrat o data ramane urmarit, ca sa se vada
 * ciclul intreg: reducere, revenire la pretul intreg, reducere mai buna.
 *
 * Punctele se scriu doar cand pretul chiar se schimba. O scanare pe ora care ar
 * scrie acelasi pret de 24 de ori pe zi ar umfla fisierul fara sa adauge nimic
 * unui grafic - iar graficul se deseneaza in trepte, deci un punct pe schimbare
 * descrie exact realitatea: pretul a stat asa pana la punctul urmator.
 */

const MAX_POINTS = 400
const MAX_GAMES = 3000

interface HistoryFile {
  version: 1
  games: Record<string, PriceSeries>
}

const EMPTY: HistoryFile = { version: 1, games: {} }

let cache: HistoryFile | null = null

function file(): string {
  return path.join(dataRoot(), 'history.json')
}

async function load(): Promise<HistoryFile> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await fs.readFile(file(), 'utf8')) as HistoryFile
    cache = parsed.games ? parsed : { ...EMPTY }
  } catch {
    cache = { ...EMPTY, games: {} }
  }
  return cache
}

async function save(): Promise<void> {
  if (!cache) return
  await fs.mkdir(dataRoot(), { recursive: true })
  const tmp = `${file()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(cache), 'utf8')
  await fs.rename(tmp, file())
}

export async function getSeries(key: string): Promise<PriceSeries | null> {
  return (await load()).games[key] ?? null
}

export async function getManySeries(keys: string[]): Promise<Record<string, PriceSeries>> {
  const all = await load()
  const out: Record<string, PriceSeries> = {}
  for (const k of keys) if (all.games[k]) out[k] = all.games[k]
  return out
}

export async function trackedKeys(): Promise<string[]> {
  return Object.keys((await load()).games)
}

/** Incepe sa urmareasca un joc, daca nu il urmarea deja. */
export async function startTracking(deal: Deal): Promise<void> {
  const all = await load()
  if (all.games[deal.key]) return
  all.games[deal.key] = {
    key: deal.key,
    name: deal.name,
    image: deal.image,
    url: deal.url,
    appid: deal.appid,
    points: []
  }
  appendPoint(all.games[deal.key], deal)
  await save()
}

/**
 * Adauga punctele scanarii curente pentru jocurile deja urmarite. Cele care nu
 * mai apar in catalog au iesit din reducere, deci primesc un punct la pretul
 * intreg - altfel graficul ar arata reducerea ca si cum ar tine la nesfarsit.
 */
export async function recordScan(deals: Deal[], watchedKeys: string[]): Promise<void> {
  const all = await load()
  const byKey = new Map(deals.map((d) => [d.key, d]))

  // jocurile urmarite manual intra in istoric chiar daca n-au declansat alerte
  for (const key of watchedKeys) {
    const deal = byKey.get(key)
    if (deal && !all.games[key]) {
      all.games[key] = {
        key,
        name: deal.name,
        image: deal.image,
        url: deal.url,
        appid: deal.appid,
        points: []
      }
    }
  }

  const now = Math.floor(Date.now() / 1000)
  for (const series of Object.values(all.games)) {
    const deal = byKey.get(series.key)
    if (deal) {
      series.name = deal.name
      series.image = deal.image ?? series.image
      appendPoint(series, deal)
      continue
    }

    // a iesit din reducere: pretul de lista e ultimul pe care il stiam
    const last = series.points.at(-1)
    if (!last || last[2] === 0) continue
    const listPrice = series.listPrice ?? 0
    if (listPrice > 0 && last[1] !== listPrice) series.points.push([now, listPrice, 0])
  }

  prune(all)
  await save()
}

function appendPoint(series: PriceSeries, deal: Deal): void {
  const now = Math.floor(Date.now() / 1000)
  if (deal.priceOriginal > 0) series.listPrice = deal.priceOriginal
  const last = series.points.at(-1)
  // doar schimbarile conteaza: graficul e in trepte, iar un pret repetat n-ar
  // adauga nimic in afara de octeti
  if (last && last[1] === deal.priceFinal && last[2] === deal.discountPct) return
  series.points.push([now, deal.priceFinal, deal.discountPct] as PricePoint)
  if (series.points.length > MAX_POINTS) series.points.splice(0, series.points.length - MAX_POINTS)
}

/** Tine fisierul marginit: cele mai vechi jocuri ies primele. */
function prune(all: HistoryFile): void {
  const keys = Object.keys(all.games)
  if (keys.length <= MAX_GAMES) return
  const byLastSeen = keys.sort(
    (a, b) => (all.games[a].points.at(-1)?.[0] ?? 0) - (all.games[b].points.at(-1)?.[0] ?? 0)
  )
  for (const key of byLastSeen.slice(0, keys.length - MAX_GAMES)) delete all.games[key]
}

export async function clearHistory(): Promise<void> {
  cache = { ...EMPTY, games: {} }
  await save()
}
