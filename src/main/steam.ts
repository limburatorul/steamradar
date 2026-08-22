import { BROWSER_HEADERS, httpError } from './http'
import type { Deal } from '../shared/types'

/**
 * Citirea ofertelor de pe Steam. Doua surse, fiecare pentru ce stie sa faca.
 *
 * 1. `IStoreQueryService/Query` - interogarea pe care o foloseste magazinul nou.
 *    Raspunde anonim, da 500 de itemi pe cerere si aduce direct pret in centi,
 *    procent, scor recenzii, data lansarii si data la care expira reducerea.
 *    Toate jocurile la reducere (~5900 fara DLC) incap in 12 cereri, ~30 de
 *    secunde. Endpointul vechi de cautare cerea 105 cereri pentru acelasi lucru.
 *
 * 2. `search/results` cu `maxprice=free&specials=1` - o singura cerere care
 *    intoarce exact jocurile puse la -100%. Interogarea noua n-are echivalent
 *    (`min_discount_percent: 100` nu filtreaza, intoarce tot magazinul), iar
 *    asta e alerta care conteaza cel mai mult, deci merita cererea ei separata,
 *    rulata mult mai des decat maturarea completa.
 *
 * Trei lucruri masurate, nu presupuse:
 *  - fara `sort`, doua cereri identice n-au niciun element comun: paginarea
 *    pierdea 1100 de jocuri din 5858. `sort: 1` (alfabetic) e stabil si aduce
 *    exact cate declara `total_matching_records`.
 *  - endpointul vechi limiteaza la ~20 de cereri, cu revenire de ~0,4/s; peste
 *    asta raspunde 429. De aceea si el, si cel nou, trec prin acelasi
 *    temporizator cu reincercari.
 *  - `l=english` mereu, ca eticheta recenziilor sa aiba acelasi tipar indiferent
 *    de tara. Pretul vine tot in moneda locala, fiindca de moneda raspunde `cc`.
 */

const QUERY_URL = 'https://api.steampowered.com/IStoreQueryService/Query/v1/'
const SEARCH_URL = 'https://store.steampowered.com/search/results/'
const ASSET_BASE = 'https://shared.fastly.steamstatic.com/store_item_assets/'

/** Maximul acceptat de interogarea noua intr-o singura cerere. */
export const QUERY_PAGE = 500

/** Sortare alfabetica: singura care face paginarea repetabila. */
const SORT_NAME = 1

/* --------------------------------------------------------- forma raspunsului */

interface PurchaseOption {
  final_price_in_cents?: string
  original_price_in_cents?: string
  formatted_final_price?: string
  formatted_original_price?: string
  discount_pct?: number
  active_discounts?: Array<{ discount_end_date?: number }>
}

interface StoreItem {
  id: number
  appid?: number
  type?: number
  visible?: boolean
  name?: string
  store_url_path?: string
  best_purchase_option?: PurchaseOption
  assets?: { asset_url_format?: string; small_capsule?: string }
  release?: { steam_release_date?: number }
  platforms?: { windows?: boolean; mac?: boolean; steamos_linux?: boolean }
  reviews?: {
    summary_filtered?: {
      review_count?: number
      percent_positive?: number
      review_score_label?: string
    }
  }
}

interface QueryResponse {
  response?: {
    metadata?: { total_matching_records?: number }
    store_items?: StoreItem[]
  }
}

/** `type` din raspuns: 0 joc, 4 DLC, restul (software, video, hardware) le ignor. */
const TYPE_GAME = 0
const TYPE_DLC = 4

export interface QueryParams {
  countryCode: string
  start: number
  count?: number
  includeDlc?: boolean
  minDiscountPct?: number
}

export interface QueryPage {
  deals: Deal[]
  total: number
  /** Cati itemi a intors Steam, inclusiv cei fara pret; decide daca mai paginez. */
  received: number
}

function queryUrl(p: QueryParams): string {
  const input = {
    query: {
      start: p.start,
      count: p.count ?? QUERY_PAGE,
      sort: SORT_NAME,
      filters: {
        type_filters: { include_games: true, include_dlc: p.includeDlc === true },
        price_filters: { min_discount_percent: Math.max(1, p.minDiscountPct ?? 1) }
      }
    },
    context: { language: 'english', country_code: p.countryCode, steam_realm: 1 },
    data_request: {
      include_basic_info: true,
      include_assets: true,
      include_release: true,
      include_platforms: true,
      include_reviews: true,
      include_all_purchase_options: true
    }
  }
  return `${QUERY_URL}?input_json=${encodeURIComponent(JSON.stringify(input))}`
}

export async function fetchDiscountedPage(
  p: QueryParams,
  signal?: AbortSignal
): Promise<QueryPage> {
  const res = await fetch(queryUrl(p), {
    headers: BROWSER_HEADERS,
    signal
  })
  if (!res.ok) throw httpError(res.status, res.statusText, res.headers.get('retry-after'))

  const body = (await res.json()) as QueryResponse
  const items = body.response?.store_items ?? []
  const deals: Deal[] = []
  for (const item of items) {
    const deal = toDeal(item)
    if (deal) deals.push(deal)
  }
  return {
    deals,
    total: body.response?.metadata?.total_matching_records ?? 0,
    received: items.length
  }
}

function toDeal(item: StoreItem): Deal | null {
  const opt = item.best_purchase_option
  if (!opt || !item.name || item.visible === false) return null
  if (item.type !== TYPE_GAME && item.type !== TYPE_DLC) return null

  const priceFinal = Number(opt.final_price_in_cents ?? 0)
  const priceOriginal = Number(opt.original_price_in_cents ?? priceFinal)
  const rev = item.reviews?.summary_filtered

  return {
    key: `App_${item.id}`,
    store: 'steam',
    appid: item.appid ?? item.id,
    kind: item.type === TYPE_DLC ? 'dlc' : 'app',
    name: item.name,
    url: item.store_url_path
      ? `https://store.steampowered.com/${item.store_url_path}`
      : `https://store.steampowered.com/app/${item.id}`,
    image: capsuleUrl(item),
    released: item.release?.steam_release_date
      ? new Date(item.release.steam_release_date * 1000).toISOString().slice(0, 10)
      : null,
    priceFinal,
    priceOriginal,
    discountPct: opt.discount_pct ?? 0,
    priceText: opt.formatted_final_price ?? '',
    priceOriginalText: opt.formatted_original_price ?? null,
    discountEndsAt: opt.active_discounts?.[0]?.discount_end_date ?? null,
    reviewSummary: rev?.review_score_label ?? null,
    reviewPct: rev?.percent_positive ?? null,
    reviewCount: rev?.review_count ?? null,
    platforms: {
      win: item.platforms?.windows === true,
      mac: item.platforms?.mac === true,
      linux: item.platforms?.steamos_linux === true
    }
  }
}

/** `steam/apps/570/${FILENAME}?t=1` + `capsule_231x87.jpg` -> adresa completa. */
function capsuleUrl(item: StoreItem): string | null {
  const fmt = item.assets?.asset_url_format
  const file = item.assets?.small_capsule
  if (!fmt || !file) return null
  return ASSET_BASE + fmt.replace('${FILENAME}', file)
}

/* ------------------------------------------------- jocurile devenite gratis */

/**
 * Cautarea veche, singura care stie sa filtreze exact jocurile la -100%.
 * Raspunde in JSON (`json=1`) cu randurile magazinului randate in `results_html`,
 * de unde citesc cu expresii regulate. Sunt cateva pe an, deci lista e scurta.
 */
export async function fetchFreeToKeep(
  countryCode: string,
  signal?: AbortSignal
): Promise<Deal[]> {
  const q = new URLSearchParams({
    query: '',
    start: '0',
    count: '100',
    dynamic_data: '',
    sort_by: 'Price_ASC',
    specials: '1',
    maxprice: 'free',
    infinite: '1',
    json: '1',
    cc: countryCode,
    l: 'english'
  })

  const res = await fetch(`${SEARCH_URL}?${q.toString()}`, {
    headers: BROWSER_HEADERS,
    signal
  })
  if (!res.ok) throw httpError(res.status, res.statusText, res.headers.get('retry-after'))

  const body = (await res.json()) as { results_html?: string }
  if (typeof body.results_html !== 'string') throw new Error('Raspuns neasteptat de la Steam')
  return parseRows(body.results_html).filter((d) => d.priceFinal <= 0)
}

/* ----------------------------------------------------------- parsare de HTML */

const ROW_RE = /<a href="([^"]+)"[\s\S]*?<\/a>/g

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#039;': "'",
  '&nbsp;': ' '
}

function decode(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|#0?39|nbsp);/g, (m) => ENTITIES[m] ?? m).trim()
}

function pick(html: string, re: RegExp): string | null {
  const m = re.exec(html)
  return m ? m[1] : null
}

export function parseRows(html: string): Deal[] {
  const deals: Deal[] = []
  ROW_RE.lastIndex = 0

  for (let m = ROW_RE.exec(html); m; m = ROW_RE.exec(html)) {
    const row = m[0]
    const href = decode(m[1]).replace(/[?&]snr=[^&]*/, '')

    const key = pick(row, /data-ds-itemkey="([^"]+)"/)
    const name = pick(row, /<span class="title">([\s\S]*?)<\/span>/)
    const priceFinalAttr = pick(row, /data-price-final="(\d+)"/)
    if (!key || !name || priceFinalAttr == null) continue

    const priceFinal = Number(priceFinalAttr)
    const discountPct = Number(pick(row, /data-discount="(\d+)"/) ?? '0')
    const priceOriginalText = pick(row, /class="discount_original_price">([^<]*)</)

    const review = /search_review_summary [a-z_]+" data-tooltip-html="([^"]*)"/.exec(row)
    const tooltip = review ? decode(review[1].replace(/&lt;br&gt;/g, '\n')) : null
    const pct = tooltip ? /(\d+)%\s+of the/.exec(tooltip) : null
    const cnt = tooltip ? /of the ([\d.,]+) user reviews/.exec(tooltip) : null
    const appidRaw = pick(row, /data-ds-appid="(\d+)/)

    deals.push({
      key,
      store: 'steam',
      appid: appidRaw ? Number(appidRaw) : null,
      kind: key.startsWith('Sub_') ? 'sub' : key.startsWith('Bundle_') ? 'bundle' : 'app',
      name: decode(name),
      url: href,
      image: pick(row, /<div class="search_capsule"><img src="([^"]+)"/),
      released: decode(pick(row, /class="search_released[^"]*">([\s\S]*?)<\/div>/) ?? '') || null,
      priceFinal,
      priceOriginal: parseMoney(priceOriginalText) || priceFinal,
      discountPct,
      priceText: decode(pick(row, /class="discount_final_price">([^<]*)</) ?? ''),
      priceOriginalText: priceOriginalText ? decode(priceOriginalText) : null,
      discountEndsAt: null,
      reviewSummary: tooltip ? tooltip.split('\n')[0] : null,
      reviewPct: pct ? Number(pct[1]) : null,
      reviewCount: cnt ? Number(cnt[1].replace(/[.,]/g, '')) : null,
      platforms: {
        win: /platform_img win/.test(row),
        mac: /platform_img mac/.test(row),
        linux: /platform_img linux/.test(row)
      }
    })
  }

  return deals
}

/** `4,90€` sau `$4.99` -> 490 / 499. Ultimul separator e cel zecimal. */
function parseMoney(text: string | null): number {
  if (!text) return 0
  const digits = text.replace(/[^\d.,]/g, '')
  if (!digits) return 0
  const sep = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','))
  if (sep === -1 || digits.length - sep - 1 > 2) return Number(digits.replace(/[.,]/g, '')) * 100
  const whole = digits.slice(0, sep).replace(/[.,]/g, '')
  const frac = digits.slice(sep + 1).padEnd(2, '0')
  return Number(whole) * 100 + Number(frac)
}

/** Simbolul monedei, dedus din primul pret care are unul. E doar pentru afisaj. */
export function currencyOf(deals: Deal[]): string {
  for (const d of deals) {
    const sym = /[^\d\s.,\-]+/.exec(d.priceText || d.priceOriginalText || '')
    if (sym) return sym[0].trim()
  }
  return '€'
}
