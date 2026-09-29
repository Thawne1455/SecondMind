import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import { MEDIA_URL, PROJECT_FILE_URL, type Asset, type Shot } from '@shared/ipc'
import { assetKind, isAudioPath, isImagePath, topArea } from '../domain/shots'
import { dayKey } from '../domain/recurrence'
import { logActivity } from './activity'
import type { Db, DbTx } from './client'
import { lastSnapshot } from './scan'
import { assets, commits, media, projectFolders, projects, projectShots, sessions } from './schema'

// Zaman makinesi ve varlıklar (Aşama 5d-4). Görüntüler `media/`'ya kopyalanır (hash'li; klasörden silinse de
// kalır, aynı içerik bir kez). Klasör taramasından gelen kareler tarama verisidir (satır başına log yok);
// Taha'nın yazımları (yapıştırma, yıldız, silme, klasör bağlama, varlık) loglanır.

type MediaRow = typeof media.$inferSelect

function log(
  db: Db | DbTx,
  action: 'create' | 'update' | 'delete' | 'restore',
  targetTable: string,
  after: { id: string },
  before?: object,
): void {
  logActivity(db, { actor: 'taha', action, targetTable, targetId: after.id, before, after })
}

function liveProject(db: Db | DbTx, id: string): typeof projects.$inferSelect {
  const row = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .get()
  if (!row) throw new Error('Proje bulunamadı')
  return row
}

// ---------------------------------------------------------------- zaman makinesi

/** Projenin kareleri, en yeni önce; her karenin günündeki baskın alan commit'lerden. */
export function listShots(db: Db, projectId: string): Shot[] {
  const rows = db
    .select({ shot: projectShots, fileName: media.fileName })
    .from(projectShots)
    .innerJoin(media, eq(media.id, projectShots.mediaId))
    .where(and(eq(projectShots.projectId, projectId), isNull(projectShots.deletedAt)))
    .orderBy(desc(projectShots.takenAt))
    .all()
  if (!rows.length) return []
  const areasByDay = new Map<string, Record<string, number>[]>()
  for (const c of db
    .select({ at: commits.committedAt, areas: commits.areasJson })
    .from(commits)
    .where(eq(commits.projectId, projectId))
    .all()) {
    const d = dayKey(c.at)
    const list = areasByDay.get(d) ?? []
    list.push(JSON.parse(c.areas) as Record<string, number>)
    areasByDay.set(d, list)
  }
  return rows.map(({ shot: s, fileName }) => ({
    id: s.id,
    url: MEDIA_URL + fileName,
    takenOn: s.takenOn,
    takenAt: s.takenAt.getTime(),
    source: s.source,
    starred: s.starred,
    area: topArea(areasByDay.get(s.takenOn) ?? []),
  }))
}

/** Karenin kaydı; aynı içerik projede zaten varsa null. Log'u çağıran yazar. */
export function insertShot(
  db: Db | DbTx,
  input: {
    projectId: string
    mediaId: string
    takenAt: Date
    source: 'editor' | 'folder' | 'session'
    sourcePath?: string | null
  },
  now = new Date(),
): typeof projectShots.$inferSelect | null {
  return (
    db
      .insert(projectShots)
      .values({
        id: ulid(),
        projectId: input.projectId,
        mediaId: input.mediaId,
        takenOn: dayKey(input.takenAt),
        takenAt: input.takenAt,
        source: input.source,
        sourcePath: input.sourcePath ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning()
      .get() ?? null
  )
}

/** Klasörden alınmış dosya yolları (küçük harf): tarama bunları yeniden okumaz. */
export function importedShotPaths(db: Db, projectId: string): Set<string> {
  return new Set(
    db
      .select({ path: projectShots.sourcePath })
      .from(projectShots)
      .where(and(eq(projectShots.projectId, projectId), isNotNull(projectShots.sourcePath)))
      .all()
      .map((r) => r.path!.toLowerCase()),
  )
}

/** Yapıştırılan kare (oturum kapanışı ya da galeri); oturum verilirse `shot_media_id` de yazılır. */
export function addPastedShot(
  db: Db,
  projectId: string,
  file: MediaRow,
  sessionId: string | undefined,
  now = new Date(),
): string {
  return db.transaction((tx) => {
    liveProject(tx, projectId)
    let row = insertShot(tx, { projectId, mediaId: file.id, takenAt: now, source: 'session' }, now)
    if (!row) {
      // Aynı kare daha önce eklenmiş (belki silinmiş): geri getir.
      const prev = tx
        .select()
        .from(projectShots)
        .where(and(eq(projectShots.projectId, projectId), eq(projectShots.mediaId, file.id)))
        .get()!
      row = tx
        .update(projectShots)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(projectShots.id, prev.id))
        .returning()
        .get()
      log(tx, 'restore', 'project_shots', row, prev)
    } else log(tx, 'create', 'project_shots', row)
    if (sessionId) {
      const before = tx.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (before && before.projectId === projectId) {
        const after = tx
          .update(sessions)
          .set({ shotMediaId: file.id, updatedAt: now })
          .where(eq(sessions.id, sessionId))
          .returning()
          .get()
        log(tx, 'update', 'sessions', after, before)
      }
    }
    return row.id
  })
}

export function updateShot(
  db: Db,
  id: string,
  patch: { starred?: boolean; deleted?: boolean },
  now = new Date(),
): void {
  db.transaction((tx) => {
    const before = tx.select().from(projectShots).where(eq(projectShots.id, id)).get()
    if (!before) throw new Error('Kare bulunamadı')
    const after = tx
      .update(projectShots)
      .set({
        starred: patch.starred,
        deletedAt: patch.deleted === undefined ? undefined : patch.deleted ? now : null,
        updatedAt: now,
      })
      .where(eq(projectShots.id, id))
      .returning()
      .get()
    const action =
      patch.deleted === true ? 'delete' : patch.deleted === false ? 'restore' : 'update'
    log(tx, action, 'project_shots', after, before)
  })
}

export function folderById(db: Db, id: string): { projectId: string; path: string } | null {
  return (
    db
      .select({ projectId: projectFolders.projectId, path: projectFolders.path })
      .from(projectFolders)
      .where(eq(projectFolders.id, id))
      .get() ?? null
  )
}

/** `sm-file` protokolü: klasör id'sinden yol. */
export const folderPathById = (db: Db, id: string): string | null =>
  folderById(db, id)?.path ?? null

export type FolderDirs = { folderId: string; path: string; dirs: string[] }

/** Projenin klasörleri ve bağlı görüntü klasörleri (göreli). */
export function projectImageDirs(db: Db, projectId: string): FolderDirs[] {
  return db
    .select()
    .from(projectFolders)
    .where(eq(projectFolders.projectId, projectId))
    .all()
    .map((f) => ({
      folderId: f.id,
      path: f.path,
      dirs: f.imageDirsJson ? (JSON.parse(f.imageDirsJson) as string[]) : [],
    }))
}

/** Görüntü klasörü bağla / kaldır (klasöre göre göreli yol). */
export function setImageDir(
  db: Db,
  folderId: string,
  dir: string,
  bound: boolean,
  now = new Date(),
): void {
  db.transaction((tx) => {
    const before = tx.select().from(projectFolders).where(eq(projectFolders.id, folderId)).get()
    if (!before) throw new Error('Klasör bulunamadı')
    const clean = dir.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
    if (!clean || clean.split('/').includes('..')) throw new Error('Geçersiz klasör')
    const list = (
      before.imageDirsJson ? (JSON.parse(before.imageDirsJson) as string[]) : []
    ).filter((d) => d.toLowerCase() !== clean.toLowerCase())
    if (bound) list.push(clean)
    const after = tx
      .update(projectFolders)
      .set({ imageDirsJson: list.length ? JSON.stringify(list) : null, updatedAt: now })
      .where(eq(projectFolders.id, folderId))
      .returning()
      .get()
    log(tx, 'update', 'project_folders', after, before)
  })
}

// ---------------------------------------------------------------- varlıklar

/** Projenin varlıkları (en yeni önce) ve yaratıcı projede klasör envanterindeki ses/görsel dosyaları. */
export function listAssets(db: Db, projectId: string): Asset[] {
  const project = liveProject(db, projectId)
  const rows = db
    .select({ asset: assets, fileName: media.fileName })
    .from(assets)
    .leftJoin(media, eq(media.id, assets.mediaId))
    .where(and(eq(assets.projectId, projectId), isNull(assets.deletedAt)))
    .orderBy(desc(assets.createdAt))
    .all()
  const out: Asset[] = rows.map(({ asset: a, fileName }) => ({
    id: a.id,
    title: a.title,
    kind: a.kind,
    url: fileName ? MEDIA_URL + fileName : '',
    external: false,
    docId: a.docId,
    taskId: a.taskId,
    createdAt: a.createdAt.getTime(),
  }))
  if (project.kind === 'creative') {
    for (const f of projectImageDirs(db, projectId)) {
      const inv = lastSnapshot(db, f.folderId)?.inventory
      if (!inv) continue
      for (const [path, entry] of Object.entries(inv)) {
        if (!isImagePath(path) && !isAudioPath(path)) continue
        out.push({
          id: `file:${f.folderId}:${path}`,
          title: path,
          kind: assetKind(path),
          url: `${PROJECT_FILE_URL}${f.folderId}/${path.split('/').map(encodeURIComponent).join('/')}`,
          external: true,
          docId: null,
          taskId: null,
          createdAt: entry.mtime ?? 0,
        })
      }
    }
  }
  return out
}

export function addAsset(
  db: Db,
  projectId: string,
  file: MediaRow,
  title: string,
  now = new Date(),
): string {
  return db.transaction((tx) => {
    liveProject(tx, projectId)
    const row = tx
      .insert(assets)
      .values({
        id: ulid(),
        projectId,
        mediaId: file.id,
        kind: assetKind(file.originalName, file.mime),
        title: title.trim() || file.originalName,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'assets', row)
    return row.id
  })
}

export function updateAsset(
  db: Db,
  input: {
    id: string
    title?: string
    docId?: string | null
    taskId?: string | null
    deleted?: boolean
  },
  now = new Date(),
): void {
  db.transaction((tx) => {
    const before = tx.select().from(assets).where(eq(assets.id, input.id)).get()
    if (!before) throw new Error('Varlık bulunamadı')
    const after = tx
      .update(assets)
      .set({
        title: input.title?.trim() || undefined,
        docId: input.docId,
        taskId: input.taskId,
        deletedAt: input.deleted === undefined ? undefined : input.deleted ? now : null,
        updatedAt: now,
      })
      .where(eq(assets.id, input.id))
      .returning()
      .get()
    const action =
      input.deleted === true ? 'delete' : input.deleted === false ? 'restore' : 'update'
    log(tx, action, 'assets', after, before)
  })
}

/** Varlığın diskteki media dosya adı (Aç için). */
export function assetFileName(db: Db, id: string): string | null {
  return (
    db
      .select({ fileName: media.fileName })
      .from(assets)
      .innerJoin(media, eq(media.id, assets.mediaId))
      .where(eq(assets.id, id))
      .get()?.fileName ?? null
  )
}
