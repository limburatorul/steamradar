import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyQuery } from '../src/shared/query.ts'
import { liveEpic } from '../src/shared/epic.ts'
import { diff, tierOf } from '../src/main/diff.ts'
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
