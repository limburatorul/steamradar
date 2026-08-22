// Verifica pe viu ca cele trei surse inca raspund si ca maparea inca extrage
// campurile. Cand aplicatia nu mai gaseste nimic, aici se vede daca defectul e
// la magazin sau in codul meu. `npm run probe`.
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const cc = process.argv[2] ?? 'RO'

const dir = await mkdtemp(path.join(tmpdir(), 'steamradar-probe-'))

async function load(name) {
  const outfile = path.join(dir, `${name}.mjs`)
  await build({
    entryPoints: [`src/main/${name}.ts`],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent'
  })
  return import(pathToFileURL(outfile).href)
}

const { fetchDiscountedPage, fetchFreeToKeep, currencyOf } = await load('steam')
const { fetchGogPage, fetchGogGiveaway, currencyFor } = await load('gog')
const { fetchEpicFreeGames } = await load('epic')

const show = (deals, n = 3) => {
  for (const d of deals.slice(0, n)) {
    console.log(
      `       -${String(d.discountPct).padStart(3)}%  ${d.priceText.padStart(8)}  ` +
        `${d.reviewPct == null ? '  -' : String(d.reviewPct).padStart(3)}%/${String(d.reviewCount ?? 0).padStart(7)}  ${d.name}`
    )
  }
}

const pause = () => new Promise((r) => setTimeout(r, 1200))

let failed = 0
let steamCurrency = null
let gogCurrency = null

/* ------------------------------------------------------------------- Steam */

try {
  const page = await fetchDiscountedPage({ countryCode: cc, start: 0, count: 100 })
  const ok = page.deals.length > 0
  if (!ok) failed++
  steamCurrency = currencyOf(page.deals)
  console.log(
    `${ok ? 'OK  ' : 'GOL '} Steam magazin        total=${String(page.total).padStart(6)} primite=${page.received} mapate=${page.deals.length} moneda=${steamCurrency}`
  )
  const best = [...page.deals].sort((a, b) => b.discountPct - a.discountPct)
  show(best)

  // paginarea trebuie sa fie repetabila: fara sortare stabila, doua cereri
  // identice n-au niciun element comun si maturarea pierde mii de jocuri
  const again = await fetchDiscountedPage({ countryCode: cc, start: 0, count: 100 })
  const same = page.deals.every((d, i) => again.deals[i]?.key === d.key)
  console.log(`${same ? 'OK  ' : 'RAU '} Steam paginare       (aceeasi cerere, aceeasi ordine)`)
  if (!same) failed++
} catch (err) {
  failed++
  console.log(`EROARE Steam magazin: ${err.message}`)
}

await pause()

try {
  const free = await fetchFreeToKeep(cc)
  console.log(`OK   Steam gratis         ${free.length} la -100%`)
  show(free, 10)
} catch (err) {
  failed++
  console.log(`EROARE Steam gratis: ${err.message}`)
}

await pause()

/* --------------------------------------------------------------------- GOG */

try {
  const page = await fetchGogPage({ countryCode: cc, page: 1 })
  const ok = page.deals.length > 0
  if (!ok) failed++
  gogCurrency = currencyOf(page.deals)
  console.log(
    `${ok ? 'OK  ' : 'GOL '} GOG catalog          total=${String(page.total).padStart(6)} pagini=${page.pages} primite=${page.received} mapate=${page.deals.length} moneda=${gogCurrency} (cerut ${currencyFor(cc)})`
  )
  show([...page.deals].sort((a, b) => b.discountPct - a.discountPct))

  const again = await fetchGogPage({ countryCode: cc, page: 1 })
  const same = page.deals.every((d, i) => again.deals[i]?.key === d.key)
  console.log(`${same ? 'OK  ' : 'RAU '} GOG paginare         (aceeasi cerere, aceeasi ordine)`)
  if (!same) failed++
} catch (err) {
  failed++
  console.log(`EROARE GOG catalog: ${err.message}`)
}

// cele doua magazine intra in acelasi catalog si trec prin aceleasi praguri:
// daca vin in monede diferite, si pragurile, si alertele sunt gresite
if (steamCurrency && gogCurrency) {
  const same = steamCurrency === gogCurrency
  if (!same) failed++
  console.log(
    `${same ? 'OK  ' : 'RAU '} moneda comuna        Steam=${steamCurrency} GOG=${gogCurrency}`
  )
}

await pause()

try {
  const gift = await fetchGogGiveaway()
  console.log(
    gift
      ? `OK   GOG giveaway         ${gift.name}`
      : 'OK   GOG giveaway         niciunul acum (404 e raspunsul obisnuit)'
  )
} catch (err) {
  failed++
  console.log(`EROARE GOG giveaway: ${err.message}`)
}

/* -------------------------------------------------------------------- Epic */

try {
  const games = await fetchEpicFreeGames(cc)
  const now = games.filter((g) => g.current)
  const next = games.filter((g) => !g.current)
  if (!games.length) failed++
  console.log(
    `${games.length ? 'OK  ' : 'GOL '} Epic gratis          ${now.length} acum, ${next.length} anuntate`
  )
  for (const g of games) {
    const when = g.current ? `pana la ${g.endsAt}` : `din ${g.startsAt}`
    console.log(
      `       ${g.current ? 'ACUM  ' : 'URMEAZA'} ${when}  ${g.priceText ?? '     -'}  ${g.title}`
    )
    if (!g.image) console.log('       ATENTIE: fara imagine')
  }
} catch (err) {
  failed++
  console.log(`EROARE Epic: ${err.message}`)
}

await rm(dir, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
