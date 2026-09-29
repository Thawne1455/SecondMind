import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import fg from 'fast-glob'
import type { ImageDir } from '@shared/ipc'
import type { Db } from '../db/client'
import { importedShotPaths, insertShot, type FolderDirs } from '../db/shots'
import { IGNORE_GLOBS } from '../domain/scan'
import {
  EDITOR_SHOTS_DIR,
  IMAGE_EXTS,
  isImagePath,
  mimeOf,
  SHOT_MAX_BYTES,
  suggestImageDirs,
} from '../domain/shots'
import { storeMedia } from '../media'

// Zaman makinesi (5d-4): bağlı görüntü klasörlerinden ve köprünün `.secondmind/goruntuler/` klasöründen yeni
// kareleri `media/`'ya kopyalar (dosya tarihine göre). Proje klasörüne yazmaz.

const OPTIONS = {
  ignore: IGNORE_GLOBS.filter((g) => !g.includes('.secondmind')),
  dot: true,
  suppressErrors: true,
  followSymbolicLinks: false,
  caseSensitiveMatch: false,
}

/** Bir projenin klasörlerinden yeni kareleri alır; eklenen kare sayısı. */
export async function importShots(
  db: Db,
  mediaDir: string,
  projectId: string,
  folders: readonly FolderDirs[],
  now = new Date(),
): Promise<number> {
  const seen = importedShotPaths(db, projectId)
  let added = 0
  for (const f of folders) {
    const sources = [
      ...f.dirs.map((d) => ({ dir: d, source: 'folder' as const })),
      { dir: EDITOR_SHOTS_DIR, source: 'editor' as const },
    ]
    for (const { dir, source } of sources) {
      const root = join(f.path, dir)
      if (!existsSync(root)) continue
      const files = await fg([`**/*.{${IMAGE_EXTS.join(',')}}`], {
        cwd: root,
        onlyFiles: true,
        deep: 3,
        stats: true,
        objectMode: true,
        ...OPTIONS,
      })
      for (const e of files.sort((a, b) => (a.stats?.mtimeMs ?? 0) - (b.stats?.mtimeMs ?? 0))) {
        const abs = join(root, e.path)
        // `_` ile başlayan: Editor betiğinin yazımı süren geçici dosyası.
        if ((e.path.split('/').pop() ?? '').startsWith('_')) continue
        if (seen.has(abs.toLowerCase())) continue
        if ((e.stats?.size ?? 0) > SHOT_MAX_BYTES) continue
        const bytes = await readFile(abs).catch(() => null)
        if (!bytes?.byteLength) continue
        const name = e.path.split('/').pop() ?? e.path
        const file = storeMedia(db, mediaDir, { name, mime: mimeOf(name), bytes })
        const row = insertShot(
          db,
          {
            projectId,
            mediaId: file.id,
            takenAt: new Date(Math.round(e.stats?.mtimeMs ?? now.getTime())),
            source,
            sourcePath: abs,
          },
          now,
        )
        seen.add(abs.toLowerCase())
        if (row) added++
      }
    }
  }
  return added
}

/** Proje klasörlerinde görüntü biriken klasör önerileri (bağlılar hariç). */
export async function imageDirSuggestions(folders: readonly FolderDirs[]): Promise<ImageDir[]> {
  const out: ImageDir[] = []
  for (const f of folders) {
    if (!existsSync(f.path)) continue
    const dirs = await fg(['**'], { cwd: f.path, onlyDirectories: true, deep: 4, ...OPTIONS })
    const counted: { path: string; images: number }[] = []
    for (const d of dirs.slice(0, 3000)) {
      const entries = await readdir(join(f.path, d), { withFileTypes: true }).catch(() => [])
      counted.push({
        path: d,
        images: entries.filter((x) => x.isFile() && isImagePath(x.name)).length,
      })
    }
    for (const s of suggestImageDirs(counted, f.dirs))
      out.push({ folderId: f.folderId, path: s.path, images: s.images })
  }
  return out
}

/** Bağlı klasörlerin görüntü sayıları (gösterim). */
export async function boundImageDirs(folders: readonly FolderDirs[]): Promise<ImageDir[]> {
  const out: ImageDir[] = []
  for (const f of folders)
    for (const d of f.dirs) {
      const n = existsSync(join(f.path, d))
        ? (
            await fg([`**/*.{${IMAGE_EXTS.join(',')}}`], {
              cwd: join(f.path, d),
              onlyFiles: true,
              deep: 3,
              ...OPTIONS,
            })
          ).length
        : 0
      out.push({ folderId: f.folderId, path: d, images: n })
    }
  return out
}
