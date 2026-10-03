import { and, asc, count, desc, eq, gte, inArray, isNull, lt, ne } from 'drizzle-orm'
import type {
  ActivityFilter,
  ActivityList,
  Inbox,
  ProposalDiff,
  ProposalGroup,
  ProposalSource,
  ProposalTarget,
  ProposalView,
  SchedulePreview,
} from '@shared/ipc'
import { operationSchema, type Operation } from '@shared/schemas/ai'
import {
  canUndoGroup,
  describeGroup,
  groupActivity,
  isUndoGroup,
  type ActivityRow,
} from '../domain/activityText'
import {
  courseChanges,
  importSlots,
  matchCourse,
  movedSlots,
  previewTones,
  resolveTerm,
} from '../domain/school/scheduleImport'
import { isApplied, undoProposal } from './ai'
import type { Db } from './client'
import {
  activityLog,
  aiJobs,
  courses,
  dumpAttachments,
  dumpItems,
  notes,
  projects,
  proposals,
  terms,
} from './schema'
import { importCourseRefs, importTermRefs } from './school'
import { undoGroup } from './undo'

// Onay Kutusu'nun okuma tarafı (4d): bekleyen önerisi olan işler grup olarak, her öneri hedef alanı, kaynak döküm
// alıntısı ve gerekiyorsa fark karosuyla. İşlem günlüğü `activity_log`'dan gruplar halinde. Yazma `db/ai.ts`'te.

const EXCERPT_MAX = 240
const DIFF_CONTEXT = 2
const ACTIVITY_ROWS_MAX = 3000
const DAY = 24 * 60 * 60 * 1000

/**
 * Bekleyen öneri sayısı (kenar çubuğu rozeti). Var olan döneme işaret eden dönem önerisi sayılmaz: Onay Kutusu'nda
 * karo değil, bilgi şeridi olarak görünür.
 */
export function pendingProposalCount(db: Db): number {
  const n =
    db.select({ n: count() }).from(proposals).where(eq(proposals.status, 'pending')).get()?.n ?? 0
  const termRows = db
    .select({ payloadJson: proposals.payloadJson })
    .from(proposals)
    .where(and(eq(proposals.status, 'pending'), eq(proposals.op, 'import_term')))
    .all()
  if (!termRows.length) return n
  const refs = importTermRefs(db)
  const hidden = termRows.filter((t) => {
    const op = operationSchema.safeParse(JSON.parse(t.payloadJson))
    return (
      op.success &&
      op.data.op === 'import_term' &&
      resolveTerm(op.data.name, refs).kind === 'existing'
    )
  }).length
  return n - hidden
}

type Lookup = {
  projects: Map<string, { name: string; color: string; nextStep: string }>
  courses: Map<string, { name: string; tone: string }>
  notes: Map<string, { title: string; bodyMd: string }>
}

function lookup(db: Db, ops: Operation[]): Lookup {
  const projectIds = new Set<string>()
  const courseIds = new Set<string>()
  const noteIds = new Set<string>()
  for (const op of ops) {
    if ('context' in op && op.context?.projectId) projectIds.add(op.context.projectId)
    if ('context' in op && op.context?.courseId) courseIds.add(op.context.courseId)
    if ('projectId' in op) projectIds.add(op.projectId)
    if ('courseId' in op) courseIds.add(op.courseId)
    if ('noteId' in op) noteIds.add(op.noteId)
  }
  const ps = projectIds.size
    ? db
        .select({
          id: projects.id,
          name: projects.name,
          color: projects.color,
          nextStep: projects.nextStep,
        })
        .from(projects)
        .where(inArray(projects.id, [...projectIds]))
        .all()
    : []
  const cs = courseIds.size
    ? db
        .select({ id: courses.id, name: courses.name, tone: courses.tone })
        .from(courses)
        .where(and(inArray(courses.id, [...courseIds]), isNull(courses.deletedAt)))
        .all()
    : []
  const ns = noteIds.size
    ? db
        .select({ id: notes.id, title: notes.title, bodyMd: notes.bodyMd })
        .from(notes)
        .where(and(inArray(notes.id, [...noteIds]), isNull(notes.deletedAt)))
        .all()
    : []
  return {
    projects: new Map(ps.map((p) => [p.id, p])),
    courses: new Map(cs.map((c) => [c.id, c])),
    notes: new Map(ns.map((n) => [n.id, n])),
  }
}

function projectTarget(l: Lookup, id: string): ProposalTarget {
  const p = l.projects.get(id)
  return p
    ? { domain: 'projects', label: p.name, fill: p.color, missing: false }
    : { domain: 'projects', label: 'Bilinmeyen proje', fill: null, missing: true }
}

function courseTarget(l: Lookup, id: string): ProposalTarget {
  const c = l.courses.get(id)
  return c
    ? { domain: 'school', label: c.name, fill: c.tone, missing: false }
    : { domain: 'school', label: 'Bilinmeyen ders', fill: null, missing: true }
}

function contextTarget(
  l: Lookup,
  context: { projectId?: string | null; courseId?: string | null } | null | undefined,
  fallback: ProposalTarget,
): ProposalTarget {
  if (context?.projectId) return projectTarget(l, context.projectId)
  if (context?.courseId) return courseTarget(l, context.courseId)
  return fallback
}

function targetOf(l: Lookup, op: Operation): ProposalTarget {
  const plain = (domain: ProposalTarget['domain'], label: string): ProposalTarget => ({
    domain,
    label,
    fill: null,
    missing: false,
  })
  switch (op.op) {
    case 'create_task':
      return contextTarget(l, op.context, plain('today', 'Genel'))
    case 'create_note':
      return contextTarget(l, op.context, plain('knowledge', op.collection?.trim() || 'Bilgi'))
    case 'append_to_note':
      // Not adı fark karosunun başlığında; etiket alanı söyler.
      return l.notes.has(op.noteId)
        ? plain('knowledge', 'Bilgi')
        : { domain: 'knowledge', label: 'Bilinmeyen not', fill: null, missing: true }
    case 'create_reminder':
      return plain('today', 'Bugün')
    case 'create_idea':
      return plain('knowledge', 'Fikirler')
    case 'create_exam':
    case 'add_instructor_note':
      return courseTarget(l, op.courseId)
    case 'set_project_next_step':
      return projectTarget(l, op.projectId)
    case 'import_term':
    case 'import_course':
      return plain('school', 'Okul')
  }
}

type ParsedProposal = { row: typeof proposals.$inferSelect; op: Operation }

/**
 * Ders programı önizlemesi: hedef dönem (yeni / var olan / yok) ve her ders önerisinin yeni mi güncelleme mi olduğu,
 * tonu, değişen alanları. Uygulayıcıyla aynı eşleştirme (`resolveTerm`, `matchCourse`).
 */
function schedulePreview(db: Db, items: ParsedProposal[]): SchedulePreview | null {
  const termItem = items.find((p) => p.op.op === 'import_term')
  const courseItems = items.filter((p) => p.op.op === 'import_course')
  if (!termItem && !courseItems.length) return null

  const termRefs = importTermRefs(db)
  const termOp = termItem?.op.op === 'import_term' ? termItem.op : null
  const termLive = !!termItem && (termItem.row.status === 'pending' || isApplied(termItem.row))
  const target = resolveTerm(termLive ? termOp!.name : null, termRefs)
  // Bu önerilerle oluşmuş dönem "yeni" kalır (şerit ve Geri al görünsün).
  const createdHere =
    !!termItem?.row.groupId &&
    isApplied(termItem.row) &&
    !!db
      .select({ id: activityLog.id })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.groupId, termItem.row.groupId),
          eq(activityLog.targetTable, 'terms'),
          eq(activityLog.action, 'create'),
        ),
      )
      .get()
  const existing =
    target.kind === 'existing'
      ? db.select().from(terms).where(eq(terms.id, target.termId)).get()
      : undefined
  const term: SchedulePreview['term'] =
    target.kind === 'new' || createdHere
      ? {
          proposalId: termItem!.row.id,
          mode: 'new',
          name: termOp!.name,
          active: true,
          startDate: termOp!.startDate ?? null,
          endDate: termOp!.endDate ?? null,
          weekCount: termOp!.weekCount ?? null,
        }
      : {
          proposalId: termItem?.row.id ?? null,
          mode: existing ? 'existing' : 'none',
          name: existing?.name ?? '',
          active: existing?.active ?? false,
          startDate: existing?.startDate ?? null,
          endDate: existing?.endDate ?? null,
          weekCount: existing?.weekCount ?? null,
        }

  const termCourses = existing ? importCourseRefs(db, existing.id) : []
  // Uygulanmış ders de eşleşir (kendisiyle): tonu dönemdeki gerçek tonu olur. Güncelleme/fark sadece bekleyende.
  const matches = courseItems.map((p) =>
    p.op.op === 'import_course' && p.row.status !== 'rejected'
      ? matchCourse(p.op, termCourses)
      : null,
  )
  const tones = previewTones(matches, termCourses)
  return {
    term,
    courses: courseItems.map((p, i) => {
      const match = p.row.status === 'pending' ? (matches[i] ?? null) : null
      const op = p.op.op === 'import_course' ? p.op : null
      const next = op && match ? importSlots(op.slots, match.slots) : []
      return {
        proposalId: p.row.id,
        update: !!match,
        tone: tones[i]!,
        oldSlots:
          match && op?.slots.length
            ? movedSlots(match.slots, next).map(({ weekday, startMin, endMin, room }) => ({
                weekday,
                startMin,
                endMin,
                room,
              }))
            : [],
        changes: op && match ? courseChanges(op, match) : [],
      }
    }),
  }
}

const lines = (md: string) =>
  md
    .split('\n')
    .map((s) => s.trimEnd())
    .filter((s) => s.trim())

function diffOf(l: Lookup, op: Operation): ProposalDiff | null {
  if (op.op === 'append_to_note') {
    const n = l.notes.get(op.noteId)
    return {
      title: n?.title || 'Adsız not',
      context: n ? lines(n.bodyMd).slice(-DIFF_CONTEXT) : [],
      removed: [],
      added: lines(op.appendMd),
    }
  }
  if (op.op === 'set_project_next_step') {
    const p = l.projects.get(op.projectId)
    const before = p?.nextStep.trim() ?? ''
    // Proje adı etikette; başlık neyin değiştiğini söyler.
    return {
      title: 'Sıradaki adım',
      context: [],
      removed: before ? [before] : [],
      added: [op.text],
    }
  }
  return null
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX - 1)}…` : flat
}

function sources(db: Db, dumpIds: string[]): Map<string, ProposalSource> {
  if (!dumpIds.length) return new Map()
  const rows = db
    .select({ id: dumpItems.id, content: dumpItems.content, createdAt: dumpItems.createdAt })
    .from(dumpItems)
    .where(inArray(dumpItems.id, dumpIds))
    .all()
  const files = db
    .select({ dumpId: dumpAttachments.dumpId, n: count() })
    .from(dumpAttachments)
    .where(inArray(dumpAttachments.dumpId, dumpIds))
    .groupBy(dumpAttachments.dumpId)
    .all()
  const fileCount = new Map(files.map((f) => [f.dumpId, f.n]))
  return new Map(
    rows.map((r) => [
      r.id,
      {
        dumpId: r.id,
        excerpt: excerpt(r.content),
        attachments: fileCount.get(r.id) ?? 0,
        createdAt: r.createdAt.getTime(),
      },
    ]),
  )
}

/** Düzenle formunun seçicileri: arşivde olmayan projeler, aktif dönemin dersleri. */
function contexts(db: Db): Inbox['contexts'] {
  const ps = db
    .select({ id: projects.id, name: projects.name, color: projects.color })
    .from(projects)
    .where(ne(projects.status, 'archived'))
    .orderBy(asc(projects.name))
    .all()
  const cs = db
    .select({ id: courses.id, name: courses.name, tone: courses.tone })
    .from(courses)
    .innerJoin(terms, eq(terms.id, courses.termId))
    .where(and(eq(terms.active, true), isNull(terms.deletedAt), isNull(courses.deletedAt)))
    .orderBy(asc(courses.sort), asc(courses.name))
    .all()
  return { projects: ps, courses: cs }
}

/**
 * Bekleyen önerisi olan işler, yeniden eskiye. Grubun karara bağlanmış önerileri de gelir (karoda tek satır);
 * bütün önerileri karara bağlanan iş listeden düşer (İşlem günlüğünde görünür).
 */
export function inbox(db: Db): Inbox {
  const jobIds = db
    .selectDistinct({ jobId: proposals.jobId })
    .from(proposals)
    .where(eq(proposals.status, 'pending'))
    .all()
    .map((r) => r.jobId)
  if (!jobIds.length) return { groups: [], contexts: contexts(db) }

  const jobs = db
    .select()
    .from(aiJobs)
    .where(inArray(aiJobs.id, jobIds))
    .orderBy(desc(aiJobs.startedAt))
    .all()
  const rows = db
    .select()
    .from(proposals)
    .where(inArray(proposals.jobId, jobIds))
    .orderBy(asc(proposals.sort))
    .all()

  const parsed = rows.flatMap((r) => {
    const op = operationSchema.safeParse(JSON.parse(r.payloadJson))
    return op.success ? [{ row: r, op: op.data }] : []
  })
  const l = lookup(
    db,
    parsed.map((p) => p.op),
  )
  const src = sources(db, [...new Set(parsed.flatMap((p) => p.op.sourceDumpIds))])

  const groups: ProposalGroup[] = jobs.map((job) => {
    const items = parsed.filter((p) => p.row.jobId === job.id)
    const views: ProposalView[] = items.map(({ row, op }) => ({
      id: row.id,
      op: row.op,
      payload: op,
      status: row.status,
      undone: row.undoneAt !== null,
      decidedAt: row.decidedAt?.getTime() ?? null,
      target: targetOf(l, op),
      sources: op.sourceDumpIds.flatMap((id) => src.get(id) ?? []),
      diff: diffOf(l, op),
    }))
    return {
      jobId: job.id,
      kind: job.kind,
      model: job.model,
      startedAt: job.startedAt.getTime(),
      pending: views.filter((v) => v.status === 'pending').length,
      proposals: views,
      schedule: schedulePreview(db, items),
    }
  })
  return { groups, contexts: contexts(db) }
}

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const v: unknown = JSON.parse(value)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** İşlem günlüğü: son `days` günün kayıtları gruplar halinde, yeniden eskiye. */
export function activityList(
  db: Db,
  input: { actor: ActivityFilter; days: number },
  now = new Date(),
): ActivityList {
  const since = new Date(now.getTime() - input.days * DAY)
  const actorFilter = input.actor === 'all' ? undefined : eq(activityLog.actor, input.actor)
  const rows = db
    .select()
    .from(activityLog)
    .where(and(gte(activityLog.createdAt, since), actorFilter))
    .orderBy(desc(activityLog.id))
    .limit(ACTIVITY_ROWS_MAX)
    .all()
  const older = db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(and(lt(activityLog.createdAt, since), actorFilter))
    .limit(1)
    .get()

  const groups = groupActivity(
    rows.map((r): ActivityRow => ({
      id: r.id,
      actor: r.actor,
      action: r.action,
      targetTable: r.targetTable,
      targetId: r.targetId,
      before: parseJson(r.beforeJson),
      after: parseJson(r.afterJson),
      groupId: r.groupId,
      undone: r.undoneAt !== null,
      at: r.createdAt.getTime(),
    })),
  )
  return {
    entries: groups.map((g) => ({
      key: g.key,
      groupId: g.groupId,
      actor: g.actor,
      at: g.at,
      ...describeGroup(g.rows),
      undone: g.rows.some((r) => r.undone),
      isUndo: isUndoGroup(g.groupId),
      undoable: canUndoGroup(g),
    })),
    hasMore: !!older || rows.length === ACTIVITY_ROWS_MAX,
  }
}

/**
 * Günlükten geri al. AI önerisinin grubuysa öneri de "geri alındı" işaretlenir (Döküm > İşlenenler bunu okur).
 */
export function undoActivity(db: Db, groupId: string, now = new Date()): void {
  if (isUndoGroup(groupId)) throw new Error('Geri alma geri alınamaz')
  const first = db
    .select({ actor: activityLog.actor })
    .from(activityLog)
    .where(eq(activityLog.groupId, groupId))
    .get()
  if (!first) throw new Error('Geri alınacak kayıt yok')
  if (first.actor !== 'ai' && first.actor !== 'taha')
    throw new Error('Tarama kayıtları geri alınmaz')
  const proposal = db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.groupId, groupId))
    .get()
  if (proposal) undoProposal(db, proposal.id, now)
  else undoGroup(db, groupId, now)
}
