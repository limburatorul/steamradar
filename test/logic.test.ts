import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyQuery } from '../src/shared/query.ts'
import { liveEpic } from '../src/shared/epic.ts'
import { diff, shelfOwned, tierOf, toNotify } from '../src/main/diff.ts'
import type { AppConfig, Deal, EpicFreeGame } from '../src/shared/types.ts'

const cfg = { thresholdLow: 5, thresholdHigh: 10, showAdult: false } as AppConfig

const deal = (o: Partial<Deal> & { key: string }): Deal => ({
  store: 'steam',
  appid: 1,
  kind: 'app',
  name: o.key,
  url: '',
  image: null,
  released: null,
  priceFinal: 300,
  priceOriginal: 1000,
  discountPct: 70,
  priceText: '3,00€',
  priceOriginalText: null,
  discountEndsAt: null,
  reviewSummary: null,
  reviewPct: 80,
  reviewCount: 100,
  platforms: { win: true, mac: false, linux: false },
  ...o
})

test('tierOf: limitele sunt stricte, gratis include 0', () => {
  assert.equal(tierOf(0, cfg), 'free')
  assert.equal(tierOf(499, cfg), 'under5')
  assert.equal(tierOf(500, cfg), 'under10')
  assert.equal(tierOf(1000, cfg), null)
})

test('diff: alerta doar la coborare intr-un prag mai bun', () => {
  const prev = new Map([['a', deal({ key: 'a', priceFinal: 700 })], ['b', deal({ key: 'b', priceFinal: 300 })]])
  const now = [
    deal({ key: 'a', priceFinal: 300 }), // under10 -> under5: alerta
    deal({ key: 'b', priceFinal: 300 }), // acelasi prag: nimic
    deal({ key: 'c', priceFinal: 0 }) // nou, gratis: alerta
  ]
  const out = diff(now, prev, cfg)
  assert.deepEqual(out.map((e) => [e.key, e.tier, e.fromTier]), [
    ['c', 'free', null],
    ['a', 'under5', 'under10']
  ])
})

test('diff: un joc care urca de prag nu alerteaza, iar adultii ascunsi nu intra', () => {
  const prev = new Map([['a', deal({ key: 'a', priceFinal: 300 })]])
  const now = [deal({ key: 'a', priceFinal: 700 }), deal({ key: 'x', priceFinal: 0, adult: true })]
  assert.equal(diff(now, prev, cfg).length, 0)
  assert.equal(diff(now, prev, { ...cfg, showAdult: true }).length, 1)
})

test('applyQuery: filtre si sortare', () => {
  const deals = [
    deal({ key: 'a', priceFinal: 100, discountPct: 90, reviewPct: 95, reviewCount: 6000 }),
    deal({ key: 'b', priceFinal: 250, discountPct: 50, platforms: { win: true, mac: true, linux: false } }),
    deal({ key: 'c', priceFinal: 400, discountPct: 80, kind: 'bundle', reviewCount: null, reviewPct: null })
  ]
  const keys = (q: object): string[] => applyQuery(deals, q, [5, 10]).map((d) => d.key)
  assert.deepEqual(keys({}), ['a', 'c', 'b'])
  assert.deepEqual(keys({ maxPrice: 250 }), ['a', 'b'])
  assert.deepEqual(keys({ platform: 'mac' }), ['b'])
  assert.deepEqual(keys({ appsOnly: true }), ['a', 'b'])
  assert.deepEqual(keys({ minReviewPct: 90 }), ['a'])
  assert.deepEqual(keys({ minReviews: 5000 }), ['a'])
  assert.deepEqual(keys({ reviewedOnly: true }), ['a', 'b'])
  assert.deepEqual(keys({ sort: 'price' }), ['a', 'b', 'c'])
})

test('liveEpic: expirate dispar, anuntate devin gratis la ora de start', () => {
  const g = (id: string, s: string, e: string, current: boolean): EpicFreeGame => ({
    id, title: id, image: null, url: '', priceText: null, offerType: 'Game', startsAt: s, endsAt: e, current
  })
  const now = Date.parse('2026-09-12T12:00:00Z')
  const out = liveEpic(
    [
      g('old', '2026-09-03T15:00:00Z', '2026-09-10T15:00:00Z', true),
      g('started', '2026-09-12T10:00:00Z', '2026-09-19T10:00:00Z', false),
      g('next', '2026-09-19T10:00:00Z', '2026-09-26T10:00:00Z', false)
    ],
    now
  )
  assert.deepEqual(out.map((x) => [x.id, x.current]), [['started', true], ['next', false]])
})

test('checksumOk: acceptat doar cu SHA-256 care se potriveste', async () => {
  const { checksumOk } = await import('../src/main/checksum.ts')
  const data = Buffer.from('installer bytes')
  const good = 'sha256:' + (await import('node:crypto')).createHash('sha256').update(data).digest('hex')
  assert.equal(checksumOk(data, good), true)
  assert.equal(checksumOk(data, good.toUpperCase().replace('SHA256', 'sha256')), true)
  assert.equal(checksumOk(Buffer.from('tampered'), good), false)
  assert.equal(checksumOk(data, undefined), false) // fara digest: refuzat
  assert.equal(checksumOk(data, ''), false)
  assert.equal(checksumOk(data, 'sha512:abc'), false) // ilizibil: refuzat, nu ignorat
})

test('Shelf: jocurile detinute nu suna, nici din praguri, nici din lista de urmarire', () => {
  // forma din contractul Ecosistem: shelf.games.json scris de Shelf
  const shelf = JSON.parse(
    JSON.stringify({
      schema: 1,
      updated: '2026-10-15T09:00:00Z',
      games: [
        { id: 's1', name: 'Hades', store: 'steam', steamAppId: 1145360, saves: [], canMove: true },
        { id: 'e1', name: 'DOOM™: Eternal', store: 'epic', saves: [], canMove: false },
        { id: 's2', name: 'Doom', store: 'steam', steamAppId: 2280, saves: [], canMove: true },
        { id: 'x', store: 'manual' } // fara nume: ignorat
      ]
    })
  )
  const owned = shelfOwned(shelf)
  const cfgN = { ...cfg, notify: { free: true, under5: true, under10: true }, notifyGog: true } as AppConfig
  const prev = new Map<string, Deal>()
  const now = [
    deal({ key: 'App_1145360', appid: 1145360, name: 'Hades', priceFinal: 0 }), // acelasi appid
    deal({ key: 'App_782330', appid: 782330, name: 'DOOM Eternal', priceFinal: 300 }), // nume, joc Epic fara appid
    deal({ key: 'App_379720', appid: 379720, name: 'DOOM', priceFinal: 300 }), // alt appid, acelasi nume: NU
    deal({ key: 'Gog_1', store: 'gog', appid: null, name: 'Hades', priceFinal: 300 }), // GOG: dupa nume
    deal({ key: 'App_9', appid: 9, name: 'Celeste', priceFinal: 300 })
  ]
  const events = diff(now, prev, cfgN)
  assert.equal(events.length, 5) // istoricul le pastreaza pe toate
  assert.deepEqual(toNotify(events, cfgN, owned).map((e) => e.key).sort(), ['App_379720', 'App_9'])

  // lista de urmarire foloseste acelasi predicat pe oferte
  assert.equal(owned(now[0]), true)
  assert.equal(owned(now[4]), false)

  // fisier lipsa sau stricat = nimic detinut
  for (const bad of [null, {}, { games: 'x' }, { games: [null, 5] }]) {
    assert.equal(toNotify(events, cfgN, shelfOwned(bad)).length, 5)
  }
})
