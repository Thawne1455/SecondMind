import { BrowserWindow, dialog, shell } from 'electron'
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from '../db/client'
import { addLogNote, devlogDraft, listLog, setLogNoteDeleted } from '../db/projectLog'
import {
  addAsset,
  addPastedShot,
  assetFileName,
  folderById,
  folderPathById,
  listAssets,
  listShots,
  projectImageDirs,
  setImageDir,
  updateAsset,
  updateShot,
} from '../db/shots'
import { relativeInside } from '../domain/docTemplates'
import { storeMedia } from '../media'
import type { DataPaths } from '../paths'
import { boundImageDirs, imageDirSuggestions, importShots } from '../scan/shots'
import { handle } from './handle'

// Proje hafızası (Aşama 5d-3/5d-4): Günlük, devlog taslağı, zaman makinesi ve varlıklar. `media/` yolu gerekir.

async function openPath(path: string): Promise<void> {
  const err = await shell.openPath(path)
  if (err) throw new Error(`Açılamadı: ${path}`)
}

export function registerProjectMemoryIpc(paths: DataPaths): void {
  handle('log:list', ({ projectId, until }) => listLog(getDb(), projectId, until))
  handle('log:addNote', (input) => ({ id: addLogNote(getDb(), input) }))
  handle('log:deleteNote', ({ id }) => setLogNoteDeleted(getDb(), id, true))
  handle('log:restoreNote', ({ id }) => setLogNoteDeleted(getDb(), id, false))
  handle('devlog:draft', ({ projectId, weekOf }) => {
    // Dosya adları iç ayrıntı: renderer'a sadece ad ve adres gider.
    const { files, ...draft } = devlogDraft(getDb(), projectId, weekOf)
    void files
    return draft
  })
  handle('devlog:exportImages', async ({ projectId, weekOf }) => {
    const { files } = devlogDraft(getDb(), projectId, weekOf)
    if (!files.length) throw new Error('Bu haftanın görseli yok')
    const owner = BrowserWindow.getFocusedWindow()
    const options = {
      title: 'Görselleri çıkar',
      properties: ['openDirectory' as const, 'createDirectory' as const],
    }
    const res = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    const dir = res.canceled ? null : res.filePaths[0]
    if (!dir) return null
    let count = 0
    for (const f of files) {
      const src = join(paths.media, f.fileName)
      if (!existsSync(src)) continue
      copyFileSync(src, join(dir, f.name))
      count++
    }
    return { dir, count }
  })

  // ---------------------------------------------------------------- zaman makinesi
  handle('shot:machine', async ({ projectId }) => {
    const folders = projectImageDirs(getDb(), projectId)
    return {
      shots: listShots(getDb(), projectId),
      bound: await boundImageDirs(folders),
      suggestions: await imageDirSuggestions(folders),
      hasFolder: folders.length > 0,
    }
  })
  handle('shot:add', ({ projectId, sessionId, name, mime, bytes }) => {
    const file = storeMedia(getDb(), paths.media, { name: name || 'kare.png', mime, bytes })
    return { id: addPastedShot(getDb(), projectId, file, sessionId) }
  })
  handle('shot:update', ({ id, starred, deleted }) => updateShot(getDb(), id, { starred, deleted }))
  handle('shot:bindDir', async ({ folderId, path, bound }) => {
    const db = getDb()
    setImageDir(db, folderId, path, bound)
    if (!bound) return { added: 0 }
    const target = folderById(db, folderId)
    if (!target) return { added: 0 }
    const folders = projectImageDirs(db, target.projectId).filter((f) => f.folderId === folderId)
    return { added: await importShots(db, paths.media, target.projectId, folders) }
  })

  // ---------------------------------------------------------------- varlıklar
  handle('asset:list', ({ projectId }) => listAssets(getDb(), projectId))
  handle('asset:add', ({ projectId, name, mime, bytes }) => {
    const file = storeMedia(getDb(), paths.media, { name, mime, bytes })
    return { id: addAsset(getDb(), projectId, file, name.replace(/\.[^.]+$/, '')) }
  })
  handle('asset:update', (input) => updateAsset(getDb(), input))
  handle('asset:open', async ({ id }) => {
    if (id.startsWith('file:')) {
      // Klasör dosyası: `file:<klasör id>:<göreli yol>`.
      const [, folderId = '', ...rest] = id.split(':')
      const root = folderPathById(getDb(), folderId)
      const file = root ? join(root, rest.join(':')) : null
      if (!root || !file || !relativeInside(root, file)) throw new Error('Dosya bulunamadı')
      return openPath(file)
    }
    const name = assetFileName(getDb(), id)
    if (!name) throw new Error('Varlık bulunamadı')
    return openPath(join(paths.media, name))
  })
}
