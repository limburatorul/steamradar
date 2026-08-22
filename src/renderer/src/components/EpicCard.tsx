import type { EpicFreeGame } from '@shared/types'
import { countdown, dateTime } from '../format'

/**
 * Un joc gratis de pe Epic. N-are pret de urmarit si nici istoric, deci nu e un
 * rand de oferta, ci o cartela cu imaginea mare si fereastra de timp - singurul
 * lucru care conteaza la el e pana cand il mai poti lua.
 */
export default function EpicCard({ game }: { game: EpicFreeGame }): React.JSX.Element {
  const open = (): void => void window.api.openExternal(game.url)

  return (
    <div className={`epic-card${game.current ? ' is-free' : ''}`}>
      {game.image ? (
        <img className="epic-shot" src={game.image} alt="" onClick={open} />
      ) : (
        <div className="epic-shot" onClick={open} />
      )}

      <div className="epic-body">
        <div className="name" title={game.title} onClick={open}>
          {game.title}
        </div>
        <div className="meta">
          <span>{game.offerType}</span>
          {game.priceText && <span className="old">{game.priceText}</span>}
        </div>
        <div className={`epic-when${game.current ? ' now' : ''}`}>
          {game.current
            ? `Free for another ${countdown(game.endsAt)}`
            : `Free in ${countdown(game.startsAt)}`}
        </div>
        <div className="epic-window">
          {dateTime(game.startsAt)} → {dateTime(game.endsAt)}
        </div>
        <button className={game.current ? 'primary' : ''} onClick={open}>
          {game.current ? 'Claim on Epic' : 'Store page'}
        </button>
      </div>
    </div>
  )
}
