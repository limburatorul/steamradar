// Capturi reale ale interfetei, fara fereastra Electron: serveste out/renderer cu un
// window.api fals alimentat din datele reale ale aplicatiei si le fotografiaza prin
// Chrome headless (CDP). Foloseste aceleasi applyQuery / tierOf / liveEpic ca aplicatia.
//
//   npm run build && node scripts/screenshots.mjs [dosar-date] [dosar-iesire]
//
// Ceasul paginii e mutat la momentul ultimei verificari Epic, ca ofertele din
// fisier sa nu fie deja expirate. Jocurile Adult Only sunt ascunse, ca in aplicatie.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { applyQuery } from '../src/shared/query.ts'
import { liveEpic } from '../src/shared/epic.ts'
import { tierOf } from '../src/main/diff.ts'

const DATA = process.argv[2] ?? join(process.env.APPDATA ?? '', 'steamradar')
const OUT = process.argv[3] ?? 'docs/screenshots'
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(existsSync)
if (!CHROME) throw new Error('Nu gasesc Chrome sau Edge')

const json = async (f, d) => JSON.parse(await readFile(join(DATA, f), 'utf8').catch(() => JSON.stringify(d)))
const catalog = await json('catalog.json')
const epic = await json('epic.json', { games: [], updatedAt: null })
const events = await json('events.json', [])
const history = await json('history.json', { games: {} })
const cfg = {
  countryCode: 'RO', freeIntervalMin: 10, fullIntervalMin: 60, requestDelayMs: 1200, maxPages: 40,
  thresholdLow: 5, thresholdHigh: 10, notify: { free: true, under5: true, under10: true },
  notifyEpic: { free: true, upcoming: true, expiring: true }, notifyGog: true, notifyMode: 'grouped',
  notifySound: true, includeDlc: false, minDiscountPct: 0, startMinimized: false, autoStart: false,
  closeToTray: true, updateCheckMin: 45, openInSteamClient: true, glassStyle: 'glass', backdrop: true,
  showAdult: false, ...(await json('config.json', {})), showAdult: false
}
const NOW = Date.parse(epic.updatedAt ?? catalog.updatedAt) + 3600_000
const deals = catalog.deals.filter((d) => !d.adult)
const live = liveEpic(epic.games, NOW)
const visible = new Set(deals.map((d) => d.key))
const shown = events.filter((e) => visible.has(e.key))

const stats = () => {
  const mk = () => ({ tracked: 0, free: 0, under5: 0, under10: 0 })
  const steam = mk(), gog = mk()
  for (const d of deals) {
    const b = d.store === 'gog' ? gog : steam
    b.tracked++
    const t = tierOf(d.priceFinal, cfg)
    if (t) b[t]++
  }
  return { steam, gog, epic: { current: live.filter((g) => g.current).length, upcoming: live.filter((g) => !g.current).length }, eventsToday: 0, unseen: 0 }
}

const MOCK = `
const real = Date.now.bind(Date), off = ${NOW} - real(); Date.now = () => real() + off
const post = (p, b) => fetch('/api/' + p, { method: 'POST', body: JSON.stringify(b ?? {}) }).then((r) => r.json())
const none = () => () => {}
window.api = {
  config: { get: () => post('config'), set: (p) => post('config'), dataFolder: async () => 'SteamRadar-Date', openDataFolder: async () => '' },
  deals: { query: (q) => post('query', q), lookup: (k) => post('lookup', k), stats: () => post('stats') },
  epic: { list: () => post('epic') },
  events: { list: (t) => post('events', t), markSeen: async () => {}, clear: async () => {} },
  watch: { list: async () => [], add: async () => [], remove: async () => [], update: async () => [] },
  scan: { status: () => post('status'), running: async () => false, full: async () => [], free: async () => [], cancel: async () => {}, onStatus: none },
  update: { check: async () => ({ available: false, currentVersion: '0.5.0' }), download: async () => ({ ok: true }), identity: async () => ({ ok: true, reason: '' }), onAvailable: none, onProgress: none },
  history: { get: (k) => post('history', [k]).then((r) => r[k] ?? null), many: (k) => post('history', k), tracked: async () => [], clear: async () => {} },
  version: async () => '0.5.0', openExternal: async () => true, openInSteam: async () => true
}`

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  const send = (body, type = 'application/json') => (res.writeHead(200, { 'content-type': type }), res.end(typeof body === 'string' ? body : JSON.stringify(body)))
  if (req.method === 'POST') {
    let raw = ''
    for await (const c of req) raw += c
    const b = raw ? JSON.parse(raw) : {}
    switch (req.url) {
      case '/api/config': return send(cfg)
      case '/api/query': {
        const all = applyQuery(deals, b, [cfg.thresholdLow, cfg.thresholdHigh])
        return send({ items: all.slice(b.offset ?? 0, (b.offset ?? 0) + (b.limit ?? 100)), total: all.length, currency: catalog.currency, updatedAt: catalog.updatedAt })
      }
      case '/api/lookup': return send(deals.filter((d) => b.includes(d.key)))
      case '/api/stats': return send(stats())
      case '/api/epic': return send({ updatedAt: epic.updatedAt, games: live })
      case '/api/events': return send(shown.filter((e) => typeof b !== 'string' || e.tier === b))
      case '/api/history': return send(Object.fromEntries(b.filter((k) => history.games[k]).map((k) => [k, history.games[k]])))
      case '/api/status': return send({ phase: 'idle', message: 'Scan complete', page: 0, totalPages: 0, found: deals.length, error: null, lastFullScan: new Date(NOW).toISOString(), lastFreeScan: new Date(NOW).toISOString(), lastEpicScan: new Date(NOW).toISOString() })
    }
  }
  if (req.url === '/mock.js') return send(MOCK, 'text/javascript')
  const file = join('out/renderer', req.url === '/' ? 'index.html' : req.url.split('?')[0])
  let body = await readFile(file).catch(() => null)
  if (!body) return (res.writeHead(404), res.end())
  if (file.endsWith('index.html')) body = body.toString().replace('<script type="module"', '<script src="/mock.js"></script><script type="module"')
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(body)
})
await new Promise((r) => server.listen(0, r))
const url = `http://localhost:${server.address().port}/`

const profile = await mkdtemp(join(tmpdir(), 'sr-shots-'))
const chrome = spawn(CHROME, [`--remote-debugging-port=9333`, `--user-data-dir=${profile}`, '--headless=new', '--hide-scrollbars', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  target = await fetch('http://localhost:9333/json').then((r) => r.json()).then((t) => t.find((x) => x.type === 'page')).catch(() => null)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id) }
const cdp = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
const run = (expr) => cdp('Runtime.evaluate', { expression: expr, awaitPromise: true })
const click = async (text) => { const r = await run(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); b?.click(); return b ? 'clicked' : 'MISSING' })()`); console.log(text, r.result?.result?.value ?? JSON.stringify(r)) }

await mkdir(OUT, { recursive: true })
const shot = async (name) => {
  await sleep(1200)
  const { result } = await cdp('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(OUT, `${name}.png`), Buffer.from(result.data, 'base64'))
  console.log('ok', name)
}

await cdp('Page.enable')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await cdp('Page.navigate', { url })
await sleep(2500)
await shot('01-radar')
await click('Under 5'); await shot('02-steam-under5')
await click('Epic'); await shot('03-epic-free')
await click('GOG'); await click('Under 10'); await shot('04-gog-under10')
await click('Alert history'); await shot('05-alert-history')
await click('Settings'); await shot('07-settings')

ws.close(); chrome.kill(); server.close()
