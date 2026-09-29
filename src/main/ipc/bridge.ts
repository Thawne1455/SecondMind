import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from '../db/client'
import { bridgeFolders, setBridgeEnabled } from '../db/bridge'
import { listProjects } from '../db/projects'
import { folderById, projectImageDirs } from '../db/shots'
import { isUnityProject } from '../scan/files'
import { refreshContext } from '../scan/bridge'
import { bridgeFileStatus, installBridgeFiles, uninstallBridgeFiles } from '../scan/bridgeFiles'
import { handle } from './handle'

// Claude Code köprüsü kurulumu (5e). Proje klasörüne sadece Taha'nın bu penceredeki onayıyla yazılır.

/** `resources/proje-koprusu/` (paketlemede Aşama 8: extraResources ile `resources/proje-koprusu/`). */
function bridgeResource(name: string): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'proje-koprusu')
    : join(app.getAppPath(), 'resources', 'proje-koprusu')
  const path = join(base, name)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

export function registerBridgeIpc(): void {
  handle('bridge:status', ({ projectId }) => {
    const db = getDb()
    const project = listProjects(db).find((p) => p.id === projectId)
    const enabled = new Set(bridgeFolders(db, projectId).map((f) => f.id))
    const folders = projectImageDirs(db, projectId).map((f) => {
      const exists = existsSync(f.path)
      const st = exists
        ? bridgeFileStatus(f.path)
        : { claudeMd: false, script: false, gitignore: false, git: false, pendingReports: 0 }
      return {
        folderId: f.folderId,
        path: f.path,
        exists,
        enabled: enabled.has(f.folderId),
        claudeMd: st.claudeMd,
        scriptInstalled: st.script,
        gitignore: st.gitignore,
        git: st.git,
        pendingReports: st.pendingReports,
      }
    })
    return {
      unity: project?.kind === 'unity' || folders.some((f) => f.exists && isUnityProject(f.path)),
      addendum: bridgeResource('CLAUDE-ek.md'),
      script: bridgeResource('SecondMindSnapshot.cs'),
      folders,
    }
  })

  handle('bridge:install', ({ folderId, claudeMd, script, gitignore }) => {
    const db = getDb()
    const folder = folderById(db, folderId)
    if (!folder) throw new Error('Klasör bulunamadı')
    const scriptText = bridgeResource('SecondMindSnapshot.cs')
    const addendum = bridgeResource('CLAUDE-ek.md')
    if ((script && !scriptText) || (claudeMd && !addendum))
      throw new Error('Köprü şablonları bulunamadı')
    installBridgeFiles(folder.path, { claudeMd, script, gitignore, addendum, scriptText })
    setBridgeEnabled(db, folderId, true)
    refreshContext(db, folder.projectId)
  })

  handle('bridge:uninstall', ({ folderId }) => {
    const db = getDb()
    const folder = folderById(db, folderId)
    if (!folder) throw new Error('Klasör bulunamadı')
    uninstallBridgeFiles(folder.path)
    setBridgeEnabled(db, folderId, false)
  })
}
