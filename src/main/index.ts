import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dataRoot, loadConfig } from './config'
import { moveDataFolder } from './datafolder'
import { ICON_APP } from './icon'
import { registerIpc } from './ipc'
import { writeCard } from './ecosystem'
import { setWindowOpener } from './notify'
import { cancelScan, onStatus, scanFull, schedule, stopSchedule } from './scanner'
import { getCatalog, shareWatchlist } from './store'
import { WATCH_SHARE_EVERY_MS } from './diff'
import { ensureNotificationIdentity } from './shortcut'
import { beginQuit, createTray, destroyTray, isQuitting, refreshTray } from './tray'
import {
  announceUpdate,
  cleanupOldExecutables,
  onUpdateAvailable,
  scheduleUpdateChecks,
  stopUpdateChecks
} from './updater'

let mainWindow: BrowserWindow | null = null

// Datele stau in %APPDATA%\ProtagonistLabs\SteamRadar (Ecosistem v3). Inainte de orice citire din
// userData, inclusiv lock-ul de instanta unica; o rulare din sursa foloseste folderul nou, dar nu-l muta.
const dataDir = path.join(app.getPath('appData'), 'ProtagonistLabs', 'SteamRadar')
app.setPath(
  'userData',
  app.isPackaged ? moveDataFolder(path.join(app.getPath('appData'), 'steamradar'), dataDir) : dataDir
)

// o singura instanta: doua procese ar bate amandoua in Steam si ar dubla toast-urile
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    title: 'SteamRadar',
    icon: nativeImage.createFromBuffer(Buffer.from(ICON_APP, 'base64')),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // izolarea contextului e obligatorie: renderer-ul primeste doar API-ul din preload
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow?.show()
  })

  // inchiderea ferestrei doar o ascunde: altfel s-ar opri si supravegherea,
  // adica exact lucrul pentru care exista aplicatia
  mainWindow.on('close', (e) => {
    void (async () => {
      const cfg = await loadConfig()
      if (cfg.closeToTray && !isQuitting()) {
        e.preventDefault()
        mainWindow?.hide()
      }
    })()
  })

  // link-urile externe se deschid in browserul implicit, nu intr-o fereastra Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', showWindow)

/*
 * What's new: o data dupa o actualizare. Versiunea vazuta sta in `last-seen-version`; lipsa ei, cu
 * un config.json de dinainte de pornirea asta, e o actualizare de la <=0.8. O instalare noua nu
 * are ce anunta. Se marcheaza vazut doar la inchiderea ferestrei, nu la deschidere.
 */
const seenFile = (): string => path.join(app.getPath('userData'), 'last-seen-version')
let whatsNewPending = false

function markWhatsNewSeen(): void {
  whatsNewPending = false
  try {
    writeFileSync(seenFile(), app.getVersion(), 'utf8')
  } catch {
    // profil needitabil: fereastra mai apare o data la pornirea urmatoare
  }
}

function checkWhatsNew(): void {
  let seen = ''
  try {
    seen = readFileSync(seenFile(), 'utf8').trim()
  } catch {
    // nimic inca
  }
  if (seen === app.getVersion()) return
  if (seen || existsSync(path.join(dataRoot(), 'config.json'))) whatsNewPending = true
  else markWhatsNewSeen()
}

/** Din tray: fereastra, apoi dialogul (o fereastra abia creata il cere singura prin `whatsnew:pending`). */
function openWhatsNew(): void {
  whatsNewPending = true
  showWindow()
  mainWindow?.webContents.send('whatsnew:open')
}

ipcMain.handle('whatsnew:pending', () => whatsNewPending)
ipcMain.handle('whatsnew:seen', () => markWhatsNewSeen())

app.whenReady().then(async () => {
  // declara AUMID-ul si scrie scurtatura din Start Menu care ii da numele:
  // fara ea, Windows pune "electron.app.Electron" deasupra notificarilor
  ensureNotificationIdentity()
  checkWhatsNew()

  const cfg = await loadConfig()
  app.setLoginItemSettings({
    openAtLogin: cfg.autoStart,
    args: cfg.startMinimized ? ['--hidden'] : []
  })

  setWindowOpener(showWindow)
  onUpdateAvailable((info) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:available', info)
  })
  registerIpc(() => mainWindow)
  createTray(showWindow, openWhatsNew)
  onStatus(() => void refreshTray(showWindow, openWhatsNew))

  if (!process.argv.includes('--hidden') || !cfg.startMinimized) createWindow()

  // cartea din folderul comun Protagonist Labs, la fiecare pornire (vezi ecosystem.ts)
  writeCard()
  void shareWatchlist()
  setInterval(() => void shareWatchlist(), WATCH_SHARE_EVERY_MS)

  // curat executabilele vechi ramase langa cel curent, cu reincercari:
  // procesul inlocuit poate tine inca lock pe fisierul lui
  cleanupOldExecutables()

  // prima scanare porneste dupa ce fereastra e vizibila, ca sa nu para blocata;
  // daca s-a scanat de curand, astept programarea normala
  const cat = await getCatalog()
  const age = cat.updatedAt ? Date.now() - Date.parse(cat.updatedAt) : Infinity
  if (age > cfg.fullIntervalMin * 60_000) {
    setTimeout(() => void scanFull(), 4000)
  } else {
    schedule()
  }

  // verificarea de actualizare e tacuta daca nu exista versiune noua; nu ruleaza
  // in dezvoltare, unde un banner ar oferi o actualizare fara cum sa se instaleze
  if (app.isPackaged) {
    setTimeout(() => void announceUpdate(), 8000)
    scheduleUpdateChecks(cfg.updateCheckMin)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// fereastra inchisa nu inseamna aplicatie inchisa: supravegherea continua in tray
app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  beginQuit()
  // timerele sunt cele care ar tine procesul viu dupa ce fereastra a disparut
  stopSchedule()
  stopUpdateChecks()
  cancelScan()
  destroyTray()
})
