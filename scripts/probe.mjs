// Verifica pe viu ca sursele Steam inca raspund si ca maparea inca extrage
// campurile. Cand aplicatia nu mai gaseste nimic, aici se vede daca defectul e
// la Steam sau in codul meu. `npm run probe`.
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const cc = process.argv[2] ?? 'RO'

const dir = await mkdtemp(path.join(tmpdir(), 'steamradar-probe-'))
const outfile = path.join(dir, 'steam.mjs')
await build({
  entryPoints: ['src/main/steam.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'silent'
})
const { fetchDiscountedPage, fetchFreeToKeep, currencyOf } = await import(
  pathToFileURL(outfile).href
)

const show = (deals, n = 3) => {
  for (const d of deals.slice(0, n)) {
    console.log(
      `       -${String(d.discountPct).padStart(3)}%  ${d.priceText.padStart(8)}  ` +
        `${d.reviewPct == null ? '  -' : String(d.reviewPct).padStart(3)}%/${String(d.reviewCount ?? 0).padStart(7)}  ${d.name}`
    )
  }
}

let failed = 0

try {
  const page = await fetchDiscountedPage({ countryCode: cc, start: 0, count: 100 })
  const ok = page.deals.length > 0
  if (!ok) failed++
  console.log(
    `${ok ? 'OK  ' : 'GOL '} interogare magazin   total=${String(page.total).padStart(6)} primite=${page.received} mapate=${page.deals.length} moneda=${currencyOf(page.deals)}`
  )
  const best = [...page.deals].sort((a, b) => b.discountPct - a.discountPct)
  show(best)

  // paginarea trebuie sa fie repetabila: fara sortare stabila, doua cereri
  // identice n-au niciun element comun si maturarea pierde mii de jocuri
  const again = await fetchDiscountedPage({ countryCode: cc, start: 0, count: 100 })
  const same = page.deals.every((d, i) => again.deals[i]?.key === d.key)
  console.log(`${same ? 'OK  ' : 'RAU '} paginare repetabila  (aceeasi cerere, aceeasi ordine)`)
  if (!same) failed++
} catch (err) {
  failed++
  console.log(`EROARE interogare magazin: ${err.message}`)
}

await new Promise((r) => setTimeout(r, 1200))

try {
  const free = await fetchFreeToKeep(cc)
  console.log(`OK   jocuri gratis        ${free.length} la -100%`)
  show(free, 10)
} catch (err) {
  failed++
  console.log(`EROARE jocuri gratis: ${err.message}`)
}

await rm(dir, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
