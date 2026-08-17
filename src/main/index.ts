import { app, BrowserWindow, nativeImage, shell } from 'electron'
import path from 'node:path'
import { loadConfig } from './config'
import { ICON_APP } from './icon'
import { registerIpc } from './ipc'
import { setWindowOpener } from './notify'
import { cancelScan, onStatus, scanFull, schedule, stopSchedule } from './scanner'
import { getCatalog } from './store'
import { beginQuit, createTray, destroyTray, isQuitting, refreshTray } from './tray'

let mainWindow: BrowserWindow | null = null

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

app.whenReady().then(async () => {
  // fara asta Windows nu leaga toast-urile de aplicatie si le arata cu numele
  // "electron.app.Electron", sau nu le arata deloc
  app.setAppUserModelId('ro.steamradar.app')

  const cfg = await loadConfig()
  app.setLoginItemSettings({
    openAtLogin: cfg.autoStart,
    args: cfg.startMinimized ? ['--hidden'] : []
  })

  setWindowOpener(showWindow)
  registerIpc(() => mainWindow)
  createTray(showWindow)
  onStatus(() => void refreshTray(showWindow))

  if (!process.argv.includes('--hidden') || !cfg.startMinimized) createWindow()

  // prima scanare porneste dupa ce fereastra e vizibila, ca sa nu para blocata;
  // daca s-a scanat de curand, astept programarea normala
  const cat = await getCatalog()
  const age = cat.updatedAt ? Date.now() - Date.parse(cat.updatedAt) : Infinity
  if (age > cfg.fullIntervalMin * 60_000) {
    setTimeout(() => void scanFull(), 4000)
  } else {
    schedule()
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
  cancelScan()
  destroyTray()
})
