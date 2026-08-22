import { Notification, shell } from 'electron'
import type { AppConfig, Deal, DealEvent, EpicFreeGame, Tier } from '../shared/types'
import { STORE_LABEL } from '../shared/types'

/**
 * Notificarile Windows.
 *
 * Windows nu afiseaza o coada nesfarsita de toast-uri: cand vin multe deodata,
 * le arunca pe cele din spate. Iar sub 5 intra cateva zeci de jocuri intr-o
 * scanare, iar in timpul soldurilor mari cateva sute. De aceea modul implicit e
 * "grupat" - un singur toast pe prag, cu numarul si primele nume - si exista
 * "individual" pentru cine chiar vrea cate un toast de joc.
 *
 * Jocurile devenite gratis fac exceptie: sunt rare si sunt tot ce conteaza mai
 * mult, deci primesc toast propriu chiar si in modul grupat.
 *
 * Numele care apare deasupra notificarii vine din scurtatura din Start Menu -
 * vezi `shortcut.ts`, fara ea Windows scrie "electron.app.Electron".
 */

const MAX_INDIVIDUAL = 8

const TITLE: Record<Tier, (n: number) => string> = {
  free: (n) => (n === 1 ? 'A game just went free' : `${n} games just went free`),
  under5: (n) => (n === 1 ? 'A game dropped under 5' : `${n} games dropped under 5`),
  under10: (n) => (n === 1 ? 'A game dropped under 10' : `${n} games dropped under 10`)
}

let showWindow: (() => void) | null = null

export function setWindowOpener(fn: () => void): void {
  showWindow = fn
}

function toast(opts: { title: string; body: string; silent: boolean; onClick: () => void }): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title: opts.title, body: opts.body, silent: opts.silent })
  n.on('click', opts.onClick)
  n.show()
}

function nameList(events: DealEvent[], limit: number): string {
  const names = events.slice(0, limit).map((e) => e.name)
  const rest = events.length - names.length
  return rest > 0 ? `${names.join(', ')} +${rest} more` : names.join(', ')
}

export function notifyEvents(events: DealEvent[], cfg: AppConfig): void {
  const byTier = new Map<Tier, DealEvent[]>()
  for (const e of events) {
    const list = byTier.get(e.tier) ?? []
    list.push(e)
    byTier.set(e.tier, list)
  }

  for (const [tier, list] of byTier) {
    const individual = cfg.notifyMode === 'individual' || tier === 'free'

    if (individual && list.length <= MAX_INDIVIDUAL) {
      for (const e of list) toast(single(e, cfg))
      continue
    }

    // prea multe pentru toast-uri separate: arat primele si adun restul intr-unul
    if (individual) {
      for (const e of list.slice(0, MAX_INDIVIDUAL)) toast(single(e, cfg))
      const rest = list.slice(MAX_INDIVIDUAL)
      toast({
        title: TITLE[tier](rest.length),
        body: nameList(rest, 6),
        silent: true,
        onClick: () => showWindow?.()
      })
      continue
    }

    toast({
      title: TITLE[tier](list.length),
      body: nameList(list, 6),
      silent: !cfg.notifySound,
      onClick: () => showWindow?.()
    })
  }
}

function single(e: DealEvent, cfg: AppConfig): Parameters<typeof toast>[0] {
  const price = e.tier === 'free' ? 'FREE' : e.priceText
  const from = e.priceOriginalText ? ` (was ${e.priceOriginalText})` : ''
  const reviews = e.reviewPct != null ? ` · ${e.reviewPct}% of ${e.reviewCount ?? 0} reviews` : ''
  return {
    title: `${e.name} — ${price}`,
    body: `${STORE_LABEL[e.store]} · -${e.discountPct}%${from}${reviews}`,
    silent: !cfg.notifySound,
    onClick: () => void shell.openExternal(e.url)
  }
}

export function notifyWatch(
  hits: Array<{ deal: Deal; target: number | null }>,
  cfg: AppConfig
): void {
  if (hits.length === 1) {
    const { deal } = hits[0]
    toast({
      title: `Watchlist: ${deal.name} — ${deal.priceText}`,
      body: `-${deal.discountPct}%${deal.priceOriginalText ? ` from ${deal.priceOriginalText}` : ''}`,
      silent: !cfg.notifySound,
      onClick: () => void shell.openExternal(deal.url)
    })
    return
  }
  toast({
    title: `${hits.length} watchlisted games got cheaper`,
    body: hits
      .slice(0, 6)
      .map((h) => `${h.deal.name} ${h.deal.priceText}`)
      .join(', '),
    silent: !cfg.notifySound,
    onClick: () => showWindow?.()
  })
}

/* --------------------------------------------------------------------- Epic */

/**
 * Anunturile Epic. Sunt cateva jocuri pe saptamana, deci fiecare primeste
 * toast-ul lui - spre deosebire de praguri, unde vin sute deodata.
 *
 * Reminder-ul de expirare pleaca oricum, chiar daca ai revendicat deja jocul:
 * revendicarea se vede doar in contul tau Epic, iar aplicatia nu cere si nici
 * nu tine datele acelui cont.
 */
export function notifyEpic(
  kind: 'free' | 'upcoming' | 'expiring',
  games: EpicFreeGame[],
  cfg: AppConfig
): void {
  for (const g of games) {
    toast({
      title:
        kind === 'free'
          ? `Free on Epic: ${g.title}`
          : kind === 'upcoming'
            ? `Free on Epic soon: ${g.title}`
            : `Last chance: ${g.title}`,
      body:
        kind === 'upcoming'
          ? `Free from ${when(g.startsAt)}${g.priceText ? ` · normally ${g.priceText}` : ''}`
          : `Free until ${when(g.endsAt)}${g.priceText ? ` · normally ${g.priceText}` : ''}`,
      silent: !cfg.notifySound,
      onClick: () => void shell.openExternal(g.url)
    })
  }
}

/** Ora locala, ca sa se vada la ce ora a zilei se schimba oferta. */
function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}
