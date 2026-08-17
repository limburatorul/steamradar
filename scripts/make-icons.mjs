// Deseneaza iconita aplicatiei si o scrie in trei forme: sursa TypeScript cu
// PNG-uri in base64 (pentru tray si fereastra, ca sa nu depind de fisiere care
// trebuie copiate langa executabil) si un .ico pentru electron-builder.
// `node scripts/make-icons.mjs`
import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'

const BG = [27, 40, 56] // albastrul inchis de Steam
const FG = [102, 192, 244] // albastrul deschis de Steam
const WHITE = [255, 255, 255]

/** Iconita: patrat rotunjit, cerc de radar si o sageata in jos (pretul scade). */
function draw(size) {
  const px = new Uint8Array(size * size * 4)
  const s = size
  const r = s * 0.22
  const set = (x, y, [cr, cg, cb], a = 255) => {
    if (x < 0 || y < 0 || x >= s || y >= s) return
    const i = (y * s + x) * 4
    const na = a / 255
    px[i] = Math.round(px[i] * (1 - na) + cr * na)
    px[i + 1] = Math.round(px[i + 1] * (1 - na) + cg * na)
    px[i + 2] = Math.round(px[i + 2] * (1 - na) + cb * na)
    px[i + 3] = Math.max(px[i + 3], a)
  }

  // fundal cu colturi rotunjite, cu antialiasing pe margine
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = Math.max(r - x, 0, x - (s - 1 - r))
      const dy = Math.max(r - y, 0, y - (s - 1 - r))
      const d = Math.hypot(dx, dy)
      const a = d <= r - 1 ? 255 : d >= r + 0.5 ? 0 : Math.round(255 * (r + 0.5 - d) / 1.5)
      if (a > 0) set(x, y, BG, a)
    }
  }

  // inelele de radar
  const cx = s / 2
  const cy = s * 0.54
  for (const [rad, w] of [
    [s * 0.34, s * 0.055],
    [s * 0.2, s * 0.05]
  ]) {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const d = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - rad)
        if (d < w / 2) set(x, y, FG, Math.round(255 * Math.min(1, (w / 2 - d) * 2)))
      }
    }
  }

  // sageata in jos, in mijloc
  const ah = s * 0.42
  const aw = s * 0.24
  const top = cy - ah / 2
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const fx = x + 0.5 - cx
      const fy = y + 0.5 - top
      const stem = Math.abs(fx) < s * 0.055 && fy > 0 && fy < ah * 0.62
      const head =
        fy >= ah * 0.5 && fy <= ah && Math.abs(fx) <= (aw / 2) * (1 - (fy - ah * 0.5) / (ah * 0.5))
      if (stem || head) set(x, y, WHITE)
    }
  }
  return px
}

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const px = draw(size)
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filtru "none" pe fiecare linie
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // biti pe canal
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** ICO poate purta direct PNG-uri, deci nu trebuie sa scriu si un codor BMP. */
function ico(sizes) {
  const images = sizes.map((s) => ({ size: s, data: png(s) }))
  const header = Buffer.alloc(6 + images.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach((img, i) => {
    const e = 6 + i * 16
    header[e] = img.size >= 256 ? 0 : img.size
    header[e + 1] = img.size >= 256 ? 0 : img.size
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(img.data.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += img.data.length
  })
  return Buffer.concat([header, ...images.map((i) => i.data)])
}

await mkdir('build', { recursive: true })
await writeFile('build/icon.ico', ico([16, 24, 32, 48, 64, 128, 256]))
await writeFile('build/icon.png', png(256))
await writeFile(
  'src/main/icon.ts',
  `// Generat de scripts/make-icons.mjs. Nu edita de mana.\n` +
    `// PNG-urile stau in sursa ca sa nu depinda de fisiere copiate langa executabil.\n` +
    `export const ICON_TRAY = '${png(32).toString('base64')}'\n\n` +
    `export const ICON_APP = '${png(256).toString('base64')}'\n`
)
console.log('build/icon.ico, build/icon.png, src/main/icon.ts')
