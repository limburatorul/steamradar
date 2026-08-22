import { BROWSER_HEADERS, httpError } from './http'
import type { Deal } from '../shared/types'

/**
 * Reducerile de pe GOG, din catalogul pe care il foloseste chiar magazinul lor.
 * Raspunde anonim, in JSON, si da pretul deja formatat plus procentul.
 *
 * Cinci lucruri masurate pe viu. Nu le re-presupune, re-masoara-le daca te indoiesti:
 *
 *  - GOG ignora `countryCode` cand alege moneda. Fara `currencyCode` explicit,
 *    RO primeste preturi in USD, desi Steam da EUR pentru aceeasi tara. Cum
 *    ambele magazine ajung in acelasi catalog si trec prin aceleasi praguri,
 *    doua monede amestecate ar strica si pragurile, si alertele. De aceea moneda
 *    se deduce din tara, cu tabelul de mai jos.
 *  - Maximul e 100 de itemi pe cerere. La 200 raspunde 400. Tot ce e la reducere
 *    (~3700 cu pachete, 2900 doar jocuri) incape in 38 de cereri.
 *  - Paginarea e repetabila cu `order=desc:title`: aceeasi pagina ceruta de doua
 *    ori a intors aceleasi 100 de jocuri. (La Steam, fara sortare explicita, o
 *    maturare completa pierdea 1100 de jocuri - vezi `steam.ts`.)
 *  - `countryCode=UK` (codul pe care il accepta Steam) raspunde 200, dar fara
 *    niciun pret; `GB` da preturi. Fara alias, sectiunea GOG ar fi goala si n-ar
 *    spune de ce.
 *  - Coperta implicita e un PNG de 1,4 MB. Cu formatorul
 *    `_product_tile_extended_432x243.webp` scade la 30 KB, la aceeasi latime cu
 *    randul din lista.
 *
 * Giveaway-ul are alta adresa si raspunde 404 cand nu e niciunul activ - ceea ce
 * e cazul aproape tot timpul, GOG da un joc gratis de cateva ori pe an.
 */

const CATALOG_URL = 'https://catalog.gog.com/v1/catalog'
const GIVEAWAY_URL = 'https://www.gog.com/giveaway/api/getGiveawayDetails'
const IMAGE_FORMAT = '_product_tile_extended_432x243.webp'

/** Maximul acceptat de catalog intr-o singura cerere; peste, raspunde 400. */
export const GOG_PAGE = 100

/**
 * Moneda pe tara. GOG nu o deduce singur, iar lista lui de monede e scurta, deci
 * tarile din afara ei cad pe EUR - la fel ca RO, tara implicita a aplicatiei.
 */
const CURRENCY: Record<string, string> = {
  US: 'USD',
  UK: 'GBP',
  CA: 'CAD',
  GB: 'GBP',
  AU: 'AUD',
  NZ: 'AUD',
  CH: 'CHF',
  PL: 'PLN',
  NO: 'NOK',
  SE: 'SEK',
  DK: 'DKK',
  JP: 'JPY',
  CN: 'CNY',
  RU: 'RUB'
}

export function currencyFor(countryCode: string): string {
  return CURRENCY[countryCode.toUpperCase()] ?? 'EUR'
}

/**
 * Steam accepta `UK`, GOG nu: raspunde 200, dar fara niciun pret in raspuns,
 * iar sectiunea ar ramane goala fara sa spuna de ce. Masurat: `GB` da preturi,
 * `UK` nu.
 */
const COUNTRY_ALIAS: Record<string, string> = { UK: 'GB' }

function gogCountry(countryCode: string): string {
  const up = countryCode.toUpperCase()
  return COUNTRY_ALIAS[up] ?? up
}

interface Product {
  id?: string
  title?: string
  slug?: string
  storeLink?: string
  productType?: string
  releaseDate?: string
  coverHorizontal?: string
  operatingSystems?: string[]
  reviewsRating?: number
  reviewsCount?: number
  price?: {
    final?: string
    base?: string
    discount?: string
    finalMoney?: { amount?: string; currency?: string }
    baseMoney?: { amount?: string }
  }
}

interface CatalogResponse {
  products?: Product[]
  pages?: number
  productCount?: number
}

export interface GogPage {
  deals: Deal[]
  /** Cate pagini declara GOG pentru interogarea asta. */
  pages: number
  total: number
  received: number
}

export interface GogParams {
  countryCode: string
  page: number
  includeDlc?: boolean
}

export async function fetchGogPage(p: GogParams, signal?: AbortSignal): Promise<GogPage> {
  const q = new URLSearchParams({
    limit: String(GOG_PAGE),
    page: String(p.page),
    order: 'desc:title',
    discounted: 'eq:true',
    productType: p.includeDlc ? 'in:game,pack,dlc' : 'in:game,pack',
    countryCode: gogCountry(p.countryCode),
    currencyCode: currencyFor(p.countryCode),
    locale: 'en-US'
  })

  const res = await fetch(`${CATALOG_URL}?${q.toString()}`, { headers: BROWSER_HEADERS, signal })
  if (!res.ok) throw httpError(res.status, res.statusText, res.headers.get('retry-after'), 'GOG')

  const body = (await res.json()) as CatalogResponse
  const products = body.products ?? []
  const deals: Deal[] = []
  for (const product of products) {
    const deal = toDeal(product)
    if (deal) deals.push(deal)
  }
  return {
    deals,
    pages: body.pages ?? 1,
    total: body.productCount ?? deals.length,
    received: products.length
  }
}

function toDeal(p: Product): Deal | null {
  const amount = p.price?.finalMoney?.amount
  if (!p.id || !p.title || amount == null) return null

  return {
    key: `Gog_${p.id}`,
    store: 'gog',
    // appid e al Steam-ului; la GOG ramane gol, iar butonul cade pe pagina web
    appid: null,
    kind: p.productType === 'dlc' ? 'dlc' : p.productType === 'pack' ? 'bundle' : 'app',
    name: p.title,
    url: p.storeLink ?? `https://www.gog.com/en/game/${p.slug ?? ''}`,
    image: capsuleUrl(p.coverHorizontal),
    released: p.releaseDate ? p.releaseDate.replace(/\./g, '-') : null,
    priceFinal: cents(amount),
    priceOriginal: cents(p.price?.baseMoney?.amount) || cents(amount),
    discountPct: Number((p.price?.discount ?? '').replace(/[^\d]/g, '')) || 0,
    priceText: p.price?.final ?? '',
    priceOriginalText: p.price?.base ?? null,
    // GOG nu spune cand expira reducerea, nici in catalog, nici pe pagina
    discountEndsAt: null,
    reviewSummary: null,
    // nota lor e din 50, nu procent; o aduc pe aceeasi scara cu Steam
    reviewPct: p.reviewsRating ? Math.round(p.reviewsRating * 2) : null,
    reviewCount: p.reviewsCount ?? null,
    platforms: {
      win: p.operatingSystems?.includes('windows') === true,
      mac: p.operatingSystems?.includes('osx') === true,
      linux: p.operatingSystems?.includes('linux') === true
    }
  }
}

/** `.../hash.png` -> `.../hash_product_tile_extended_432x243.webp`, 30 KB in loc de 1,4 MB. */
function capsuleUrl(cover: string | undefined): string | null {
  if (!cover) return null
  return cover.replace(/\.(png|jpg|jpeg|webp)$/i, '') + IMAGE_FORMAT
}

/** GOG da suma ca zecimala in text: `4.99` -> 499. */
function cents(amount: string | undefined): number {
  const n = Number(amount)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/* ----------------------------------------------------------------- giveaway */

interface Giveaway {
  gameId?: string
  giveawayTitle?: string
  giveawayImage?: string
  giveawayLink?: string
  gogUrl?: string
  title?: string
  imageUrl?: string
  url?: string
}

/**
 * Jocul dat gratis de GOG, daca exista unul acum. Endpointul raspunde 404 cand
 * nu e niciun giveaway activ - starea obisnuita - deci 404 inseamna "nimic", nu
 * eroare. Forma raspunsului n-am putut-o verifica pe un giveaway viu, asa ca
 * citesc numele si adresa din oricare din campurile vazute in raspunsurile lor
 * si ma opresc daca lipsesc, in loc sa construiesc un joc pe jumatate.
 */
export async function fetchGogGiveaway(signal?: AbortSignal): Promise<Deal | null> {
  const res = await fetch(GIVEAWAY_URL, { headers: BROWSER_HEADERS, signal })
  if (res.status === 404) return null
  if (!res.ok) throw httpError(res.status, res.statusText, res.headers.get('retry-after'), 'GOG')

  const body = (await res.json()) as Giveaway
  const name = body.giveawayTitle ?? body.title
  const link = body.giveawayLink ?? body.gogUrl ?? body.url
  if (!name || !link) return null

  return {
    key: `Gog_giveaway_${body.gameId ?? name.toLowerCase().replace(/\W+/g, '-')}`,
    store: 'gog',
    appid: null,
    kind: 'app',
    name,
    url: link.startsWith('http') ? link : `https://www.gog.com${link}`,
    image: body.giveawayImage ?? body.imageUrl ?? null,
    released: null,
    priceFinal: 0,
    priceOriginal: 0,
    discountPct: 100,
    priceText: 'FREE',
    priceOriginalText: null,
    discountEndsAt: null,
    reviewSummary: null,
    reviewPct: null,
    reviewCount: null,
    platforms: { win: true, mac: false, linux: false }
  }
}
