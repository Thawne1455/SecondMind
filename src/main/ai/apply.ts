import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Operation } from '@shared/schemas/ai'
import { withActivityContext } from '../db/activity'
import type { Db } from '../db/client'
import { createIdea } from '../db/ideas'
import { createCollection, createNote, updateNote } from '../db/knowledge'
import { createReminder, createTask } from '../db/planning'
import { updateProject } from '../db/projects'
import {
  addInstructorNote,
  importCourseRefs,
  importTermRefs,
  saveCourse,
  saveExam,
  saveInstructor,
  saveTerm,
} from '../db/school'
import { collections, instructors, notes } from '../db/schema'
import {
  defaultRoom,
  importSlots,
  matchCourse,
  matchInstructor,
  normalizeName,
  resolveTerm,
} from '../domain/school/scheduleImport'

// Onaylanan önerinin uygulanması (MIMARI.md "AI akışı" 4. adım). Mevcut yazma fonksiyonları kullanılır (iş kuralları
// tek yerde kalsın); hepsi tek transaction'da ve `withActivityContext('ai', groupId)` altında: kayıtlar AI'a atfedilir,
// tek grupta toplanır ve `undoGroup(groupId)` ile tek hamlede geri alınır.

export type Applied = { targetTable: string; targetId: string }

/**
 * Ders önerisinin dönemi: aynı işteki dönem önerisinin adı (reddedildiyse ya da yoksa null → aktif dönem).
 * `db/ai.ts` bulur; uygulayıcı sadece kullanır.
 */
export type ApplyHint = { termName?: string | null }

/** Dönem zaten varsa yazılacak bir şey yok; yoksa oluşur ve aktif olur. */
function applyImportTerm(
  db: Db,
  op: Extract<Operation, { op: 'import_term' }>,
  now: Date,
): Applied {
  const target = resolveTerm(op.name, importTermRefs(db))
  if (target.kind === 'existing') return { targetTable: 'terms', targetId: target.termId }
  if (!op.startDate) throw new Error("Dönemin başlangıç tarihi yok. Düzenle'den ekle.")
  const term = saveTerm(
    db,
    {
      name: op.name,
      startDate: op.startDate,
      weekCount: op.weekCount ?? 14,
      ...(op.endDate && { endDate: op.endDate }),
      active: true,
    },
    now,
  )
  return { targetTable: 'terms', targetId: term.id }
}

/**
 * Ders: dönemde aynı ders varsa güncellenir (programda boş gelen alan korunur), yoksa eklenir. Hoca adıyla bağlanır;
 * programda e-posta/ofis saati varsa ve hocanınki boşsa doldurulur.
 */
function applyImportCourse(
  db: Db,
  op: Extract<Operation, { op: 'import_course' }>,
  hint: ApplyHint,
  now: Date,
): Applied {
  const target = resolveTerm(hint.termName, importTermRefs(db))
  if (target.kind === 'none')
    throw new Error("Aktif dönem yok. Önce dönem önerisini onayla ya da Okul'da dönem oluştur.")
  if (target.kind === 'new') throw new Error('Dersin dönemi henüz oluşmadı.')
  const existing = matchCourse(op, importCourseRefs(db, target.termId))
  const slots = importSlots(op.slots, existing?.slots ?? [])
  const name =
    existing && normalizeName(existing.name) === normalizeName(op.name) ? existing.name : op.name
  // Kayıtlı hoca unvansız yazılmış olabilir: aynı kişiyse onun adı kullanılır (yeni hoca açılmaz).
  const instructorName = op.instructor?.trim()
    ? (matchInstructor(
        op.instructor,
        db.select().from(instructors).where(isNull(instructors.deletedAt)).all(),
      )?.name ?? op.instructor)
    : undefined
  const course = saveCourse(
    db,
    {
      ...(existing && { id: existing.id }),
      termId: target.termId,
      name,
      ...(op.code?.trim() ? { code: op.code } : {}),
      ...(op.credit != null && { credit: op.credit }),
      ...(instructorName ? { instructorName } : {}),
      ...(!existing && { room: defaultRoom(slots) }),
      // Mevcut derste boş saat listesi "programda saat okunamadı" demek; saatler silinmez.
      ...((!existing || slots.length > 0) && { slots }),
    },
    now,
  )
  const email = op.instructorEmail?.trim() ?? ''
  const office = op.instructorOfficeHours?.trim() ?? ''
  if (course.instructorId && (email || office)) {
    const inst = db.select().from(instructors).where(eq(instructors.id, course.instructorId)).get()
    if (inst && ((email && !inst.email) || (office && !inst.officeHours)))
      saveInstructor(
        db,
        {
          id: inst.id,
          name: inst.name,
          email: inst.email || email,
          room: inst.room,
          officeHours: inst.officeHours || office,
        },
        undefined,
        now,
      )
  }
  return { targetTable: 'courses', targetId: course.id }
}

/** "2026-10-02T09:00" → yerel saatle ms. */
export function localToMs(value: string): number {
  const [d, t] = value.split('T') as [string, string]
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  const [h, min] = t.split(':').map(Number) as [number, number]
  return new Date(y, m - 1, day, h, min).getTime()
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h * 60 + m
}

function collectionId(db: Db, name: string | null | undefined): string | null {
  const trimmed = name?.trim()
  if (!trimmed) return null
  const found = db
    .select({ id: collections.id })
    .from(collections)
    .where(and(sql`lower(${collections.name}) = lower(${trimmed})`, isNull(collections.deletedAt)))
    .get()
  return found?.id ?? createCollection(db, trimmed).id
}

function applyOne(db: Db, op: Operation, hint: ApplyHint, now: Date): Applied {
  switch (op.op) {
    case 'create_task': {
      const task = createTask(
        db,
        {
          title: op.title,
          dueDate: op.dueDate ?? null,
          estimateMin: op.estimateMin ?? null,
          projectId: op.context?.projectId ?? null,
          courseId: op.context?.courseId ?? null,
          ...(op.context?.projectId && op.kind ? { kind: op.kind } : {}),
        },
        now,
      )
      return { targetTable: 'tasks', targetId: task.id }
    }
    case 'create_note': {
      const note = createNote(db, collectionId(db, op.collection), op.context?.projectId ?? null)
      if (op.context?.courseId)
        db.update(notes).set({ courseId: op.context.courseId }).where(eq(notes.id, note.id)).run()
      updateNote(db, { id: note.id, title: op.title, bodyMd: op.bodyMd }, now)
      return { targetTable: 'notes', targetId: note.id }
    }
    case 'append_to_note': {
      const before = db
        .select({ bodyMd: notes.bodyMd })
        .from(notes)
        .where(and(eq(notes.id, op.noteId), isNull(notes.deletedAt)))
        .get()
      if (!before) throw new Error('Not bulunamadı')
      const body = before.bodyMd.trimEnd()
      updateNote(
        db,
        { id: op.noteId, bodyMd: body ? `${body}\n\n${op.appendMd}` : op.appendMd },
        now,
      )
      return { targetTable: 'notes', targetId: op.noteId }
    }
    case 'create_reminder': {
      const r = createReminder(db, { title: op.title, at: localToMs(op.at) }, now)
      return { targetTable: 'reminders', targetId: r.id }
    }
    case 'create_idea': {
      const note = createIdea(db, now)
      updateNote(db, { id: note.id, title: op.title, bodyMd: op.note ?? '' }, now)
      return { targetTable: 'notes', targetId: note.id }
    }
    case 'create_exam': {
      const { id } = saveExam(
        db,
        {
          courseId: op.courseId,
          title: op.title,
          day: op.date,
          startMin: op.time ? toMin(op.time) : null,
          weekFrom: op.weekFrom ?? null,
          weekTo: op.weekTo ?? null,
        },
        now,
      )
      return { targetTable: 'exams', targetId: id }
    }
    case 'set_project_next_step':
      updateProject(db, { id: op.projectId, nextStep: op.text }, now)
      return { targetTable: 'projects', targetId: op.projectId }
    case 'add_instructor_note': {
      const { id } = addInstructorNote(db, op.courseId, op.text, now)
      return { targetTable: 'instructor_notes', targetId: id }
    }
    case 'import_term':
      return applyImportTerm(db, op, now)
    case 'import_course':
      return applyImportCourse(db, op, hint, now)
  }
}

/** Öneriyi tek transaction'da uygular; hata olursa hiçbir şey yazılmaz. */
export function applyOperation(
  db: Db,
  op: Operation,
  groupId: string,
  now = new Date(),
  hint: ApplyHint = {},
): Applied {
  return db.transaction(() => withActivityContext('ai', groupId, () => applyOne(db, op, hint, now)))
}
