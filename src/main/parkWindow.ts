import { app, BrowserWindow, globalShortcut, screen } from 'electron'
import { join } from 'node:path'

// Park penceresi (PROJELER.md "Park alanı"): Ctrl Alt P, Unity ya da editör öndeyken bile küçük, kenarlıksız,
// her zaman üstte tek satır. Sadece uygulama açıkken çalışır (arka plan süreci değil, CLAUDE.md kural 3).
// Enter kaydeder ve pencere gizlenir; Windows odağı bir önceki uygulamaya verir.

export const PARK_SHORTCUT = 'CommandOrControl+Alt+P'
const WIDTH = 720
const HEIGHT = 96

let win: BrowserWindow | null = null

function create(): BrowserWindow {
  const w = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#131316',
    title: 'SecondMind · Park',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  w.setAlwaysOnTop(true, 'screen-saver')
  // Başka yere tıklanınca kaybolur (Enter'sız vazgeçmek gibi).
  w.on('blur', () => w.hide())
  w.on('closed', () => (win = null))
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void w.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/park`)
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/park' })
  }
  return w
}

function show(): void {
  win ??= create()
  const w = win
  if (w.isVisible()) {
    w.hide()
    return
  }
  // İmlecin olduğu ekranda, üstten %22.
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  w.setBounds({
    x: Math.round(area.x + (area.width - WIDTH) / 2),
    y: Math.round(area.y + area.height * 0.22),
    width: WIDTH,
    height: HEIGHT,
  })
  const reveal = () => {
    w.show()
    w.focus()
    w.webContents.send('park:shown')
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', reveal)
  else reveal()
}

export function hideParkWindow(): void {
  win?.hide()
}

/** Kısayolu kaydeder; pencere ilk kullanımda oluşur. Başka uygulama kısayolu tuttuysa false. */
export function registerParkShortcut(): boolean {
  const ok = globalShortcut.register(PARK_SHORTCUT, show)
  if (!ok) console.warn(`${PARK_SHORTCUT} başka bir uygulamada kayıtlı; park penceresi kısayolsuz.`)
  app.on('will-quit', () => globalShortcut.unregister(PARK_SHORTCUT))
  return ok
}

/** Ana pencere kapanınca park penceresi de kapanır (uygulama tamamen çıksın). */
export function destroyParkWindow(): void {
  win?.destroy()
  win = null
}
