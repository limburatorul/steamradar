// Ruleaza o singura scanare completa fara interfata, cu progresul afisat in
// consola. Serveste la depanare: aici se vede daca se impotmoleste in retea, in
// parsare sau in scriere. `node scripts/scan-once.mjs`
import { spawn } from 'node:child_process'
import { build } from 'esbuild'
import { mkdtemp } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import electron from 'electron'

const dir = await mkdtemp(path.join(tmpdir(), 'steamradar-scan-'))
const bundle = path.join(dir, 'scanner.cjs')

await build({
  entryPoints: ['src/main/scanner.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  outfile: bundle,
  logLevel: 'silent'
})

const entry = path.join(dir, 'main.cjs')
writeFileSync(
  entry,
  `const { app } = require('electron')
const scanner = require(${JSON.stringify(bundle)})
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const t0 = Date.now()
  let last = 0
  scanner.onStatus((s) => {
    if (s.page !== last) { last = s.page; console.log(\`pagina \${s.page}/\${s.totalPages} · \${s.found} oferte · \${Math.round((Date.now()-t0)/1000)}s\`) }
  })
  const events = await scanner.scanFull()
  const st = scanner.getStatus()
  console.log('FAZA', st.phase, '|', st.message, '| eroare:', st.error)
  console.log('EVENIMENTE', events.length)
  scanner.stopSchedule()
  app.exit(st.phase === 'error' ? 1 : 0)
})
`
)

const child = spawn(electron, [entry], { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 1))
