import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { THEME_ARG_PREFIX, type Theme } from '@shared/ipc'
import { closeDb, getDb, openDb } from './db/client'
import { rolloverTasks } from './db/schedule'
import { folderPathById } from './db/shots'
import { getSetting } from './db/settings'
import { registerAppIpc } from './ipc/app'
import { registerBridgeIpc } from './ipc/bridge'
import { registerDumpIpc } from './ipc/dump'
import { registerKnowledgeIpc } from './ipc/knowledge'
import { registerMindIpc } from './ipc/mind'
import { registerPlanningIpc } from './ipc/planning'
import { registerProjectMemoryIpc } from './ipc/memory'
import { registerProjectsIpc } from './ipc/projects'
import { registerScanIpc } from './ipc/scan'
import { registerScheduleIpc } from './ipc/schedule'
import { registerSchoolIpc } from './ipc/school'
import { registerSettingsIpc } from './ipc/settings'
import {
  handleMediaProtocol,
  handleProjectFileProtocol,
  registerMediaScheme,
} from './mediaProtocol'
import { destroyParkWindow, hideParkWindow, registerParkShortcut } from './parkWindow'
import { ensureDataPaths } from './paths'
import { startReminderTimer } from './reminderTimer'

// tokens.css'teki --bg ile aynı; ilk boyamadan önce pencere zemini.
const BG: Record<Theme, string> = { light: '#FFFFFF', dark: '#0F0F13' }

let mainWindow: BrowserWindow | null = null

function applyTheme(theme: Theme): void {
  nativeTheme.themeSource = theme
  mainWindow?.setBackgroundColor(BG[theme])
}

function createWindow(theme: Theme): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: BG[theme],
    autoHideMenuBar: true,
    title: 'SecondMind',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [THEME_ARG_PREFIX + theme],
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    // Gizli park penceresi uygulamayı açık tutmasın.
    destroyParkWindow()
  })

  // Dış bağlantılar varsayılan tarayıcıda açılır, uygulama içinde yeni pencere açılmaz.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  registerMediaScheme()
  // Windows bildirimleri uygulama kimliğiyle gösterilir; Aşama 8'de electron-builder appId'si bununla aynı olmalı.
  app.setAppUserModelId('com.secondmind.app')

  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })

  void app.whenReady().then(() => {
    const paths = ensureDataPaths()
    openDb(paths.db, paths.backups)
    handleMediaProtocol(paths.media)
    handleProjectFileProtocol((id) => folderPathById(getDb(), id))
    // Gün sonu kaydırma açılışta: kaçırılan günlerin açık görevleri bugüne (Bugün her okumada da kontrol eder).
    rolloverTasks(getDb())

    registerAppIpc(paths)
    registerDumpIpc(paths)
    registerKnowledgeIpc(paths)
    registerPlanningIpc()
    registerScheduleIpc()
    registerMindIpc()
    registerProjectsIpc(hideParkWindow)
    registerProjectMemoryIpc(paths)
    registerBridgeIpc()
    registerScanIpc(paths)
    registerSchoolIpc(paths)
    registerSettingsIpc((key) => {
      if (key === 'theme') applyTheme(getSetting(getDb(), 'theme'))
    })

    // Tema pencere oluşmadan okunur: zemin rengi ve renderer'ın ilk sınıfı buna göre ayarlanır.
    const theme = getSetting(getDb(), 'theme')
    nativeTheme.themeSource = theme
    createWindow(theme)
    registerParkShortcut()
    const stopReminders = startReminderTimer({ window: () => mainWindow })
    app.on('will-quit', stopReminders)
  })

  // Arka plan süreci yok: son pencere kapanınca uygulama tamamen kapanır.
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => closeDb())
}
