import { and, desc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import {
  todoKeys,
  type AreaRule,
  type FolderScanResult,
  type FoundTodo,
  type Inventory,
  type ParsedCommit,
  type ScanKind,
  type SnapshotSummary,
} from '../domain/scan'
import { overlaps, type ClaudeSpan } from '../domain/claudeSessions'
import { logActivity } from './activity'
import type { Db, DbTx } from './client'
import { codeTodos, commits, projectFolders, projects, scanSnapshots, sessions } from './schema'

// Tarama verisinin yazımı ve okunması (Aşama 5b). Dosya sistemi ve git src/main/scan/'da; burası senkron ve test edilir.
// Tarama Taha'nın verisini değiştirmez: satır başına log yok, klasör taraması başına tek `scan` özeti.

/** Arşivde olmayan canlı projelerin bağlı klasörleri. */
export type ScanTarget = {
  projectId: string
  projectName: string
  kind: ScanKind
  folderId: string
  path: string
  areaRules: AreaRule[] | null
  lastScanAt: Date | null
}

/** Kaç anlık görüntü tutulur (klasör başına). */
export const SNAPSHOT_KEEP = 30

export function scanTargets(db: Db, projectId?: string): ScanTarget[] {
  const rows = db
    .select({ folder: projectFolders, project: projects })
    .from(projectFolders)
    .innerJoin(projects, eq(projects.id, projectFolders.projectId))
    .where(
      and(
        isNull(projects.deletedAt),
        projectId ? eq(projects.id, projectId) : ne(projects.status, 'archived'),
      ),
    )
    .orderBy(projectFolders.createdAt)
    .all()
  return rows.map(({ folder, project }) => ({
    projectId: project.id,
    projectName: project.name,
    kind: project.kind,
    folderId: folder.id,
    path: folder.path,
    areaRules: folder.areaRulesJson ? (JSON.parse(folder.areaRulesJson) as AreaRule[]) : null,
    lastScanAt: folder.lastScanAt,
  }))
}

/** Klasörün bilinen commit'leri: artımlı taramada tekrar eklenmesin; en yenisi `--since` sınırı. */
export function knownCommits(
  db: Db,
  folderId: string,
): { hashes: Set<string>; latest: Date | null } {
  const rows = db
    .select({ hash: commits.hash, at: commits.committedAt })
    .from(commits)
    .where(eq(commits.folderId, folderId))
    .all()
  let latest: Date | null = null
  for (const r of rows) if (!latest || r.at > latest) latest = r.at
  return { hashes: new Set(rows.map((r) => r.hash)), latest }
}

export function lastSnapshot(
  db: Db,
  folderId: string,
): { summary: SnapshotSummary; inventory: Inventory | null; scannedAt: Date } | null {
  const row = db
    .select()
    .from(scanSnapshots)
    .where(eq(scanSnapshots.folderId, folderId))
    .orderBy(desc(scanSnapshots.scannedAt))
    .get()
  if (!row) return null
  return {
    summary: JSON.parse(row.summaryJson) as SnapshotSummary,
    inventory: row.inventoryJson ? (JSON.parse(row.inventoryJson) as Inventory) : null,
    scannedAt: row.scannedAt,
  }
}

export type FolderScanInput = {
  target: ScanTarget
  /** Yeni gelen commit'ler (bilinenler çıkarılmış olabilir; tekrarlar yok sayılır). */
  commits: (ParsedCommit & { areas: Record<string, number> })[]
  /** Bu türde not taranmadıysa null: mevcut notlara dokunulmaz. */
  todos: FoundTodo[] | null
  inventory: Inventory | null
  /** Sonuç sayıları hariç anlık görüntü; sonuç burada hesaplanıp eklenir. */
  summary: Omit<SnapshotSummary, 'result' | 'todosOpen'>
  filesChanged: number
  /** Claude Code kayıtlarından çalışma aralıkları; kayıt klasörü okunmadıysa null. */
  claudeSpans?: ClaudeSpanInput[] | null
}

export type SessionFile = { path: string; area: string }
export type ClaudeSpanInput = Omit<ClaudeSpan, 'files'> & { files: SessionFile[] }

/** Dosya listelerini birleştirir (yol tekrarsız, sıralı). */
function mergeFiles(a: SessionFile[], b: SessionFile[]): SessionFile[] {
  const byPath = new Map<string, SessionFile>()
  for (const f of [...a, ...b]) byPath.set(f.path, f)
  return [...byPath.values()].sort((x, y) => x.path.localeCompare(y.path))
}

/**
 * Claude Code aralıklarını oturumlara çevirir (PROJELER.md > Oturumlar):
 * - `external_id` ile bilinen aralık güncellenir (dosya büyüdükçe uzar); çöp kutusundaysa dokunulmaz, geri gelmez.
 * - Elle açılmış bir oturumla kesişen aralık ayrı kayıt olmaz: o oturuma dosyaları eklenir.
 * - Kalanlar `claude_code` kaynaklı kapalı oturum olur; açılışı `scan` aktörüyle loglanır.
 * Dönen: yeni oluşturulan oturum sayısı.
 */
function upsertClaudeSessions(
  tx: DbTx,
  projectId: string,
  spans: readonly ClaudeSpanInput[],
  now: Date,
): number {
  if (!spans.length) return 0
  const manual = tx
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        eq(sessions.source, 'taha'),
        isNull(sessions.deletedAt),
      ),
    )
    .all()
  const readFiles = (json: string | null) => (json ? (JSON.parse(json) as SessionFile[]) : [])
  let created = 0
  for (const span of spans) {
    const start = new Date(span.start)
    const end = new Date(span.end)
    const known = tx.select().from(sessions).where(eq(sessions.externalId, span.externalId)).get()
    if (known) {
      if (known.deletedAt) continue
      const files = mergeFiles(readFiles(known.filesJson), span.files)
      const isAuto = known.source === 'claude_code'
      tx.update(sessions)
        .set({
          ...(isAuto ? { startedAt: start, endedAt: end } : {}),
          filesJson: JSON.stringify(files),
          updatedAt: now,
        })
        .where(eq(sessions.id, known.id))
        .run()
      continue
    }
    const host = manual.find((m) =>
      overlaps(
        { start: span.start, end: span.end },
        { start: m.startedAt.getTime(), end: (m.endedAt ?? now).getTime() },
      ),
    )
    if (host) {
      const files = mergeFiles(readFiles(host.filesJson), span.files)
      host.filesJson = JSON.stringify(files)
      tx.update(sessions)
        .set({
          filesJson: host.filesJson,
          // İlk eşleşen aralığın kimliği tutulur; sonrakiler her taramada yeniden birleşir (aynı sonuç).
          ...(host.externalId ? {} : { externalId: span.externalId }),
          updatedAt: now,
        })
        .where(eq(sessions.id, host.id))
        .run()
      host.externalId ??= span.externalId
      continue
    }
    const row = tx
      .insert(sessions)
      .values({
        id: ulid(),
        projectId,
        startedAt: start,
        endedAt: end,
        source: 'claude_code',
        externalId: span.externalId,
        filesJson: JSON.stringify(span.files),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    logActivity(tx, {
      actor: 'scan',
      action: 'create',
      targetTable: 'sessions',
      targetId: row.id,
      after: row,
      createdAt: now,
      updatedAt: now,
    })
    created++
  }
  return created
}

/** Klasör taramasının tüm yazımı tek transaction'da: commit'ler, notlar, anlık görüntü, son tarama zamanı, özet log. */
export function recordFolderScan(
  db: Db,
  input: FolderScanInput,
  now = new Date(),
): FolderScanResult {
  const { target } = input
  return db.transaction((tx) => {
    const firstScan =
      tx
        .select({ id: scanSnapshots.id })
        .from(scanSnapshots)
        .where(eq(scanSnapshots.folderId, target.folderId))
        .get() === undefined

    let newCommits = 0
    for (const c of input.commits) {
      const res = tx
        .insert(commits)
        .values({
          id: ulid(),
          projectId: target.projectId,
          folderId: target.folderId,
          hash: c.hash,
          message: c.message,
          author: c.author,
          committedAt: c.committedAt,
          areasJson: JSON.stringify(c.areas),
          filesJson: JSON.stringify(c.files),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run()
      newCommits += res.changes
    }

    let todosAdded = 0
    let todosResolved = 0
    let todosOpen: number | null = null
    if (input.todos) {
      const keys = todoKeys(input.todos)
      const existing = new Map(
        tx
          .select()
          .from(codeTodos)
          .where(eq(codeTodos.folderId, target.folderId))
          .all()
          .map((r) => [r.key, r]),
      )
      input.todos.forEach((t, i) => {
        const key = keys[i]!
        const row = existing.get(key)
        if (!row) {
          tx.insert(codeTodos)
            .values({
              id: ulid(),
              projectId: target.projectId,
              folderId: target.folderId,
              key,
              path: t.path,
              line: t.line,
              tag: t.tag,
              text: t.text,
              firstSeenAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .run()
          todosAdded++
          return
        }
        // Yeniden görünen not tekrar açılır ve yeni sayılır.
        if (row.resolvedAt) todosAdded++
        if (row.resolvedAt || row.line !== t.line || row.path !== t.path || row.text !== t.text)
          tx.update(codeTodos)
            .set({ line: t.line, path: t.path, text: t.text, resolvedAt: null, updatedAt: now })
            .where(eq(codeTodos.id, row.id))
            .run()
      })
      const gone = tx
        .update(codeTodos)
        .set({ resolvedAt: now, updatedAt: now })
        .where(
          and(
            eq(codeTodos.folderId, target.folderId),
            isNull(codeTodos.resolvedAt),
            keys.length ? notInArray(codeTodos.key, keys) : undefined,
          ),
        )
        .run()
      todosResolved = gone.changes
      todosOpen = keys.length
    }

    const result: FolderScanResult = {
      firstScan,
      newCommits,
      uncommitted: input.summary.uncommitted?.count ?? 0,
      // İlk taramada her not "yeni" sayılır ama çözülen olamaz; git'siz klasörde ilk envanter fark değildir.
      todosAdded,
      todosResolved,
      filesChanged: firstScan ? 0 : input.filesChanged,
      claudeSessions: input.claudeSpans
        ? upsertClaudeSessions(tx, target.projectId, input.claudeSpans, now)
        : 0,
    }
    const summary: SnapshotSummary = { ...input.summary, todosOpen, result }
    tx.insert(scanSnapshots)
      .values({
        id: ulid(),
        folderId: target.folderId,
        scannedAt: now,
        summaryJson: JSON.stringify(summary),
        inventoryJson: input.inventory ? JSON.stringify(input.inventory) : null,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const keep = tx
      .select({ id: scanSnapshots.id })
      .from(scanSnapshots)
      .where(eq(scanSnapshots.folderId, target.folderId))
      .orderBy(desc(scanSnapshots.scannedAt))
      .limit(SNAPSHOT_KEEP)
      .all()
      .map((r) => r.id)
    tx.delete(scanSnapshots)
      .where(and(eq(scanSnapshots.folderId, target.folderId), notInArray(scanSnapshots.id, keep)))
      .run()

    tx.update(projectFolders)
      .set({ lastScanAt: now, updatedAt: now })
      .where(eq(projectFolders.id, target.folderId))
      .run()

    logActivity(tx, {
      actor: 'scan',
      action: 'update',
      targetTable: 'project_folders',
      targetId: target.folderId,
      after: { projectId: target.projectId, path: target.path, ...result },
      createdAt: now,
      updatedAt: now,
    })
    return result
  })
}

/** Proje başına son commit zamanı, klasördeki son dokunuş ve son tarama (liste ve sessizlik için). */
export function scanActivity(
  db: Db,
  projectIds: readonly string[],
): Map<
  string,
  { lastCommitAt: number | null; latestMtime: number | null; lastScanAt: number | null }
> {
  const out = new Map<
    string,
    { lastCommitAt: number | null; latestMtime: number | null; lastScanAt: number | null }
  >()
  if (!projectIds.length) return out
  for (const id of projectIds)
    out.set(id, { lastCommitAt: null, latestMtime: null, lastScanAt: null })

  const latestCommits = db
    .select({ projectId: commits.projectId, at: sql<number>`max(${commits.committedAt})` })
    .from(commits)
    .where(inArray(commits.projectId, [...projectIds]))
    .groupBy(commits.projectId)
    .all()
  for (const c of latestCommits) out.get(c.projectId)!.lastCommitAt = c.at

  const folders = db
    .select({
      id: projectFolders.id,
      projectId: projectFolders.projectId,
      lastScanAt: projectFolders.lastScanAt,
    })
    .from(projectFolders)
    .where(inArray(projectFolders.projectId, [...projectIds]))
    .all()
  for (const f of folders) {
    const e = out.get(f.projectId)!
    const scanned = f.lastScanAt?.getTime() ?? null
    if (scanned !== null && (e.lastScanAt === null || scanned > e.lastScanAt))
      e.lastScanAt = scanned
    // Envanter JSON'u büyük olabilir: sadece özet okunur.
    const snap = db
      .select({ summaryJson: scanSnapshots.summaryJson })
      .from(scanSnapshots)
      .where(eq(scanSnapshots.folderId, f.id))
      .orderBy(desc(scanSnapshots.scannedAt))
      .get()
    const mtime = snap ? (JSON.parse(snap.summaryJson) as SnapshotSummary).latestMtime : null
    if (mtime !== null && (e.latestMtime === null || mtime > e.latestMtime)) e.latestMtime = mtime
  }
  return out
}
