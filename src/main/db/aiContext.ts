import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { AiContext, AiJobDump } from '../domain/aiInput'
import { dayKey } from '../domain/recurrence'
import type { Db } from './client'
import {
  collections,
  courses,
  dumpAttachments,
  dumpItems,
  exams,
  media,
  milestones,
  notes,
  projects,
  terms,
} from './schema'

// AI iş paketinin bağlamı (MIMARI.md "AI akışı" 1. adım). Kırpma `domain/aiInput`'ta; burası sadece okur.
// "AI'a kapalı" notlar ve AI'a kapalı koleksiyonlardaki notlar hiç okunmaz.

export function loadAiContext(db: Db, profile: string, now = new Date()): AiContext {
  const projectRows = db
    .select({ id: projects.id, name: projects.name, nextStep: projects.nextStep })
    .from(projects)
    .where(
      and(eq(projects.status, 'active'), isNull(projects.deletedAt), isNull(projects.archivedAt)),
    )
    .orderBy(sql`${projects.lastOpenedAt} IS NULL`, desc(projects.lastOpenedAt), asc(projects.name))
    .all()
  const openMilestones = projectRows.length
    ? db
        .select({
          projectId: milestones.projectId,
          title: milestones.title,
          targetDate: milestones.targetDate,
        })
        .from(milestones)
        .where(
          and(
            inArray(
              milestones.projectId,
              projectRows.map((p) => p.id),
            ),
            isNull(milestones.doneAt),
            isNull(milestones.deletedAt),
          ),
        )
        .orderBy(asc(milestones.sort))
        .all()
    : []

  const today = dayKey(now)
  const courseRows = db
    .select({ id: courses.id, name: courses.name, code: courses.code })
    .from(courses)
    .innerJoin(terms, eq(terms.id, courses.termId))
    .where(and(eq(terms.active, true), isNull(terms.deletedAt), isNull(courses.deletedAt)))
    .orderBy(asc(courses.sort))
    .all()
  const examRows = courseRows.length
    ? db
        .select({ courseId: exams.courseId, title: exams.title, day: exams.day })
        .from(exams)
        .where(
          and(
            inArray(
              exams.courseId,
              courseRows.map((c) => c.id),
            ),
            gte(exams.day, today),
            isNull(exams.deletedAt),
          ),
        )
        .orderBy(asc(exams.day))
        .all()
    : []

  const noteRows = db
    .select({ id: notes.id, title: notes.title, collection: collections.name })
    .from(notes)
    .leftJoin(
      collections,
      and(eq(collections.id, notes.collectionId), isNull(collections.deletedAt)),
    )
    .where(
      and(
        isNull(notes.deletedAt),
        eq(notes.aiExcluded, false),
        sql`coalesce(${collections.aiExcluded}, 0) = 0`,
      ),
    )
    .orderBy(desc(notes.updatedAt))
    .limit(10)
    .all()

  return {
    now,
    profile,
    projects: projectRows.map((p) => {
      const m = openMilestones.find((x) => x.projectId === p.id)
      return { ...p, milestone: m ? { title: m.title, targetDate: m.targetDate } : null }
    }),
    courses: courseRows.map((c) => ({
      ...c,
      exams: examRows
        .filter((e) => e.courseId === c.id)
        .slice(0, 3)
        .map((e) => ({ title: e.title, day: e.day })),
    })),
    notes: noteRows,
  }
}

/** İşlenecek dökümler (silinmemiş, başka bir işte olmayan), ekleriyle; verilen sırayla. */
export function loadJobDumps(db: Db, ids: string[]): AiJobDump[] {
  if (!ids.length) return []
  const rows = db
    .select({ id: dumpItems.id, content: dumpItems.content, createdAt: dumpItems.createdAt })
    .from(dumpItems)
    .where(
      and(
        inArray(dumpItems.id, ids),
        isNull(dumpItems.deletedAt),
        ne(dumpItems.status, 'processing'),
      ),
    )
    .all()
  const links = db
    .select({
      dumpId: dumpAttachments.dumpId,
      fileName: media.fileName,
      originalName: media.originalName,
      mime: media.mime,
    })
    .from(dumpAttachments)
    .innerJoin(media, eq(media.id, dumpAttachments.mediaId))
    .where(inArray(dumpAttachments.dumpId, ids))
    .orderBy(asc(dumpAttachments.position))
    .all()
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.flatMap((id) => {
    const r = byId.get(id)
    if (!r) return []
    return [
      {
        ...r,
        attachments: links
          .filter((l) => l.dumpId === id)
          .map(({ fileName, originalName, mime }) => ({ fileName, originalName, mime })),
      },
    ]
  })
}
