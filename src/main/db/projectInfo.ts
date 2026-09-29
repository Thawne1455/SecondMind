import { and, desc, eq, gte, isNotNull, isNull } from 'drizzle-orm'
import { startOfWeek, subDays } from 'date-fns'
import type { Briefing, ProjectScanInfo } from '@shared/ipc'
import { buildBriefing } from '../domain/briefing'
import type { SnapshotSummary } from '../domain/scan'
import type { Db } from './client'
import {
  codeTodos,
  commits,
  parking,
  projectFolders,
  projects,
  scanSnapshots,
  sessions,
} from './schema'

// Kokpit'in tarama karoları ve geri dönüş brifingi için okumalar (Aşama 5b-3). Yazım yok.

/** Brifingde son açılış yoksa bu kadar geriye bakılır. */
const BRIEFING_LOOKBACK_DAYS = 14

type FileEntry = { path: string }
const paths = (json: string | null): string[] =>
  json ? (JSON.parse(json) as FileEntry[]).map((f) => f.path) : []

/** Projenin klasörlerinin son anlık görüntüleri. */
function latestSnapshots(
  db: Db,
  projectId: string,
): { summary: SnapshotSummary; scannedAt: Date }[] {
  const folderIds = db
    .select({ id: projectFolders.id })
    .from(projectFolders)
    .where(eq(projectFolders.projectId, projectId))
    .all()
    .map((f) => f.id)
  const out: { summary: SnapshotSummary; scannedAt: Date }[] = []
  for (const id of folderIds) {
    const row = db
      .select({ summaryJson: scanSnapshots.summaryJson, scannedAt: scanSnapshots.scannedAt })
      .from(scanSnapshots)
      .where(eq(scanSnapshots.folderId, id))
      .orderBy(desc(scanSnapshots.scannedAt))
      .get()
    if (row)
      out.push({
        summary: JSON.parse(row.summaryJson) as SnapshotSummary,
        scannedAt: row.scannedAt,
      })
  }
  return out
}

/** Klasörlerin commit'lenmemiş değişiklikleri toplamı; git'li klasör yoksa null. */
function uncommittedOf(snaps: { summary: SnapshotSummary }[]): ProjectScanInfo['uncommitted'] {
  const withGit = snaps.map((s) => s.summary.uncommitted).filter((u) => u !== null)
  if (!withGit.length) return null
  const oldest = withGit.map((u) => u.oldestAt).filter((t): t is number => t !== null)
  return {
    count: withGit.reduce((a, u) => a + u.count, 0),
    oldestAt: oldest.length ? Math.min(...oldest) : null,
  }
}

/**
 * Geri dönüş brifingi: `project:opened` açılışı kaydetmeden önce çağırır, böylece "son açılış" bu açılış değil
 * bir önceki olur.
 */
export function projectBriefing(db: Db, projectId: string, now = new Date()): Briefing | null {
  const project = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .get()
  if (!project) return null
  const since = project.lastOpenedAt ?? subDays(now, BRIEFING_LOOKBACK_DAYS)

  const closed = db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        isNull(sessions.deletedAt),
        isNotNull(sessions.endedAt),
      ),
    )
    .orderBy(desc(sessions.startedAt))
    .limit(2)
    .all()
  const last = closed[0]

  const recentCommits = db
    .select()
    .from(commits)
    .where(and(eq(commits.projectId, projectId), gte(commits.committedAt, since)))
    .orderBy(desc(commits.committedAt))
    .all()

  const parkedSince = project.lastOpenedAt
    ? db
        .select({ id: parking.id })
        .from(parking)
        .where(
          and(
            eq(parking.projectId, projectId),
            isNull(parking.deletedAt),
            gte(parking.createdAt, project.lastOpenedAt),
          ),
        )
        .all().length
    : 0

  return buildBriefing({
    now: now.getTime(),
    lastOpenedAt: project.lastOpenedAt?.getTime() ?? null,
    lastSession: last
      ? {
          startedAt: last.startedAt.getTime(),
          endedAt: last.endedAt!.getTime(),
          leftOff: last.leftOff,
        }
      : null,
    commits: recentCommits.map((c) => ({
      message: c.message,
      committedAt: c.committedAt.getTime(),
      files: paths(c.filesJson),
      areas: JSON.parse(c.areasJson) as Record<string, number>,
    })),
    sessionFiles: closed.map((s) => paths(s.filesJson)),
    uncommitted: uncommittedOf(latestSnapshots(db, projectId)),
    nextStep: project.nextStep,
    parkedSince,
  })
}

const RECENT_TODOS = 5

/** Bu hafta ve Koddaki notlar karoları. Hiç taranmamışsa null. */
export function projectScanInfo(
  db: Db,
  projectId: string,
  now = new Date(),
): ProjectScanInfo | null {
  const snaps = latestSnapshots(db, projectId)
  if (!snaps.length) return null

  const weekCommits = db
    .select({ areasJson: commits.areasJson })
    .from(commits)
    .where(
      and(
        eq(commits.projectId, projectId),
        gte(commits.committedAt, startOfWeek(now, { weekStartsOn: 1 })),
      ),
    )
    .all()
  const areas = new Map<string, number>()
  for (const c of weekCommits)
    for (const [a, n] of Object.entries(JSON.parse(c.areasJson) as Record<string, number>))
      areas.set(a, (areas.get(a) ?? 0) + n)

  let todos: ProjectScanInfo['todos'] = null
  const todoSnaps = snaps.filter((s) => s.summary.todosOpen !== null)
  if (todoSnaps.length) {
    const open = db
      .select()
      .from(codeTodos)
      .where(and(eq(codeTodos.projectId, projectId), isNull(codeTodos.resolvedAt)))
      .orderBy(desc(codeTodos.firstSeenAt), codeTodos.path, codeTodos.line)
      .all()
    const byTag = { TODO: 0, FIXME: 0, HACK: 0 }
    for (const t of open) byTag[t.tag]++
    // İlk taramada her not "eklendi" sayılır: fark göstermek yanıltır.
    const first = todoSnaps.some((s) => s.summary.result.firstScan)
    todos = {
      open: open.length,
      byTag,
      added: first ? null : todoSnaps.reduce((a, s) => a + s.summary.result.todosAdded, 0),
      resolved: first ? null : todoSnaps.reduce((a, s) => a + s.summary.result.todosResolved, 0),
      recent: open
        .slice(0, RECENT_TODOS)
        .map((t) => ({ path: t.path, line: t.line, tag: t.tag, text: t.text })),
    }
  }

  return {
    lastScanAt: Math.max(...snaps.map((s) => s.scannedAt.getTime())),
    week: {
      commits: weekCommits.length,
      areas: [...areas.entries()].sort((a, b) => b[1] - a[1]),
    },
    todos,
    uncommitted: uncommittedOf(snaps),
  }
}
