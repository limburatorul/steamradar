import { BROWSER_HEADERS, httpError } from './http'
import type { EpicFreeGame } from '../shared/types'

/**
 * Jocurile gratuite saptamanale de pe Epic.
 *
 * O singura cerere anonima catre hostul static de continut, ~1 secunda, si
 * intoarce deodata si ce e gratis acum, si ce a anuntat Epic pentru saptamanile
 * urmatoare, cu datele exacte de start si de sfarsit.
 *
 * Doua lucruri masurate, nu presupuse:
 *  - Reducerile Epic **nu se pot citi**. GraphQL-ul magazinului
 *    (`store.epicgames.com/graphql`) raspunde 403 cu provocare Cloudflare si pe
 *    POST, si pe GET, cu antete normale de browser. Doar hostul static de aici
 *    e liber. De aceea sectiunea Epic are numai jocuri gratuite.
 *  - Lista contine si promotii care **nu** sunt gratuite: in aceeasi cerere au
 *    venit oferte anuntate la -20%, -25%, -40% si -50%. Singurul semn ca un joc
 *    chiar e gratis e `discountPercentage === 0` (procentul din pretul de lista
 *    care ramane de platit, nu reducerea). Fara filtrul asta, sectiunea ar
 *    anunta ca "gratis" jocuri care costa.
 */

const URL =
  'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions'

/** `discountPercentage` e cat ramane de platit din pretul de lista. 0 = gratis. */
const FREE = 0

interface Offer {
  startDate?: string
  endDate?: string
  discountSetting?: { discountPercentage?: number }
}

interface Element {
  id?: string
  title?: string
  offerType?: string
  productSlug?: string | null
  urlSlug?: string | null
  offerMappings?: Array<{ pageSlug?: string }>
  catalogNs?: { mappings?: Array<{ pageSlug?: string }> | null }
  keyImages?: Array<{ type?: string; url?: string }>
  price?: {
    totalPrice?: {
      originalPrice?: number
      fmtPrice?: { originalPrice?: string }
    }
  }
  promotions?: {
    promotionalOffers?: Array<{ promotionalOffers?: Offer[] }> | null
    upcomingPromotionalOffers?: Array<{ promotionalOffers?: Offer[] }> | null
  } | null
}

interface Response {
  data?: { Catalog?: { searchStore?: { elements?: Element[] } } }
}

const OFFER_LABEL: Record<string, string> = {
  BASE_GAME: 'Game',
  ADD_ON: 'Add-on',
  BUNDLE: 'Bundle',
  DLC: 'DLC'
}

export async function fetchEpicFreeGames(
  countryCode: string,
  signal?: AbortSignal
): Promise<EpicFreeGame[]> {
  const q = new URLSearchParams({
    locale: 'en-US',
    country: countryCode,
    allowCountries: countryCode
  })
  const res = await fetch(`${URL}?${q.toString()}`, { headers: BROWSER_HEADERS, signal })
  if (!res.ok) throw httpError(res.status, res.statusText, res.headers.get('retry-after'), 'Epic')

  const body = (await res.json()) as Response
  const elements = body.data?.Catalog?.searchStore?.elements
  if (!Array.isArray(elements)) throw new Error('Raspuns neasteptat de la Epic')

  const games: EpicFreeGame[] = []
  for (const el of elements) {
    const current = freeOffer(el.promotions?.promotionalOffers)
    const upcoming = current ? null : freeOffer(el.promotions?.upcomingPromotionalOffers)
    const offer = current ?? upcoming
    if (!offer || !el.id || !el.title) continue

    games.push({
      id: el.id,
      title: el.title,
      image: imageOf(el),
      url: storeUrl(el),
      priceText: el.price?.totalPrice?.originalPrice ? priceText(el) : null,
      offerType: OFFER_LABEL[el.offerType ?? ''] ?? 'Game',
      startsAt: offer.startDate!,
      endsAt: offer.endDate!,
      current: current !== null
    })
  }

  // gratis acum intai, apoi cele anuntate in ordinea in care intra
  return games.sort(
    (a, b) => Number(b.current) - Number(a.current) || a.startsAt.localeCompare(b.startsAt)
  )
}

/** Prima oferta la -100% dintr-un grup. Restul sunt reduceri obisnuite. */
function freeOffer(groups: Array<{ promotionalOffers?: Offer[] }> | null | undefined): Offer | null {
  for (const g of groups ?? []) {
    for (const o of g.promotionalOffers ?? []) {
      if (o.discountSetting?.discountPercentage === FREE && o.startDate && o.endDate) return o
    }
  }
  return null
}

/**
 * Coperta lata; cea inalta si miniatura sunt rezerve pentru ofertele mai vechi.
 *
 * Originalul e de 2560x1440 si 627 KB, pentru o cartela de vreo 280 de pixeli.
 * CDN-ul lor stie sa redimensioneze din adresa: la 480x270 scade la 53 KB.
 */
function imageOf(el: Element): string | null {
  const wanted = ['OfferImageWide', 'DieselStoreFrontWide', 'OfferImageTall', 'Thumbnail']
  for (const type of wanted) {
    const hit = el.keyImages?.find((i) => i.type === type && i.url)
    if (hit?.url) return hit.url.includes('?') ? hit.url : `${hit.url}?h=270&w=480&resize=1`
  }
  return null
}

/**
 * Adresa paginii din magazin. `productSlug` vine uneori ca `joc/home`, iar
 * jocurile inca neanuntate n-au niciun slug - alea cad pe pagina de gratuite.
 */
function storeUrl(el: Element): string {
  const slug =
    el.offerMappings?.[0]?.pageSlug ??
    el.catalogNs?.mappings?.[0]?.pageSlug ??
    el.productSlug?.replace(/\/home$/, '') ??
    el.urlSlug
  return slug
    ? `https://store.epicgames.com/en-US/p/${slug}`
    : 'https://store.epicgames.com/en-US/free-games'
}

function priceText(el: Element): string | null {
  const fmt = el.price?.totalPrice?.fmtPrice?.originalPrice
  return fmt && fmt !== '0' ? fmt : null
}
