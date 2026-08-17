import type { Deal } from '@shared/types'
import { count, endsIn, reviewLabel, reviewTone } from '../format'

interface Props {
  deal: Deal
  watched: boolean
  onToggleWatch: (deal: Deal) => void
  /** Text suplimentar la stanga pretului: momentul alertei, pragul de dinainte. */
  aside?: React.ReactNode
}

export default function DealRow({ deal, watched, onToggleWatch, aside }: Props): React.JSX.Element {
  const free = deal.priceFinal <= 0
  const open = (): void => void window.api.openExternal(deal.url)

  return (
    <div className={`deal${free ? ' is-free' : ''}`}>
      {deal.image ? (
        <img className="capsule" src={deal.image} alt="" onClick={open} style={{ cursor: 'pointer' }} />
      ) : (
        <div className="capsule" />
      )}

      <div className="body">
        <div className="name" title={deal.name} onClick={open} style={{ cursor: 'pointer' }}>
          {deal.name}
        </div>
        <div className="meta">
          {deal.reviewPct != null && (
            <span className={`reviews ${reviewTone(deal.reviewPct)}`}>
              {[reviewLabel(deal.reviewSummary), `${deal.reviewPct}% of ${count(deal.reviewCount)}`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
          {deal.released && <span>{deal.released}</span>}
          {deal.kind !== 'app' && (
            <span>{deal.kind === 'dlc' ? 'DLC' : deal.kind === 'sub' ? 'package' : 'bundle'}</span>
          )}
          {endsIn(deal.discountEndsAt) && <span>{endsIn(deal.discountEndsAt)}</span>}
          {aside}
        </div>
      </div>

      <div className="right">
        {deal.discountPct > 0 && (
          <span className={`badge${free ? '' : ' tier-under5'}`}>-{deal.discountPct}%</span>
        )}
        <div className="price">
          {deal.priceOriginalText && !free && <div className="old">{deal.priceOriginalText}</div>}
          {free && deal.priceOriginalText && <div className="old">{deal.priceOriginalText}</div>}
          <div className={`now${free ? ' free' : ''}`}>{free ? 'FREE' : deal.priceText}</div>
        </div>
        <button
          className={`star${watched ? ' on' : ''}`}
          title={watched ? 'Stop watching' : 'Watch this game'}
          onClick={() => onToggleWatch(deal)}
        >
          {watched ? '★' : '☆'}
        </button>
        <button onClick={open}>Steam</button>
      </div>
    </div>
  )
}
