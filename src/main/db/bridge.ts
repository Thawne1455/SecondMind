import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { and, desc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm'
import { ulid } from 'ulid'
import { LEFT_OFF_MAX, NEXT_STEP_MAX } from '@shared/ipc'
import {
  buildContext,
  decisionSummary,
  DOCS_DIR,
  BRIDGE_DIR,
  type ContextInput,
  type SessionReport,
} from '../domain/bridge'
import { dayKey } from '../domain/recurrence'
import { logActivity } from './activity'
import type { Db } from './client'
import { getDoc, listDocs } from './docs'
import { listProjectTasks } from './planning'
import { playtestOverview } from './playtest'
import { latestSnapshots, uncommittedOf } from './projectInfo'
import { listMilestones, projectNextSteps } from './roadmap'
import { projectFolders, projectLogNotes, projects, sessions } from './schema'

// Claude Code köprüsü (5e): BAGLAM.md'nin girdisi (motor, taş, görevler, hatalar, kararlar) ve oturum raporunun
// uygulanması (Günlük + otomatik oturum). Rapordaki öneriler Aşama 4'e kadar Günlük'te elle alınır.

/** Rapor oturumla eşleşirken kabul edilen kayma. */
const MATCH_SLACK_MS = 30 * 60_000
const DEFAULT_REPORT_MIN = 30

export function setBridgeEnabled(
  db: Db,
  folderId: string,
  enabled: boolean,
  now = new Date(),
): void {
  db.transaction((tx) => {
    const before = tx.select().from(projectFolders).where(eq(projectFolders.id, folderId)).get()
    if (!before) throw new Error('Klasör bulunamadı')
    if (before.bridgeEnabled === enabled) return
    const after = tx
      .update(projectFolders)
      .set({ bridgeEnabled: enabled, updatedAt: now })
      .where(eq(projectFolders.id, folderId))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'update',
      targetTable: 'project_folders',
      targetId: folderId,
      before,
      after,
    })
  })
}

/** Projenin köprüsü kurulu klasörleri. */
export function bridgeFolders(db: Db, projectId: string): { id: string; path: string }[] {
  return db
    .select({ id: projectFolders.id, path: projectFolders.path })
    .from(projectFolders)
    .where(and(eq(projectFolders.projectId, projectId), eq(projectFolders.bridgeEnabled, true)))
    .all()
}

function slug(title: string): string {
  return (
    title
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'sayfa'
  )
}

/** BAGLAM.md metni ve dışa verilecek (Claude Code'a açık) dokümanlar. */
export function bridgeContext(
  db: Db,
  projectId: string,
  now = new Date(),
): { context: string; docs: { name: string; body: string }[] } {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) throw new Error('Proje bulunamadı')
  const today = dayKey(now)
  const tasks = listProjectTasks(db, projectId, now).filter((t) => t.status === 'open')
  const people = new Map<string, number>()
  for (const c of playtestOverview(db, projectId, now).clusters)
    if (c.task) people.set(c.task.id, (people.get(c.task.id) ?? 0) + c.people)

  const open = listMilestones(db, projectId).filter((m) => m.doneAt === null)
  let milestone = open[0] ?? null
  for (const m of open)
    if (m.targetDate && (!milestone?.targetDate || m.targetDate < milestone.targetDate))
      milestone = m

  const docs = listDocs(db, projectId)
  const adrs = docs
    .filter((d) => d.kind === 'adr')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
  const exported = docs
    .filter((d) => d.aiOpen)
    .map((d) => ({
      name: `${slug(d.title)}-${d.id.slice(-4).toLowerCase()}.md`,
      body: getDoc(db, d.id).bodyMd,
    }))

  const last = db
    .select({ leftOff: sessions.leftOff })
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        isNull(sessions.deletedAt),
        isNotNull(sessions.endedAt),
      ),
    )
    .orderBy(desc(sessions.endedAt))
    .get()

  const input: ContextInput = {
    projectName: project.name,
    generatedAt: format(now, 'dd.MM.yyyy HH:mm'),
    steps: projectNextSteps(db, projectId, now)
      .slice(0, 3)
      .map((s) => ({ title: s.title, reason: s.reason, taskId: s.taskId })),
    milestone: milestone && {
      title: milestone.title,
      targetDate: milestone.targetDate,
      daysLeft: milestone.targetDate
        ? differenceInCalendarDays(parseISO(milestone.targetDate), parseISO(today))
        : null,
      criteria: milestone.criteria.map((c) => ({ text: c.text, done: c.done })),
    },
    doing: tasks
      .filter((t) => t.kanbanStatus === 'doing')
      .map((t) => ({ id: t.id, title: t.title })),
    todo: tasks
      .filter((t) => (t.kanbanStatus ?? 'todo') === 'todo')
      .map((t) => ({ id: t.id, title: t.title, kind: t.kind })),
    criticalBugs: tasks
      .filter((t) => t.kind === 'bug' && t.severity === 'critical')
      .map((t) => ({ id: t.id, title: t.title, playtest: people.get(t.id) ?? 0 })),
    decisions: adrs.map((d) => ({
      title: d.title,
      summary: decisionSummary(getDoc(db, d.id).bodyMd),
    })),
    leftOff: last?.leftOff || null,
    uncommitted: uncommittedOf(latestSnapshots(db, projectId))?.count ?? null,
    openDocs: exported.map((d) => `${BRIDGE_DIR}/${DOCS_DIR}/${d.name}`),
  }
  return { context: buildContext(input), docs: exported }
}

/**
 * Oturum raporunu uygular: Günlük'e "Claude Code oturumu" notu; aynı zaman aralığındaki Claude Code oturumu
 * varsa nerede kalındı (boşsa) ve sıradaki adımla zenginleşir, yoksa rapordan oturum açılır. Aynı rapor iki
 * kez işlenmez (`external_id = report:<dosya>`). Uygulandıysa true.
 */
export function applySessionReport(
  db: Db,
  projectId: string,
  fileName: string,
  raw: string,
  report: SessionReport,
  fileTime: Date,
  now = new Date(),
): boolean {
  return db.transaction((tx) => {
    const externalId = `report:${fileName}`
    const seen = tx
      .select({ id: projectLogNotes.id })
      .from(projectLogNotes)
      .where(and(eq(projectLogNotes.projectId, projectId), eq(projectLogNotes.bodyMd, raw)))
      .get()
    if (seen || tx.select().from(sessions).where(eq(sessions.externalId, externalId)).get())
      return false

    const start = new Date(report.startedAt ?? fileTime.getTime())
    const minutes = report.minutes ?? DEFAULT_REPORT_MIN
    const end = new Date(start.getTime() + minutes * 60_000)
    const leftOff = report.done.join('; ').slice(0, LEFT_OFF_MAX)
    const nextStep = report.nextStep.slice(0, NEXT_STEP_MAX)

    const match = tx
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.projectId, projectId),
          eq(sessions.source, 'claude_code'),
          isNull(sessions.deletedAt),
          lte(sessions.startedAt, new Date(end.getTime() + MATCH_SLACK_MS)),
          gte(sessions.startedAt, new Date(start.getTime() - MATCH_SLACK_MS)),
        ),
      )
      .get()
    if (match) {
      const after = tx
        .update(sessions)
        .set({
          leftOff: match.leftOff || leftOff,
          nextStep: nextStep || match.nextStep,
          updatedAt: now,
        })
        .where(eq(sessions.id, match.id))
        .returning()
        .get()
      logActivity(tx, {
        actor: 'scan',
        action: 'update',
        targetTable: 'sessions',
        targetId: match.id,
        before: match,
        after,
      })
    } else {
      const row = tx
        .insert(sessions)
        .values({
          id: ulid(),
          projectId,
          startedAt: start,
          endedAt: end > now ? now : end,
          leftOff,
          nextStep,
          source: 'claude_code',
          externalId,
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
      })
    }

    const note = tx
      .insert(projectLogNotes)
      .values({
        id: ulid(),
        projectId,
        day: dayKey(start),
        kind: 'report',
        bodyMd: raw,
        createdAt: start,
        updatedAt: now,
      })
      .returning()
      .get()
    logActivity(tx, {
      actor: 'scan',
      action: 'create',
      targetTable: 'project_log_notes',
      targetId: note.id,
      after: note,
    })
    return true
  })
}
