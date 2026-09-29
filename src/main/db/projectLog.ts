import { addDays, getISOWeek, parseISO, startOfISOWeek } from 'date-fns'
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, min } from 'drizzle-orm'
import { ulid } from 'ulid'
import { MEDIA_URL, type DevlogDraft, type LogDay, type LogItem, type LogPage } from '@shared/ipc'
import { parseSessionReport } from '../domain/bridge'
import { buildDevlog, devlogBbcode, devlogMarkdown } from '../domain/devlog'
import { sessionMinutes } from '../domain/projects'
import { dayKey } from '../domain/recurrence'
import { logActivity } from './activity'
import type { Db } from './client'
import { projectNextSteps } from './roadmap'
import {
  commits,
  media,
  milestones,
  playtestFeedback,
  playtestPoints,
  projectLogNotes,
  projects,
  projectShots,
  sessions,
  tasks,
} from './schema'

// Proje Günlüğü (Aşama 5d-3): commit'ler, oturumlar, biten görevler, taşlar, playtest yapıştırmaları, zaman
// makinesi kareleri ve Taha'nın notları gün gün. Devlog taslağı haftanın verisinden `domain/devlog` ile.

const LOG_PAGE_DAYS = 30

const startOf = (day: string) => parseISO(day)
const nextDay = (day: string) => addDays(parseISO(day), 1)

function liveProject(db: Db, id: string): typeof projects.$inferSelect {
  const row = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .get()
  if (!row) throw new Error('Proje bulunamadı')
  return row
}

/** [from, to] günleri arası (dahil) bütün öğeler, gün gün (en yeni önce), gün içinde en yeni önce. */
function collect(db: Db, projectId: string, from: string, to: string, now: Date): LogDay[] {
  const start = startOf(from)
  const end = nextDay(to)
  const items = new Map<string, LogItem[]>()
  const add = (day: string, item: LogItem) => {
    const list = items.get(day)
    if (list) list.push(item)
    else items.set(day, [item])
  }

  const commitRows = db
    .select()
    .from(commits)
    .where(
      and(
        eq(commits.projectId, projectId),
        gte(commits.committedAt, start),
        lt(commits.committedAt, end),
      ),
    )
    .all()
  const byDay = new Map<string, typeof commitRows>()
  for (const c of commitRows) {
    const d = dayKey(c.committedAt)
    const list = byDay.get(d)
    if (list) list.push(c)
    else byDay.set(d, [c])
  }
  for (const [d, list] of byDay) {
    list.sort((a, b) => b.committedAt.getTime() - a.committedAt.getTime())
    const areas = new Map<string, number>()
    for (const c of list)
      for (const [a, n] of Object.entries(JSON.parse(c.areasJson) as Record<string, number>))
        areas.set(a, (areas.get(a) ?? 0) + n)
    add(d, {
      kind: 'commits',
      at: list[0]!.committedAt.getTime(),
      messages: list.map((c) => c.message.split('\n')[0]!),
      areas: [...areas].sort((a, b) => b[1] - a[1]),
    })
  }

  for (const s of db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        isNull(sessions.deletedAt),
        isNotNull(sessions.endedAt),
        gte(sessions.startedAt, start),
        lt(sessions.startedAt, end),
      ),
    )
    .all())
    add(dayKey(s.startedAt), {
      kind: 'session',
      id: s.id,
      at: s.startedAt.getTime(),
      minutes: sessionMinutes(s, now),
      source: s.source,
      leftOff: s.leftOff,
      nextStep: s.nextStep,
    })

  for (const t of db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        eq(tasks.status, 'done'),
        isNull(tasks.deletedAt),
        gte(tasks.completedAt, start),
        lt(tasks.completedAt, end),
      ),
    )
    .all())
    add(dayKey(t.completedAt!), {
      kind: 'task',
      id: t.id,
      at: t.completedAt!.getTime(),
      title: t.title,
      taskKind: t.kind,
    })

  for (const m of db
    .select()
    .from(milestones)
    .where(
      and(
        eq(milestones.projectId, projectId),
        isNull(milestones.deletedAt),
        gte(milestones.doneAt, start),
        lt(milestones.doneAt, end),
      ),
    )
    .all())
    add(dayKey(m.doneAt!), { kind: 'milestone', id: m.id, at: m.doneAt!.getTime(), title: m.title })

  const feedback = db
    .select()
    .from(playtestFeedback)
    .where(
      and(
        eq(playtestFeedback.projectId, projectId),
        isNull(playtestFeedback.deletedAt),
        gte(playtestFeedback.createdAt, start),
        lt(playtestFeedback.createdAt, end),
      ),
    )
    .all()
  if (feedback.length) {
    const counts = new Map<string, number>()
    for (const p of db
      .select({ feedbackId: playtestPoints.feedbackId })
      .from(playtestPoints)
      .where(
        inArray(
          playtestPoints.feedbackId,
          feedback.map((f) => f.id),
        ),
      )
      .all())
      counts.set(p.feedbackId, (counts.get(p.feedbackId) ?? 0) + 1)
    const perDay = new Map<string, { at: number; people: Set<string>; points: number }>()
    for (const f of feedback) {
      const d = dayKey(f.createdAt)
      const g = perDay.get(d) ?? { at: 0, people: new Set<string>(), points: 0 }
      g.at = Math.max(g.at, f.createdAt.getTime())
      if (f.tester.trim()) g.people.add(f.tester.trim())
      g.points += counts.get(f.id) ?? 0
      perDay.set(d, g)
    }
    for (const [d, g] of perDay)
      add(d, { kind: 'playtest', at: g.at, people: [...g.people], points: g.points })
  }

  for (const s of db
    .select({ shot: projectShots, fileName: media.fileName })
    .from(projectShots)
    .innerJoin(media, eq(media.id, projectShots.mediaId))
    .where(
      and(
        eq(projectShots.projectId, projectId),
        isNull(projectShots.deletedAt),
        gte(projectShots.takenOn, from),
        lte(projectShots.takenOn, to),
      ),
    )
    .all())
    add(s.shot.takenOn, {
      kind: 'shot',
      id: s.shot.id,
      at: s.shot.takenAt.getTime(),
      url: MEDIA_URL + s.fileName,
      starred: s.shot.starred,
    })

  for (const n of db
    .select()
    .from(projectLogNotes)
    .where(
      and(
        eq(projectLogNotes.projectId, projectId),
        isNull(projectLogNotes.deletedAt),
        gte(projectLogNotes.day, from),
        lte(projectLogNotes.day, to),
      ),
    )
    .all())
    if (n.kind === 'report') {
      const r = parseSessionReport(n.bodyMd)
      add(n.day, {
        kind: 'report',
        id: n.id,
        at: n.createdAt.getTime(),
        minutes: r.minutes,
        nextStep: r.nextStep,
        done: r.done,
        taskSuggestions: r.taskSuggestions,
        later: r.later,
        issues: r.issues,
        decisions: r.decisions,
      })
    } else
      add(n.day, {
        kind: 'note',
        id: n.id,
        at: n.createdAt.getTime(),
        bodyMd: n.bodyMd,
        devlog: n.kind === 'devlog',
      })

  return [...items]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, list]) => ({ day, items: list.sort((a, b) => b.at - a.at) }))
}

/** Günlüğün bir sayfası: `until` gününden (varsayılan bugün) geriye 30 gün. */
export function listLog(
  db: Db,
  projectId: string,
  until?: string | null,
  now = new Date(),
): LogPage {
  const project = liveProject(db, projectId)
  const to = until ?? dayKey(now)
  const from = dayKey(addDays(parseISO(to), -(LOG_PAGE_DAYS - 1)))
  const oldestCommit = db
    .select({ at: min(commits.committedAt) })
    .from(commits)
    .where(eq(commits.projectId, projectId))
    .get()?.at
  const earliest = [project.createdAt, oldestCommit ?? null]
    .filter((d): d is Date => d instanceof Date)
    .reduce((a, b) => (a < b ? a : b))
  return {
    days: collect(db, projectId, from, to, now),
    nextUntil: dayKey(earliest) < from ? dayKey(addDays(parseISO(from), -1)) : null,
  }
}

// ---------------------------------------------------------------- notlar

export function addLogNote(
  db: Db,
  input: { projectId: string; bodyMd: string; kind?: 'note' | 'devlog'; day?: string },
  now = new Date(),
): string {
  return db.transaction((tx) => {
    const row = tx
      .insert(projectLogNotes)
      .values({
        id: ulid(),
        projectId: input.projectId,
        day: input.day ?? dayKey(now),
        kind: input.kind ?? 'note',
        bodyMd: input.bodyMd.trim(),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'create',
      targetTable: 'project_log_notes',
      targetId: row.id,
      after: row,
    })
    return row.id
  })
}

export function setLogNoteDeleted(db: Db, id: string, deleted: boolean, now = new Date()): void {
  db.transaction((tx) => {
    const before = tx.select().from(projectLogNotes).where(eq(projectLogNotes.id, id)).get()
    if (!before || (before.deletedAt !== null) === deleted) return
    const after = tx
      .update(projectLogNotes)
      .set({ deletedAt: deleted ? now : null, updatedAt: now })
      .where(eq(projectLogNotes.id, id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: deleted ? 'delete' : 'restore',
      targetTable: 'project_log_notes',
      targetId: id,
      before,
      after,
    })
  })
}

// ---------------------------------------------------------------- devlog taslağı

function slug(name: string): string {
  return (
    name
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'proje'
  )
}

type ShotRef = { name: string; url: string; fileName: string }

/** Haftanın görselleri: yıldızlılar önce, sonra ilk ve son kare; en fazla 4. */
function weekShots(db: Db, projectId: string, from: string, to: string, prefix: string): ShotRef[] {
  const rows = db
    .select({ shot: projectShots, fileName: media.fileName })
    .from(projectShots)
    .innerJoin(media, eq(media.id, projectShots.mediaId))
    .where(
      and(
        eq(projectShots.projectId, projectId),
        isNull(projectShots.deletedAt),
        gte(projectShots.takenOn, from),
        lte(projectShots.takenOn, to),
      ),
    )
    .orderBy(asc(projectShots.takenAt))
    .all()
  const picked = [
    ...rows.filter((r) => r.shot.starred),
    ...(rows.length ? [rows[0]!, rows[rows.length - 1]!] : []),
  ]
  const seen = new Set<string>()
  const out: ShotRef[] = []
  for (const r of picked) {
    if (seen.has(r.shot.id) || out.length >= 4) continue
    seen.add(r.shot.id)
    const ext = r.fileName.split('.').pop() ?? 'png'
    out.push({
      name: `${prefix}-${out.length + 1}.${ext}`,
      url: MEDIA_URL + r.fileName,
      fileName: r.fileName,
    })
  }
  return out
}

/** Haftanın (Pazartesi başlangıçlı; verilmezse bu hafta) devlog taslağı. */
export function devlogDraft(
  db: Db,
  projectId: string,
  weekOf?: string | null,
  now = new Date(),
): DevlogDraft & { files: ShotRef[] } {
  const project = liveProject(db, projectId)
  const monday = startOfISOWeek(weekOf ? parseISO(weekOf) : now)
  const from = dayKey(monday)
  const to = dayKey(addDays(monday, 6))
  const days = collect(db, projectId, from, to, now)
  const all = days.flatMap((d) => d.items)
  const sessionItems = all.filter((i) => i.kind === 'session')
  const week = getISOWeek(monday)
  const shots = weekShots(db, projectId, from, to, `${slug(project.name)}-hafta-${week}`)
  const devlog = buildDevlog({
    projectName: project.name,
    week,
    sessions: sessionItems.length,
    minutes: sessionItems.reduce((a, s) => a + s.minutes, 0),
    milestones: all.flatMap((i) => (i.kind === 'milestone' ? [i.title] : [])),
    tasks: all.flatMap((i) => (i.kind === 'task' ? [{ title: i.title, kind: i.taskKind }] : [])),
    commits: all.flatMap((i) => (i.kind === 'commits' ? i.messages : [])),
    next: projectNextSteps(db, projectId, now).map((s) => s.title),
    images: shots.map((s) => s.name),
  })
  return {
    weekStart: from,
    week,
    empty: devlog.empty,
    markdown: devlogMarkdown(devlog),
    bbcode: devlogBbcode(devlog),
    images: shots.map((s) => ({ name: s.name, url: s.url })),
    files: shots,
  }
}
