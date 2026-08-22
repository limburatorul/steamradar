/**
 * Cat au in comun cele trei magazine: antetul cererii si eroarea de HTTP.
 *
 * Sta separat fiindca `withRetry` din scanner trebuie sa recunoasca la fel
 * limitarea de la Steam, de la GOG si de la Epic; daca eroarea ar sta in
 * `steam.ts`, celelalte doua module ar depinde de Steam fara motiv.
 */

/** Toate trei raspund degradat la user-agenti evident automati. */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json'
}

export class StoreHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs: number | null
  ) {
    super(message)
    this.name = 'StoreHttpError'
  }

  /** 429 si 5xx trec; restul sunt greseli de-ale mele, n-are rost sa reincerc. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500
  }
}

export function httpError(
  status: number,
  statusText: string,
  retryAfter: string | null,
  store = 'Steam'
): StoreHttpError {
  const seconds = retryAfter ? Number(retryAfter) : NaN
  return new StoreHttpError(
    status,
    status === 429
      ? `${store} a limitat cererile (429)`
      : `${store} a raspuns cu ${status} ${statusText}`,
    Number.isFinite(seconds) ? seconds * 1000 : null
  )
}
