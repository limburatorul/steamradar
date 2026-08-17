import { useEffect, useRef, useState } from 'react'

/**
 * Fundalul rotativ, construit din capsulele ofertelor.
 *
 * Rostul lui nu e decorativ: sticla de pe bara laterala si de pe cea de sus n-are
 * ce sa estompeze peste o culoare plata, deci fara el toate cele trei stiluri
 * arata identic. Doua straturi care se incruciseaza, ca schimbarea sa fie o
 * trecere, nu o clipire.
 */

const EVERY_MS = 22_000

export default function Backdrop({ refreshKey }: { refreshKey: number }): React.JSX.Element {
  const [images, setImages] = useState<string[]>([])
  const [slots, setSlots] = useState<[string | null, string | null]>([null, null])
  const [active, setActive] = useState(0)
  const index = useRef(0)

  useEffect(() => {
    // capsulele celor mai bune oferte: cele mai recunoscute, si oricum
    // deja descarcate de listele din spatele lor
    void window.api.deals
      .query({ sort: 'reviews', limit: 24, reviewedOnly: true })
      .then((r) => setImages(r.items.map((d) => d.image).filter((s): s is string => !!s)))
  }, [refreshKey])

  useEffect(() => {
    if (!images.length) return
    index.current = 0
    setSlots([images[0], null])
    setActive(0)

    const timer = setInterval(() => {
      index.current = (index.current + 1) % images.length
      const next = images[index.current]
      setActive((a) => {
        const other = a === 0 ? 1 : 0
        setSlots((s) => (other === 0 ? [next, s[1]] : [s[0], next]))
        return other
      })
    }, EVERY_MS)

    return () => clearInterval(timer)
  }, [images])

  return (
    <div className="backdrop-layer">
      {slots.map((src, i) => (
        <div
          key={i}
          className={`backdrop-image${active === i && src ? ' is-active' : ''}`}
          style={src ? { backgroundImage: `url("${src}")` } : undefined}
        />
      ))}
    </div>
  )
}
