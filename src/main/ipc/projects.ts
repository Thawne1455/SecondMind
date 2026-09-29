import { BrowserWindow, dialog, shell } from 'electron'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Briefing, FolderInspection, IpcEvent } from '@shared/ipc'
import { getDb } from '../db/client'
import { projectBriefing, projectScanInfo } from '../db/projectInfo'
import {
  addParking,
  closeSession,
  createProject,
  deleteProject,
  discardSession,
  folderOwner,
  listParking,
  listProjects,
  listSessions,
  markProjectOpened,
  projectColors,
  projectFolderPath,
  resolveParking,
  restoreParking,
  restoreProject,
  startSession,
  updateProject,
} from '../db/projects'
import {
  guessProjectKind,
  parseUnityVersion,
  pickProjectColor,
  projectNameFromPath,
} from '../domain/projects'
import { handle } from './handle'

// Projeler, oturumlar, park alanı (Aşama 5a). Klasörler sadece okunur; SecondMind proje klasörüne yazmaz.

/** Kökte bu adlardan biri varsa kod projesi sayılır. */
const CODE_MARKERS =
  /^(package\.json|cargo\.toml|pyproject\.toml|go\.mod|cmakelists\.txt|.*\.sln)$/i

const REOPEN_MS = 15_000
const recentOpens = new Map<string, { at: number; briefing: Briefing | null }>()

function inspectFolder(path: string): FolderInspection {
  // Windows biçimi (ters eğik çizgi); sonda ayraç yok.
  const clean = resolve(path).replace(/[\\/]+$/, '')
  const exists = existsSync(clean) && statSync(clean).isDirectory()
  let unityVersion: string | null = null
  let git = false
  let code = false
  if (exists) {
    const versionFile = join(clean, 'ProjectSettings', 'ProjectVersion.txt')
    if (existsSync(versionFile))
      unityVersion = parseUnityVersion(readFileSync(versionFile, 'utf8')) ?? '?'
    git = existsSync(join(clean, '.git'))
    try {
      code = readdirSync(clean).some((n) => CODE_MARKERS.test(n))
    } catch {
      code = false
    }
  }
  return {
    path: clean,
    exists,
    name: projectNameFromPath(clean),
    kind: guessProjectKind({ unity: unityVersion !== null, git, code }),
    unityVersion: unityVersion === '?' ? null : unityVersion,
    git,
    takenBy: folderOwner(getDb(), clean),
    color: pickProjectColor(projectColors(getDb())),
  }
}

/** Başka pencere (park penceresi) veriyi değiştirdi: hepsi yenilensin. */
export function broadcast(event: IpcEvent): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(event)
}

export function registerProjectsIpc(hidePark: () => void): void {
  handle('project:list', () => listProjects(getDb()))
  handle('project:create', (input) => ({ id: createProject(getDb(), input) }))
  handle('project:update', (input) => updateProject(getDb(), input))
  handle('project:opened', ({ id }) => {
    // Aynı açılışın tekrarı (React StrictMode, hızlı geri-ileri) brifingi kaybetmesin: kısa süre aynı sonuç.
    const cached = recentOpens.get(id)
    if (cached && Date.now() - cached.at < REOPEN_MS) return cached.briefing
    const briefing = projectBriefing(getDb(), id)
    markProjectOpened(getDb(), id)
    recentOpens.set(id, { at: Date.now(), briefing })
    return briefing
  })
  handle('project:scanInfo', ({ id }) => projectScanInfo(getDb(), id))
  handle('project:delete', ({ id }) => deleteProject(getDb(), id))
  handle('project:restore', ({ id }) => restoreProject(getDb(), id))
  handle('project:pickFolder', async () => {
    const owner = BrowserWindow.getFocusedWindow()
    const options = { title: 'Proje klasörünü seç', properties: ['openDirectory' as const] }
    const res = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  handle('project:inspectFolder', ({ path }) => inspectFolder(path))
  handle('project:openFolder', async ({ id }) => {
    const path = projectFolderPath(getDb(), id)
    if (!path) throw new Error('Projeye bağlı klasör yok')
    const err = await shell.openPath(path)
    if (err) throw new Error(`Klasör açılamadı: ${path}`)
  })

  handle('session:start', (input) => {
    const s = startSession(getDb(), input)
    broadcast('projects:changed')
    return s
  })
  handle('session:close', (input) => {
    const s = closeSession(getDb(), input)
    broadcast('projects:changed')
    return s
  })
  handle('session:discard', ({ id }) => discardSession(getDb(), id))
  handle('session:list', ({ projectId, limit }) => listSessions(getDb(), projectId, limit))

  handle('parking:list', ({ projectId }) => listParking(getDb(), projectId))
  handle('parking:add', (input) => {
    const item = addParking(getDb(), input)
    broadcast('projects:changed')
    return item
  })
  handle('parking:resolve', ({ id, action }) => resolveParking(getDb(), id, action))
  handle('parking:restore', ({ id }) => restoreParking(getDb(), id))
  handle('park:hide', () => hidePark())
}
