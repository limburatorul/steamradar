/** Magazinele urmarite. Fiecare are sectiunea lui in interfata. */
export type Store = 'steam' | 'epic' | 'gog'

export const STORES: Store[] = ['steam', 'epic', 'gog']

export const STORE_LABEL: Record<Store, string> = {
  steam: 'Steam',
  epic: 'Epic',
  gog: 'GOG'
}

/** Pragurile de pret pe care le urmarim, in ordinea importantei. */
export type Tier = 'free' | 'under5' | 'under10'

export const TIERS: Tier[] = ['free', 'under5', 'under10']

export const TIER_LABEL: Record<Tier, string> = {
  free: 'Free',
  under5: 'Under 5',
  under10: 'Under 10'
}

/** Un joc asa cum il vede aplicatia dupa ce a citit rezultatul de la Steam. */
export interface Deal {
  /**
   * Cheia unica in tot catalogul. La Steam e cea data de ei (`App_570`,
   * `Sub_12345`), la GOG e `Gog_<id>` - prefixul tine cele doua magazine
   * separate intr-un singur fisier, fara sa se calce pe id-uri.
   */
  key: string
  store: Store
  appid: number | null
  kind: 'app' | 'dlc' | 'sub' | 'bundle'
  name: string
  url: string
  image: string | null
  released: string | null
  /** Pretul curent in cea mai mica unitate a monedei (cati centi/bani). */
  priceFinal: number
  /** Pretul de lista, inainte de reducere. */
  priceOriginal: number
  discountPct: number
  /** Textul deja formatat de Steam, ca sa nu inventez eu formatarea monedei. */
  priceText: string
  priceOriginalText: string | null
  /** Cand expira reducerea, in secunde unix. Steam nu-l da pentru toate ofertele. */
  discountEndsAt: number | null
  reviewSummary: string | null
  reviewPct: number | null
  reviewCount: number | null
  platforms: { win: boolean; mac: boolean; linux: boolean }
}

/** Momentul in care un joc a intrat intr-un prag. Din astea se face istoricul. */
export interface DealEvent {
  id: string
  key: string
  store: Store
  name: string
  appid: number | null
  url: string
  image: string | null
  tier: Tier
  priceFinal: number
  priceText: string
  priceOriginalText: string | null
  discountPct: number
  reviewSummary: string | null
  reviewPct: number | null
  reviewCount: number | null
  /** ISO. Cand a fost vazuta prima oara intrarea in prag. */
  at: string
  /** Pragul anterior, cand jocul era deja urmarit. */
  fromTier: Tier | null
  fromPriceText: string | null
  watched: boolean
  seen: boolean
}

export interface WatchItem {
  key: string
  store: Store
  appid: number | null
  name: string
  url: string
  image: string | null
  addedAt: string
  /** Pretul de la momentul adaugarii, ca sa pot arata cat a scazut de atunci. */
  priceAtAdd: number | null
  priceTextAtAdd: string | null
  /** Prag propriu, in unitati intregi de moneda. Gol = alerteaza la orice scadere. */
  targetPrice: number | null
}

export type ScanPhase = 'idle' | 'free' | 'tiers' | 'gog' | 'epic' | 'top' | 'done' | 'error'

export interface ScanStatus {
  phase: ScanPhase
  /** Cate cereri s-au facut din cele estimate, pentru bara de progres. */
  page: number
  totalPages: number
  found: number
  message: string
  lastFullScan: string | null
  lastFreeScan: string | null
  lastEpicScan: string | null
  nextScanAt: string | null
  error: string | null
}

export interface AppConfig {
  /** Codul de tara trimis lui Steam; el decide moneda. RO inseamna EUR. */
  countryCode: string
  /** Cat de des reverific doar jocurile devenite gratis (minute). */
  freeIntervalMin: number
  /** Cat de des fac scanarea completa a pragurilor de pret (minute). */
  fullIntervalMin: number
  /** Pauza intre cereri. Steam raspunde 429 peste ~20 de cereri intr-o rafala. */
  requestDelayMs: number
  /** Plafon de pagini a cate 500; 40 acopera de trei ori tot ce e la reducere. */
  maxPages: number
  /** Praguri exprimate in unitati intregi de moneda (5 EUR, 10 EUR). */
  thresholdLow: number
  thresholdHigh: number
  notify: Record<Tier, boolean>
  /** Reducerile GOG trec prin aceleasi praguri; asta decide daca si alerteaza. */
  notifyGog: boolean
  notifyEpic: EpicNotify
  /** Grupat = un toast pe ciclu cu totalul; individual = cate un toast de joc. */
  notifyMode: 'grouped' | 'individual'
  notifySound: boolean
  /** DLC-urile la reducere sunt de doua ori mai multe decat jocurile. */
  includeDlc: boolean
  minDiscountPct: number
  startMinimized: boolean
  autoStart: boolean
  closeToTray: boolean
  /** Cat de des verific daca a aparut o versiune noua (minute). 0 = niciodata. */
  updateCheckMin: number
  /** Butonul Steam deschide clientul, nu pagina din browser. */
  openInSteamClient: boolean
  glassStyle: GlassStyle
  /** Fundalul rotativ construit din capsulele ofertelor. */
  backdrop: boolean
}

export interface EpicNotify {
  /** Cand un joc devine revendicabil. */
  free: boolean
  /** Cand Epic anunta ce urmeaza sa fie gratis. */
  upcoming: boolean
  /** Cu o zi inainte sa expire promotia. */
  expiring: boolean
}

/**
 * Un joc gratis de pe Epic. N-are pret, prag sau reducere de comparat, are doar
 * o fereastra de timp - de aceea nu trece prin `Deal`, ci isi are forma lui.
 */
export interface EpicFreeGame {
  id: string
  title: string
  image: string | null
  url: string
  /** Pretul de lista, ca sa se vada cat dai gratis. Bundle-urile n-au. */
  priceText: string | null
  offerType: string
  /** ISO. Fereastra in care jocul e (sau va fi) gratis. */
  startsAt: string
  endsAt: string
  /** Revendicabil chiar acum, sau doar anuntat pentru mai tarziu. */
  current: boolean
}

export type GlassStyle = 'glass' | 'acrylic' | 'frosted'

/** Un punct din graficul de pret: [secunde unix, pret in centi, reducere %]. */
export type PricePoint = [number, number, number]

export interface PriceSeries {
  key: string
  name: string
  image: string | null
  url: string
  appid: number | null
  /** Pretul de lista, ca sa stiu unde sa duc linia cand oferta se termina. */
  listPrice?: number
  points: PricePoint[]
}

export interface UpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion?: string
  notes?: string
  downloadUrl?: string
  sizeBytes?: number
  error?: string
}

export interface UpdateProgress {
  phase: 'downloading' | 'verifying' | 'restarting' | 'error'
  receivedBytes?: number
  totalBytes?: number
  message?: string
}

export interface StoreStats {
  tracked: number
  free: number
  under5: number
  under10: number
}

export interface StatsSummary {
  steam: StoreStats
  gog: StoreStats
  /** Epic nu are praguri, doar cate jocuri sunt gratis acum si cate urmeaza. */
  epic: { current: number; upcoming: number }
  eventsToday: number
  unseen: number
}
