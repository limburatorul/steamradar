import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyQuery } from '../src/shared/query.ts'
import { liveEpic } from '../src/shared/epic.ts'
import {
  diff,
  localExe,
  readShelf,
  shareAppid,
  shelfIndex,
  shelfOwned,
  tierOf,
  toNotify,
  WATCH_SHARE_EVERY_MS
} from '../src/main/diff.ts'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
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
      updated: new Date().toISOString(),
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

test('Shelf: fisierul cere schema 1, updated valid (oricat de vechi), tipuri corecte', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  const game = { name: 'Hades', steamAppId: 1145360 }
  const ids = (o: object): number[] => [...shelfIndex({ schema: 1, games: [game], ...o }, now).ids]
  assert.deepEqual(ids({ updated: '2026-10-20T11:00:00Z' }), [1145360])
  // Shelf nedeschis de 60 de zile: jocurile tot ale omului sunt
  assert.deepEqual(ids({ updated: '2026-08-21T12:00:00Z' }), [1145360])
  assert.deepEqual(ids({ updated: '2026-10-21T11:00:00Z' }), [1145360]) // ceas decalat cu 23 h
  assert.deepEqual(ids({ updated: '2026-10-25T00:00:00Z' }), []) // in viitor: n-ar expira niciodata
  assert.deepEqual(ids({ updated: 'ieri' }), [])
  assert.deepEqual(ids({ updated: 1760000000000 }), [])
  assert.deepEqual(ids({}), [])
  assert.deepEqual(ids({ updated: '2026-10-20T11:00:00Z', schema: 2 }), [])
  // tipuri gresite pe jocuri: sarite, fara exceptii
  const odd = shelfIndex(
    {
      schema: 1,
      updated: '2026-10-20T11:00:00Z',
      games: [
        { name: 'A', steamAppId: '570' },
        { name: 'B', steamAppId: 1.5 },
        { name: 'C', steamAppId: -3 },
        { name: 42, steamAppId: 10 },
        { name: 'x'.repeat(501), steamAppId: 11 },
        'joc',
        { name: 'Celeste', steamAppId: 504230 }
      ]
    },
    now
  )
  assert.deepEqual([...odd.ids], [504230])
  assert.deepEqual([...odd.noIdNames].sort(), ['a', 'b', 'c'])
})

test('localExe: doar cai locale cu litera de disc, refuzate UNC si dispozitive', () => {
  assert.equal(localExe(String.raw`C:\Program Files\Shelf\Shelf.exe`), true)
  assert.equal(localExe('d:/Games/Shelf.EXE'), true)
  for (const bad of [
    String.raw`\\server\share\Shelf.exe`,
    '//server/share/Shelf.exe',
    String.raw`\\?\C:\Shelf.exe`,
    String.raw`\\.\pipe\x.exe`,
    String.raw`\\?\UNC\server\share\Shelf.exe`,
    'Shelf.exe',
    'C:Shelf.exe',
    String.raw`C:\Shelf\notes.txt`,
    42,
    null
  ]) {
    assert.equal(localExe(bad), false, String(bad))
  }
})

test('readShelf: fisiere sintetice pe disc, cu card, fara card, BOM, gunoi', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'steamradar-shelf-'))
  mkdirSync(path.join(root, 'apps'))
  mkdirSync(path.join(root, 'data'))
  const exe = path.join(root, 'Shelf.exe')
  writeFileSync(exe, '')
  const card = (o: object): void =>
    writeFileSync(path.join(root, 'apps', 'shelf.json'), JSON.stringify({ schema: 1, id: 'shelf', exe, ...o }))
  const games = (text: string): void => writeFileSync(path.join(root, 'data', 'shelf.games.json'), text)
  const good = JSON.stringify({
    schema: 1,
    updated: new Date().toISOString(),
    games: [{ name: 'Hades', steamAppId: 1145360 }]
  })
  const owned = async (): Promise<number[]> => [...shelfIndex(await readShelf(root)).ids]

  games(good)
  assert.deepEqual(await owned(), []) // fara card: Shelf nu e instalat
  card({})
  assert.deepEqual(await owned(), [1145360])
  games(String.fromCharCode(0xfeff) + good) // BOM de la Notepad
  assert.deepEqual(await owned(), [1145360])

  card({ exe: path.join(root, 'lipsa.exe') }) // dezinstalat
  assert.deepEqual(await owned(), [])
  card({ exe: String.raw`\\127.0.0.1\c$\Shelf.exe` }) // UNC: refuzat fara acces la retea
  assert.deepEqual(await owned(), [])
  card({ id: 'stash' })
  assert.deepEqual(await owned(), [])
  card({ schema: 2 })
  assert.deepEqual(await owned(), [])
  writeFileSync(path.join(root, 'apps', 'shelf.json'), '{ not json')
  assert.deepEqual(await owned(), [])

  card({})
  for (const bad of ['', 'null', '[]', '{"schema":1,"games":"x"}', '{ trunchiat']) {
    games(bad)
    assert.deepEqual(await owned(), [], bad)
  }
  // peste 16 MB: refuzat inainte de JSON.parse
  games(good.slice(0, -1) + ',"pad":"' + 'x'.repeat(16 * 1024 * 1024) + '"}')
  assert.deepEqual(await owned(), [])
  rmSync(root, { recursive: true })
})

test('steamradar.watch.json: appid doar numar intreg, rescris des fata de pragul de 48 h al Shelf', () => {
  assert.equal(shareAppid(1145360), 1145360)
  for (const bad of ['1145360', null, undefined, 0, -5, 1.5, NaN, {}]) {
    assert.equal(shareAppid(bad), undefined, String(bad))
  }
  // ce ajunge in fisier: JSON.stringify pastreaza numarul, iar undefined dispare
  const json = JSON.parse(JSON.stringify({ appid: shareAppid(570) }, null, 2))
  assert.equal(typeof json.appid, 'number')
  assert.equal('appid' in JSON.parse(JSON.stringify({ appid: shareAppid('570') })), false)
  // doua rescrieri pierdute tot raman sub 48 h
  assert.ok(WATCH_SHARE_EVERY_MS * 3 < 48 * 3_600_000)
})
