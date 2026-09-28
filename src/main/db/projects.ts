import { and, count, desc, eq, gte, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import { startOfWeek, subDays } from 'date-fns'
import { ulid } from 'ulid'
import type {
  ParkingAddInput,
  ParkingItem,
  ProjectCreateInput,
  ProjectSummary,
  ProjectUpdateInput,
  Session,
  SessionCloseInput,
  SessionStartInput,
} from '@shared/ipc'
import {
  compareProjects,
  dailyMinutes,
  folderKey,
  silenceDays,
  type SessionSpan,
} from '../domain/projects'
import { logActivity } from './activity'
import type { Db, DbTx } from './client'
import { parking, projectFolders, projects, sessions, tasks } from './schema'

// Projeler, oturumlar ve park alanı (Aşama 5a). Taha'nın her değişikliği activity_log'a yazılır;
// `last_opened_at` bir okuma sinyalidir, log'a yazılmaz.

type ProjectRow = typeof projects.$inferSelect
type SessionRow = typeof sessions.$inferSelect
type ParkingRow = typeof parking.$inferSelect

const RHYTHM_DAYS = 14

const toSession = (r: SessionRow): Session => ({
  id: r.id,
  projectId: r.projectId,
  taskId: r.taskId,
  startedAt: r.startedAt.getTime(),
  endedAt: r.endedAt?.getTime() ?? null,
  leftOff: r.leftOff,
  nextStep: r.nextStep,
  source: r.source,
})

function log(
  db: Db | DbTx,
  action: 'create' | 'update' | 'delete' | 'restore',
  targetTable: string,
  after: { id: string },
  before?: object,
  groupId?: string,
): void {
  logActivity(db, {
    actor: 'taha',
    action,
    targetTable,
    targetId: after.id,
    before,
    after,
    groupId,
  })
}

function liveProject(db: Db | DbTx, id: string): ProjectRow {
  const row = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .get()
  if (!row) throw new Error('Proje bulunamadı')
  return row
}

function openSessionRow(db: Db | DbTx): SessionRow | undefined {
  return db
    .select()
    .from(sessions)
    .where(and(isNull(sessions.endedAt), isNull(sessions.deletedAt)))
    .get()
}

// ---------------------------------------------------------------- projeler

export function listProjects(db: Db, now = new Date()): ProjectSummary[] {
  const rows = db.select().from(projects).where(isNull(projects.deletedAt)).all()
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  const folders = db
    .select()
    .from(projectFolders)
    .where(inArray(projectFolders.projectId, ids))
    .orderBy(projectFolders.createdAt)
    .all()
  const folderOf = new Map<string, string>()
  for (const f of folders) if (!folderOf.has(f.projectId)) folderOf.set(f.projectId, f.path)

  const liveSessions = and(inArray(sessions.projectId, ids), isNull(sessions.deletedAt))
  // Ritim penceresi ve bu haftanın oturumları (hafta 14 günden kısa).
  const windowStart = subDays(now, RHYTHM_DAYS + 1)
  const recent = db
    .select()
    .from(sessions)
    .where(and(liveSessions, or(isNull(sessions.endedAt), gte(sessions.endedAt, windowStart))))
    .all()
  // Her projenin son kapanmış oturumu: en yeni başlangıç.
  const closed = db
    .select()
    .from(sessions)
    .where(and(liveSessions, isNotNull(sessions.endedAt)))
    .orderBy(desc(sessions.startedAt))
    .all()
  const lastClosed = new Map<string, SessionRow>()
  for (const s of closed) if (!lastClosed.has(s.projectId)) lastClosed.set(s.projectId, s)

  const waiting = new Map(
    db
      .select({ projectId: parking.projectId, n: count() })
      .from(parking)
      .where(and(eq(parking.status, 'waiting'), isNull(parking.deletedAt)))
      .groupBy(parking.projectId)
      .all()
      .map((r) => [r.projectId, r.n]),
  )
  const openTasks = new Map(
    db
      .select({ projectId: tasks.projectId, n: count() })
      .from(tasks)
      .where(and(eq(tasks.status, 'open'), isNull(tasks.deletedAt), isNotNull(tasks.projectId)))
      .groupBy(tasks.projectId)
      .all()
      .map((r) => [r.projectId!, r.n]),
  )

  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const summaries = rows.map((p): ProjectSummary & { sessionOpen: boolean } => {
    const mine = recent.filter((s) => s.projectId === p.id)
    const spans: SessionSpan[] = mine.map((s) => ({ startedAt: s.startedAt, endedAt: s.endedAt }))
    const active = mine.find((s) => s.endedAt === null) ?? null
    const last = lastClosed.get(p.id) ?? null
    const thisWeek = spans
      .map((s) => ({
        startedAt: s.startedAt < weekStart ? weekStart : s.startedAt,
        endedAt: s.endedAt,
      }))
      .filter((s) => (s.endedAt ?? now) > weekStart)
    const lastActivity = Math.max(
      p.createdAt.getTime(),
      active ? now.getTime() : 0,
      last?.endedAt?.getTime() ?? 0,
    )
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      color: p.color,
      status: p.status,
      nextStep: p.nextStep,
      description: p.description,
      folderPath: folderOf.get(p.id) ?? null,
      createdAt: p.createdAt.getTime(),
      lastOpenedAt: p.lastOpenedAt?.getTime() ?? null,
      lastActivityAt: lastActivity,
      silentDays: silenceDays(new Date(lastActivity), now),
      activeSession: active && toSession(active),
      lastSession: last && toSession(last),
      parkingWaiting: waiting.get(p.id) ?? 0,
      openTasks: openTasks.get(p.id) ?? 0,
      rhythm: dailyMinutes(spans, now, RHYTHM_DAYS),
      weekMinutes: dailyMinutes(thisWeek, now, 7).reduce((a, b) => a + b, 0),
      weekSessions: thisWeek.length,
      sessionOpen: active !== null,
    }
  })
  return summaries.sort(compareProjects).map(({ sessionOpen: _, ...s }) => s)
}

export function createProject(db: Db, input: ProjectCreateInput, now = new Date()): string {
  return db.transaction((tx) => {
    const name = input.name.trim()
    const clash = tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.name, name), isNull(projects.deletedAt)))
      .get()
    if (clash) throw new Error(`"${name}" adında bir proje zaten var`)

    const row = tx
      .insert(projects)
      .values({
        id: ulid(),
        name,
        kind: input.kind,
        color: input.color.toUpperCase(),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    const groupId = ulid()
    log(tx, 'create', 'projects', row, undefined, groupId)

    if (input.folderPath) {
      const path = input.folderPath.replace(/[\\/]+$/, '')
      const key = folderKey(path)
      const existing = tx
        .select({ folder: projectFolders, projectName: projects.name, deleted: projects.deletedAt })
        .from(projectFolders)
        .innerJoin(projects, eq(projects.id, projectFolders.projectId))
        .all()
        .find((r) => folderKey(r.folder.path) === key)
      if (existing && !existing.deleted) {
        throw new Error(`Bu klasör "${existing.projectName}" projesine bağlı`)
      }
      if (existing) {
        // Çöp kutusundaki projenin klasörü yeni projeye geçer.
        const after = tx
          .update(projectFolders)
          .set({ projectId: row.id, path, updatedAt: now })
          .where(eq(projectFolders.id, existing.folder.id))
          .returning()
          .get()
        log(tx, 'update', 'project_folders', after, existing.folder, groupId)
      } else {
        const folder = tx
          .insert(projectFolders)
          .values({ id: ulid(), projectId: row.id, path, createdAt: now, updatedAt: now })
          .returning()
          .get()
        log(tx, 'create', 'project_folders', folder, undefined, groupId)
      }
    }
    return row.id
  })
}

export function updateProject(db: Db, input: ProjectUpdateInput, now = new Date()): void {
  const { id, ...patch } = input
  db.transaction((tx) => {
    const before = liveProject(tx, id)
    if (patch.name !== undefined) {
      const clash = tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.name, patch.name), isNull(projects.deletedAt)))
        .get()
      if (clash && clash.id !== id) throw new Error(`"${patch.name}" adında bir proje zaten var`)
    }
    const archivedAt =
      patch.status === undefined
        ? before.archivedAt
        : patch.status === 'archived'
          ? (before.archivedAt ?? now)
          : null
    const after = tx
      .update(projects)
      .set({
        ...patch,
        ...(patch.color && { color: patch.color.toUpperCase() }),
        archivedAt,
        updatedAt: now,
      })
      .where(eq(projects.id, id))
      .returning()
      .get()
    log(tx, 'update', 'projects', after, before)
  })
}

export function markProjectOpened(db: Db, id: string, now = new Date()): void {
  db.update(projects).set({ lastOpenedAt: now }).where(eq(projects.id, id)).run()
}

/** Çöp kutusuna; süren oturumu şimdi kapatır. Tek grupla loglanır, `restoreProject` grubu izlemez (oturum kapalı kalır). */
export function deleteProject(db: Db, id: string, now = new Date()): void {
  db.transaction((tx) => {
    const before = liveProject(tx, id)
    const groupId = ulid()
    const open = openSessionRow(tx)
    if (open?.projectId === id) {
      const closed = tx
        .update(sessions)
        .set({ endedAt: now, updatedAt: now })
        .where(eq(sessions.id, open.id))
        .returning()
        .get()
      log(tx, 'update', 'sessions', closed, open, groupId)
    }
    const after = tx
      .update(projects)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(projects.id, id))
      .returning()
      .get()
    log(tx, 'delete', 'projects', after, before, groupId)
  })
}

export function restoreProject(db: Db, id: string, now = new Date()): void {
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), isNotNull(projects.deletedAt)))
      .get()
    if (!before) return
    const clash = tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.name, before.name), isNull(projects.deletedAt)))
      .get()
    const after = tx
      .update(projects)
      .set({ deletedAt: null, name: clash ? `${before.name} (2)` : before.name, updatedAt: now })
      .where(eq(projects.id, id))
      .returning()
      .get()
    log(tx, 'restore', 'projects', after, before)
  })
}

/** Projenin ilk bağlı klasörü. */
export function projectFolderPath(db: Db, id: string): string | null {
  return (
    db
      .select({ path: projectFolders.path })
      .from(projectFolders)
      .where(eq(projectFolders.projectId, id))
      .orderBy(projectFolders.createdAt)
      .get()?.path ?? null
  )
}

/** Klasör başka canlı projeye bağlı mı: o projenin adı. */
export function folderOwner(db: Db, path: string): string | null {
  const key = folderKey(path)
  const row = db
    .select({ path: projectFolders.path, name: projects.name })
    .from(projectFolders)
    .innerJoin(projects, eq(projects.id, projectFolders.projectId))
    .where(isNull(projects.deletedAt))
    .all()
    .find((r) => folderKey(r.path) === key)
  return row?.name ?? null
}

export const projectColors = (db: Db): string[] =>
  db
    .select({ color: projects.color })
    .from(projects)
    .where(and(isNull(projects.deletedAt), eq(projects.status, 'active')))
    .all()
    .map((r) => r.color)

// ---------------------------------------------------------------- oturumlar

export function startSession(db: Db, input: SessionStartInput, now = new Date()): Session {
  return db.transaction((tx) => {
    const project = liveProject(tx, input.projectId)
    const open = openSessionRow(tx)
    if (open) {
      if (open.projectId === project.id) return toSession(open)
      const other = tx.select().from(projects).where(eq(projects.id, open.projectId)).get()
      throw new Error(`Önce ${other?.name ?? 'diğer projenin'} oturumunu kapat`)
    }
    const row = tx
      .insert(sessions)
      .values({
        id: ulid(),
        projectId: project.id,
        taskId: input.taskId ?? null,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'sessions', row)
    // Duraklatılmış projede oturum açmak onu yeniden aktif eder.
    if (project.status === 'paused') {
      const after = tx
        .update(projects)
        .set({ status: 'active', updatedAt: now })
        .where(eq(projects.id, project.id))
        .returning()
        .get()
      log(tx, 'update', 'projects', after, project)
    }
    return toSession(row)
  })
}

/** Oturumu kapatır ve projenin sıradaki adımını yazar; ikisi tek grupla loglanır. */
export function closeSession(db: Db, input: SessionCloseInput, now = new Date()): Session {
  return db.transaction((tx) => {
    const before = tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, input.id), isNull(sessions.deletedAt)))
      .get()
    if (!before) throw new Error('Oturum bulunamadı')
    if (before.endedAt) throw new Error('Oturum zaten kapalı')
    const byDuration =
      input.durationMin !== undefined
        ? new Date(before.startedAt.getTime() + input.durationMin * 60_000)
        : now
    const endedAt = byDuration < now ? byDuration : now
    const groupId = ulid()
    const after = tx
      .update(sessions)
      .set({ endedAt, leftOff: input.leftOff, nextStep: input.nextStep, updatedAt: now })
      .where(eq(sessions.id, before.id))
      .returning()
      .get()
    log(tx, 'update', 'sessions', after, before, groupId)

    const project = tx.select().from(projects).where(eq(projects.id, before.projectId)).get()
    if (project && project.nextStep !== input.nextStep) {
      const pAfter = tx
        .update(projects)
        .set({ nextStep: input.nextStep, updatedAt: now })
        .where(eq(projects.id, project.id))
        .returning()
        .get()
      log(tx, 'update', 'projects', pAfter, project, groupId)
    }
    return toSession(after)
  })
}

/** Yanlışlıkla açılmış oturumu çöp kutusuna atar (sürese de kapansa da). */
export function discardSession(db: Db, id: string, now = new Date()): void {
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), isNull(sessions.deletedAt)))
      .get()
    if (!before) return
    const after = tx
      .update(sessions)
      .set({ deletedAt: now, endedAt: before.endedAt ?? now, updatedAt: now })
      .where(eq(sessions.id, id))
      .returning()
      .get()
    log(tx, 'delete', 'sessions', after, before)
  })
}

export function listSessions(db: Db, projectId: string, limit: number): Session[] {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.projectId, projectId), isNull(sessions.deletedAt)))
    .orderBy(desc(sessions.startedAt))
    .limit(limit)
    .all()
    .map(toSession)
}

// ---------------------------------------------------------------- park alanı

export function listParking(db: Db, projectId?: string): ParkingItem[] {
  const open = openSessionRow(db)
  return db
    .select()
    .from(parking)
    .where(
      and(
        eq(parking.status, 'waiting'),
        isNull(parking.deletedAt),
        projectId ? eq(parking.projectId, projectId) : undefined,
      ),
    )
    .orderBy(desc(parking.createdAt), desc(parking.id))
    .all()
    .map((r) => toParking(r, open))
}

function toParking(r: ParkingRow, open: SessionRow | undefined): ParkingItem {
  return {
    id: r.id,
    projectId: r.projectId,
    text: r.text,
    source: r.source,
    status: r.status,
    taskId: r.taskId,
    createdAt: r.createdAt.getTime(),
    inActiveSession: !!open && open.projectId === r.projectId && r.createdAt >= open.startedAt,
  }
}

export function addParking(
  db: Db,
  input: ParkingAddInput & { source: 'shortcut' | 'app' },
  now = new Date(),
): ParkingItem {
  return db.transaction((tx) => {
    liveProject(tx, input.projectId)
    const row = tx
      .insert(parking)
      .values({
        id: ulid(),
        projectId: input.projectId,
        text: input.text.trim(),
        source: input.source,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'parking', row)
    return toParking(row, openSessionRow(tx))
  })
}

/** Göreve çevir (projenin görevi, bugüne alınmaz) ya da at. Tek grupla loglanır. */
export function resolveParking(
  db: Db,
  id: string,
  action: 'convert' | 'dismiss',
  now = new Date(),
): { taskId: string | null } {
  return db.transaction((tx) => {
    const before = tx
      .select()
      .from(parking)
      .where(and(eq(parking.id, id), isNull(parking.deletedAt)))
      .get()
    if (!before || before.status !== 'waiting') throw new Error('Park öğesi bulunamadı')
    const groupId = ulid()
    let taskId: string | null = null
    if (action === 'convert') {
      const task = tx
        .insert(tasks)
        .values({
          id: ulid(),
          title: before.text,
          projectId: before.projectId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      log(tx, 'create', 'tasks', task, undefined, groupId)
      taskId = task.id
    }
    const after = tx
      .update(parking)
      .set({
        status: action === 'convert' ? 'converted' : 'dismissed',
        taskId,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(parking.id, id))
      .returning()
      .get()
    log(tx, 'update', 'parking', after, before, groupId)
    return { taskId }
  })
}

/** Çevirme / atma geri alınır: öğe yeniden bekler, çevrilmiş görev çöp kutusuna gider. */
export function restoreParking(db: Db, id: string, now = new Date()): void {
  db.transaction((tx) => {
    const before = tx.select().from(parking).where(eq(parking.id, id)).get()
    if (!before || before.status === 'waiting') return
    const groupId = ulid()
    if (before.taskId) {
      const task = tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, before.taskId), isNull(tasks.deletedAt)))
        .get()
      if (task) {
        const deleted = tx
          .update(tasks)
          .set({ deletedAt: now, updatedAt: now })
          .where(eq(tasks.id, task.id))
          .returning()
          .get()
        log(tx, 'delete', 'tasks', deleted, task, groupId)
      }
    }
    const after = tx
      .update(parking)
      .set({ status: 'waiting', taskId: null, resolvedAt: null, updatedAt: now })
      .where(eq(parking.id, id))
      .returning()
      .get()
    log(tx, 'update', 'parking', after, before, groupId)
  })
}
