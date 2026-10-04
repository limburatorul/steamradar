import type { EpicFreeGame } from './types'

/**
 * Ofertele Epic evaluate fata de ceasul de acum, nu fata de ultima scanare:
 * `current` si ferestrele sunt scrise la scanare, iar aplicatia sta ore sau zile
 * in tray. Fara asta, o oferta expirata ramane "Claim on Epic" pana la
 * urmatoarea scanare reusita.
 */
export function liveEpic(games: EpicFreeGame[], now: number): EpicFreeGame[] {
  return games
    .filter((g) => Date.parse(g.endsAt) > now)
    .map((g) => ({ ...g, current: Date.parse(g.startsAt) <= now }))
    .sort((a, b) => Number(b.current) - Number(a.current) || a.startsAt.localeCompare(b.startsAt))
}
