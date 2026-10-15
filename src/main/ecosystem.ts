import { app } from 'electron'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { shelfOwned } from './diff'

/**
 * Ecosistemul Protagonist Labs: un folder comun in `%APPDATA%\ProtagonistLabs`,
 * fara server si fara serviciu. Fiecare aplicatie isi scrie cartea de vizita in
 * `apps\<id>.json` si ce imparte in `data\<id>.<fel>.json`; celelalte citesc.
 * Contractul e in nota Ecosistem din vault.
 *
 * SteamRadar scrie lista de urmarire (Shelf arata ofertele) si citeste jocurile
 * din Shelf, ca sa nu anunte reduceri la jocuri pe care omul le are deja.
 * Fisierele altor aplicatii nu sunt de incredere: orice lipsa sau gunoi = absent.
 */

const ID = 'steamradar'

function root(): string {
  return path.join(app.getPath('appData'), 'ProtagonistLabs')
}

async function readCommon(rel: string): Promise<Record<string, unknown> | null> {
  try {
    const json = JSON.parse(await fs.readFile(path.join(root(), rel), 'utf8'))
    return json && json.schema === 1 ? json : null
  } catch {
    return null
  }
}

/** Scrie atomic, ca orice cititor sa vada fie fisierul vechi, fie pe cel nou. */
async function writeCommon(rel: string, body: Record<string, unknown>): Promise<void> {
  try {
    const file = path.join(root(), rel)
    await fs.mkdir(path.dirname(file), { recursive: true })
    const value = { schema: 1, updated: new Date().toISOString(), ...body }
    await fs.writeFile(`${file}.tmp`, JSON.stringify(value, null, 2), 'utf8')
    await fs.rename(`${file}.tmp`, file)
  } catch {
    // folderul comun e un bonus; o eroare aici nu are voie sa strice scanarea
  }
}

/** Cartea de vizita, la fiecare pornire. In dezvoltare exe-ul ar fi electron.exe, deci nu. */
export function writeCard(): void {
  if (!app.isPackaged) return
  void writeCommon(`apps/${ID}.json`, {
    id: ID,
    name: 'SteamRadar',
    version: app.getVersion(),
    // portabilul ruleaza dintr-un folder temporar; exe-ul real e cel de aici
    exe: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    edition: 'free',
    paid: false,
    page: 'https://protagonistlabs.app/steamradar/',
    commands: {}
  })
}

export interface WatchShare {
  name: string
  store: string
  appid?: number
  url: string
  onSale: boolean
  priceText?: string
  discountPct?: number
  targetPriceText?: string
}

export function writeWatchShare(items: WatchShare[]): Promise<void> {
  return writeCommon(`data/${ID}.watch.json`, { items })
}

/** Citit la fiecare scanare, deci un joc adaugat in Shelf conteaza de la urmatoarea. */
export async function readShelfOwned(): Promise<ReturnType<typeof shelfOwned>> {
  return shelfOwned(await readCommon('data/shelf.games.json'))
}

export interface Sisters {
  /** Id-urile aplicatiilor instalate (cartea exista si exe-ul inca e acolo). */
  installed: string[]
  /** A cumparat ceva: exista o carte `paid: true` cu `edition: "full"`. */
  bought: boolean
}

export async function readSisters(): Promise<Sisters> {
  const out: Sisters = { installed: [], bought: false }
  let names: string[] = []
  try {
    names = await fs.readdir(path.join(root(), 'apps'))
  } catch {
    return out
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const card = await readCommon(`apps/${name}`)
    if (!card || typeof card.id !== 'string' || typeof card.exe !== 'string') continue
    if (!existsSync(card.exe)) continue
    out.installed.push(card.id)
    if (card.paid === true && card.edition === 'full') out.bought = true
  }
  return out
}
