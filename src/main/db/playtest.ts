import { format, parseISO, subDays } from 'date-fns'
import { tr } from 'date-fns/locale'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import type {
  PlaytestCluster,
  PlaytestOverview,
  PlaytestPasteInput,
  PlaytestPreview,
} from '@shared/ipc'
import { TASK_TITLE_MAX } from '@shared/ipc'
import {
  clusterCount,
  clusterCountLabel,
  clusterPoints,
  clusterTitle,
  parseChatLines,
  splitPoints,
  stems,
  TESTER_WINDOW_DAYS,
} from '../domain/playtest'
import { dayKey } from '../domain/recurrence'
import { logActivity } from './activity'
import type { Db, DbTx } from './client'
import {
  activityLog,
  playtestClusters,
  playtestFeedback,
  playtestPoints,
  projects,
  tasks,
} from './schema'

// Playtest kutusu (Aşama 5c-4): yapıştırma → kişi/gün girdileri → noktalar → kümeler. Bölme ve kümeleme
// burada, ana süreçte. Her yazım tek grupla activity_log'a gider; `undoPlaytest` grubu geri alır.

type Table = 'playtest_feedback' | 'playtest_points' | 'playtest_clusters' | 'tasks'

function log(
  db: Db | DbTx,
  groupId: string,
  action: 'create' | 'update' | 'delete',
  targetTable: Table,
  after: { id: string },
  before?: object,
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

function liveProject(db: Db | DbTx, id: string): void {
  const row = db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .get()
  if (!row) throw new Error('Proje bulunamadı')
}

type Entry = { tester: string; receivedOn: string; text: string; points: string[] }

function entriesOf(text: string, tester: string, receivedOn: string): Entry[] {
  return parseChatLines(text, receivedOn).flatMap((e) => {
    const points = splitPoints(e.text)
    return points.length
      ? [{ tester: e.tester ?? tester.trim(), receivedOn: e.receivedOn, text: e.text, points }]
      : []
  })
}

/** Yapıştırma modalının canlı önizlemesi: tanınan kişiler ve nokta sayısı. DB'ye dokunmaz. */
export function previewPaste(text: string, receivedOn: string): PlaytestPreview {
  const parsed = parseChatLines(text, receivedOn)
  const testers: string[] = []
  const seen = new Set<string>()
  for (const e of parsed) {
    if (!e.tester) continue
    const key = e.tester.toLocaleLowerCase('tr-TR')
    if (!seen.has(key)) {
      seen.add(key)
      testers.push(e.tester)
    }
  }
  return {
    testers,
    points: parsed.reduce((n, e) => n + splitPoints(e.text).length, 0),
    needsTester: parsed.some((e) => e.tester === null),
  }
}

/** Proje sözlüğü: görev başlıklarının kökleri (GDD 5d'de eklenecek). */
function contentStems(db: Db | DbTx, projectId: string): Set<string> {
  const set = new Set<string>()
  for (const t of db
    .select({ title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .all())
    for (const s of stems(t.title)) set.add(s)
  return set
}

type LivePoint = {
  id: string
  text: string
  stems: string
  clusterId: string | null
  locked: boolean
  tester: string
  receivedOn: string
}

function livePoints(db: Db | DbTx, projectId: string): LivePoint[] {
  return db
    .select({
      id: playtestPoints.id,
      text: playtestPoints.text,
      stems: playtestPoints.stems,
      clusterId: playtestPoints.clusterId,
      locked: playtestPoints.locked,
      tester: playtestFeedback.tester,
      receivedOn: playtestFeedback.receivedOn,
    })
    .from(playtestPoints)
    .innerJoin(playtestFeedback, eq(playtestFeedback.id, playtestPoints.feedbackId))
    .where(and(eq(playtestFeedback.projectId, projectId), isNull(playtestFeedback.deletedAt)))
    .orderBy(asc(playtestPoints.id))
    .all()
}

function liveClusterIds(db: Db | DbTx, projectId: string): Set<string> {
  return new Set(
    db
      .select({ id: playtestClusters.id })
      .from(playtestClusters)
      .where(and(eq(playtestClusters.projectId, projectId), isNull(playtestClusters.deletedAt)))
      .all()
      .map((c) => c.id),
  )
}

function insertCluster(tx: DbTx, groupId: string, projectId: string, now: Date): string {
  const row = tx
    .insert(playtestClusters)
    .values({ id: ulid(), projectId, createdAt: now, updatedAt: now })
    .returning()
    .get()
  log(tx, groupId, 'create', 'playtest_clusters', row)
  return row.id
}

/**
 * Yapıştırmayı kaydeder: sohbet satırlarından kişi ve gün, metinden noktalar. Yeni noktalar mevcut kümelere
 * girer ya da yeni küme açar; kümesi olan noktalar yerinde kalır.
 */
export function pastePlaytest(
  db: Db,
  input: PlaytestPasteInput,
  now = new Date(),
): { groupId: string; points: number; newClusters: number } {
  const entries = entriesOf(input.text, input.tester ?? '', input.receivedOn)
  if (!entries.length) throw new Error('Metinde nokta bulunamadı')
  return db.transaction((tx) => {
    liveProject(tx, input.projectId)
    const groupId = ulid()
    const fresh: string[] = []
    for (const e of entries) {
      const fb = tx
        .insert(playtestFeedback)
        .values({
          id: ulid(),
          projectId: input.projectId,
          tester: e.tester,
          receivedOn: e.receivedOn,
          rawText: e.text,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      log(tx, groupId, 'create', 'playtest_feedback', fb)
      for (const text of e.points) {
        const p = tx
          .insert(playtestPoints)
          .values({
            id: ulid(),
            feedbackId: fb.id,
            text,
            stems: stems(text).join(' '),
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get()
        log(tx, groupId, 'create', 'playtest_points', p)
        fresh.push(p.id)
      }
    }

    const live = liveClusterIds(tx, input.projectId)
    const points = livePoints(tx, input.projectId)
    const created = new Set<string>()
    const placed = clusterPoints(
      points.map((p) => ({
        id: p.id,
        stems: p.stems ? p.stems.split(' ') : [],
        clusterId: p.clusterId && live.has(p.clusterId) ? p.clusterId : null,
        locked: p.locked,
      })),
      contentStems(tx, input.projectId),
      () => {
        const id = insertCluster(tx, groupId, input.projectId, now)
        created.add(id)
        return id
      },
    )
    const freshSet = new Set(fresh)
    for (const p of points) {
      const clusterId = placed.get(p.id) ?? null
      if (clusterId === p.clusterId) continue
      const before = tx.select().from(playtestPoints).where(eq(playtestPoints.id, p.id)).get()!
      const after = tx
        .update(playtestPoints)
        .set({ clusterId, updatedAt: now })
        .where(eq(playtestPoints.id, p.id))
        .returning()
        .get()
      // Yeni noktanın ilk yerleşimi 'create' kaydının parçası; eskiler (öksüz kalmışsa) ayrıca loglanır.
      if (!freshSet.has(p.id)) log(tx, groupId, 'update', 'playtest_points', after, before)
    }
    return { groupId, points: fresh.length, newClusters: created.size }
  })
}

function livePoint(
  tx: DbTx,
  pointId: string,
): typeof playtestPoints.$inferSelect & { projectId: string } {
  const row = tx
    .select({ point: playtestPoints, projectId: playtestFeedback.projectId })
    .from(playtestPoints)
    .innerJoin(playtestFeedback, eq(playtestFeedback.id, playtestPoints.feedbackId))
    .where(and(eq(playtestPoints.id, pointId), isNull(playtestFeedback.deletedAt)))
    .get()
  if (!row) throw new Error('Nokta bulunamadı')
  return { ...row.point, projectId: row.projectId }
}

function placePoint(
  tx: DbTx,
  groupId: string,
  pointId: string,
  clusterId: string,
  now: Date,
): void {
  const before = tx.select().from(playtestPoints).where(eq(playtestPoints.id, pointId)).get()!
  const after = tx
    .update(playtestPoints)
    .set({ clusterId, locked: true, updatedAt: now })
    .where(eq(playtestPoints.id, pointId))
    .returning()
    .get()
  log(tx, groupId, 'update', 'playtest_points', after, before)
}

/** Noktayı başka kümeye taşır; elle yerleşim kilitlenir. */
export function movePoint(
  db: Db,
  pointId: string,
  clusterId: string,
  now = new Date(),
): { groupId: string } {
  return db.transaction((tx) => {
    const point = livePoint(tx, pointId)
    const cluster = tx
      .select()
      .from(playtestClusters)
      .where(and(eq(playtestClusters.id, clusterId), isNull(playtestClusters.deletedAt)))
      .get()
    if (!cluster || cluster.projectId !== point.projectId) throw new Error('Küme bulunamadı')
    const groupId = ulid()
    if (point.clusterId !== clusterId || !point.locked)
      placePoint(tx, groupId, pointId, clusterId, now)
    return { groupId }
  })
}

/** Noktayı ayırır: kendi kümesi olur ve kilitlenir. */
export function splitPoint(db: Db, pointId: string, now = new Date()): { groupId: string } {
  return db.transaction((tx) => {
    const point = livePoint(tx, pointId)
    const groupId = ulid()
    const clusterId = insertCluster(tx, groupId, point.projectId, now)
    placePoint(tx, groupId, pointId, clusterId, now)
    return { groupId }
  })
}

function dayLabel(day: string): string {
  return format(parseISO(day), 'd MMM', { locale: tr })
}

/** Görev açıklaması: sayı, bütün alıntılar (kişi ve gün) ve kişiler. Markdown. */
export function clusterNotes(
  points: readonly { text: string; tester: string; receivedOn: string }[],
  countLabel: string,
): string {
  const quotes = points.map((p) => {
    const who = [p.tester.trim(), dayLabel(p.receivedOn)].filter(Boolean).join(', ')
    return `> ${p.text.replace(/\n+/g, ' ')} — ${who}`
  })
  const people = [...new Set(points.map((p) => p.tester.trim()).filter(Boolean))]
  return [
    `Playtest · ${countLabel}`,
    '',
    quotes.join('\n>\n'),
    ...(people.length ? ['', `Kişiler: ${people.join(', ')}`] : []),
  ].join('\n')
}

/** Kümeyi hataya (varsayılan) ya da göreve çevirir; başlık en kısa nokta. */
export function convertCluster(
  db: Db,
  clusterId: string,
  kind: 'bug' | 'task',
  now = new Date(),
): { groupId: string; taskId: string } {
  return db.transaction((tx) => {
    const before = tx
      .select()
      .from(playtestClusters)
      .where(and(eq(playtestClusters.id, clusterId), isNull(playtestClusters.deletedAt)))
      .get()
    if (!before) throw new Error('Küme bulunamadı')
    if (before.taskId) {
      const bound = tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, before.taskId), isNull(tasks.deletedAt)))
        .get()
      if (bound) throw new Error('Küme zaten göreve bağlı')
    }
    const members = livePoints(tx, before.projectId).filter((p) => p.clusterId === clusterId)
    if (!members.length) throw new Error('Küme boş')
    const count = clusterCount(members, recentTesterNames(tx, before.projectId, now))
    const groupId = ulid()
    const task = tx
      .insert(tasks)
      .values({
        id: ulid(),
        title: Array.from(clusterTitle(members.map((m) => m.text)))
          .slice(0, TASK_TITLE_MAX)
          .join(''),
        notes: clusterNotes(members, clusterCountLabel(count)),
        projectId: before.projectId,
        kanbanStatus: 'todo',
        kind,
        source: 'playtest',
        sourceId: clusterId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, groupId, 'create', 'tasks', task)
    const after = tx
      .update(playtestClusters)
      .set({ taskId: task.id, updatedAt: now })
      .where(eq(playtestClusters.id, clusterId))
      .returning()
      .get()
    log(tx, groupId, 'update', 'playtest_clusters', after, before)
    return { groupId, taskId: task.id }
  })
}

/** Grubun yazımlarını tersten geri alır: yaratılanlar çöp kutusuna, taşınanlar eski yerine. */
export function undoPlaytest(db: Db, groupId: string, now = new Date()): void {
  db.transaction((tx) => {
    const entries = tx
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.groupId, groupId), isNull(activityLog.undoneAt)))
      .orderBy(desc(activityLog.id))
      .all()
    if (!entries.length) return
    const undoGroup = ulid()
    for (const e of entries) {
      const table = e.targetTable as Table
      const before = e.beforeJson ? (JSON.parse(e.beforeJson) as Record<string, unknown>) : null
      if (e.action === 'create') {
        if (table === 'playtest_points') continue // yapıştırmanın kaydı çöpe gidince noktaları da gizlenir
        const target =
          table === 'tasks'
            ? tasks
            : table === 'playtest_clusters'
              ? playtestClusters
              : playtestFeedback
        const prev = tx.select().from(target).where(eq(target.id, e.targetId)).get()
        if (!prev || prev.deletedAt) continue
        const after = tx
          .update(target)
          .set({ deletedAt: now, updatedAt: now })
          .where(eq(target.id, e.targetId))
          .returning()
          .get()
        log(tx, undoGroup, 'delete', table, after, prev)
      } else if (e.action === 'update' && before) {
        if (table === 'playtest_points') {
          const prev = tx
            .select()
            .from(playtestPoints)
            .where(eq(playtestPoints.id, e.targetId))
            .get()
          if (!prev) continue
          const after = tx
            .update(playtestPoints)
            .set({
              clusterId: (before.clusterId as string | null) ?? null,
              locked: Boolean(before.locked),
              updatedAt: now,
            })
            .where(eq(playtestPoints.id, e.targetId))
            .returning()
            .get()
          log(tx, undoGroup, 'update', table, after, prev)
        } else if (table === 'playtest_clusters') {
          const prev = tx
            .select()
            .from(playtestClusters)
            .where(eq(playtestClusters.id, e.targetId))
            .get()
          if (!prev) continue
          const after = tx
            .update(playtestClusters)
            .set({ taskId: (before.taskId as string | null) ?? null, updatedAt: now })
            .where(eq(playtestClusters.id, e.targetId))
            .returning()
            .get()
          log(tx, undoGroup, 'update', table, after, prev)
        }
      }
    }
    tx.update(activityLog).set({ undoneAt: now }).where(eq(activityLog.groupId, groupId)).run()
  })
}

// ---------------------------------------------------------------- okuma

function recentTesterNames(db: Db | DbTx, projectId: string, now: Date): string[] {
  const cutoff = dayKey(subDays(now, TESTER_WINDOW_DAYS - 1))
  return db
    .select({ tester: playtestFeedback.tester, receivedOn: playtestFeedback.receivedOn })
    .from(playtestFeedback)
    .where(and(eq(playtestFeedback.projectId, projectId), isNull(playtestFeedback.deletedAt)))
    .orderBy(desc(playtestFeedback.receivedOn), desc(playtestFeedback.id))
    .all()
    .filter((f) => f.receivedOn >= cutoff && f.receivedOn <= dayKey(now) && f.tester.trim())
    .map((f) => f.tester.trim())
}

function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    const key = n.toLocaleLowerCase('tr-TR')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(n)
  }
  return out
}

/** Projenin kümeleri (boş kümeler gizli) ve son 30 günün test edenleri. */
export function playtestOverview(db: Db, projectId: string, now = new Date()): PlaytestOverview {
  const recent = recentTesterNames(db, projectId, now)
  const points = livePoints(db, projectId)
  const clusterRows = db
    .select()
    .from(playtestClusters)
    .where(and(eq(playtestClusters.projectId, projectId), isNull(playtestClusters.deletedAt)))
    .all()
  const taskIds = clusterRows.flatMap((c) => (c.taskId ? [c.taskId] : []))
  const taskRows = new Map(
    (taskIds.length
      ? db
          .select()
          .from(tasks)
          .where(and(inArray(tasks.id, taskIds), isNull(tasks.deletedAt)))
          .all()
      : []
    ).map((t) => [t.id, t]),
  )

  const clusters: PlaytestCluster[] = []
  for (const c of clusterRows) {
    const members = points
      .filter((p) => p.clusterId === c.id)
      .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.id.localeCompare(a.id))
    if (!members.length) continue
    const count = clusterCount(members, recent)
    const task = c.taskId ? taskRows.get(c.taskId) : undefined
    clusters.push({
      id: c.id,
      title: clusterTitle(members.map((m) => m.text)),
      people: count.people,
      of: count.of,
      countLabel: clusterCountLabel(count),
      task: task
        ? { id: task.id, title: task.title, kind: task.kind, kanbanStatus: task.kanbanStatus }
        : null,
      points: members.map((m) => ({
        id: m.id,
        text: m.text,
        tester: m.tester,
        receivedOn: m.receivedOn,
        locked: m.locked,
      })),
      lastOn: members[0]!.receivedOn,
    })
  }
  clusters.sort(
    (a, b) =>
      b.people - a.people ||
      b.points.length - a.points.length ||
      b.lastOn.localeCompare(a.lastOn) ||
      a.id.localeCompare(b.id),
  )
  return { testers: uniqueNames(recent), clusters }
}

/** "Kim" otomatik tamamlaması: bütün projelerdeki adlar, en yeni önce. */
export function knownTesters(db: Db, limit = 50): string[] {
  const rows = db
    .select({ tester: playtestFeedback.tester })
    .from(playtestFeedback)
    .where(isNull(playtestFeedback.deletedAt))
    .orderBy(desc(playtestFeedback.receivedOn), desc(playtestFeedback.id))
    .all()
  return uniqueNames(rows.map((r) => r.tester.trim()).filter(Boolean)).slice(0, limit)
}
