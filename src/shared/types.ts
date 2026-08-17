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
  /** Cheia unica din Steam: `App_570`, `Sub_12345`, `Bundle_678`. */
  key: string
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

export type ScanPhase = 'idle' | 'free' | 'tiers' | 'top' | 'done' | 'error'

export interface ScanStatus {
  phase: ScanPhase
  /** Cate cereri s-au facut din cele estimate, pentru bara de progres. */
  page: number
  totalPages: number
  found: number
  message: string
  lastFullScan: string | null
  lastFreeScan: string | null
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
  /** Grupat = un toast pe ciclu cu totalul; individual = cate un toast de joc. */
  notifyMode: 'grouped' | 'individual'
  notifySound: boolean
  /** DLC-urile la reducere sunt de doua ori mai multe decat jocurile. */
  includeDlc: boolean
  minDiscountPct: number
  startMinimized: boolean
  autoStart: boolean
  closeToTray: boolean
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

export interface StatsSummary {
  tracked: number
  free: number
  under5: number
  under10: number
  eventsToday: number
  unseen: number
}
