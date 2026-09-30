import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne } from 'drizzle-orm'
import { addDays, getISODay, startOfWeek } from 'date-fns'
import { ulid } from 'ulid'
import type {
  Assignment,
  AssignmentSaveInput,
  BoardWeek,
  AttendanceMark,
  AttendanceQuestion,
  AttendanceSession,
  Course,
  CourseDetail,
  CourseListItem,
  CourseSaveInput,
  CourseScore,
  DayKey,
  ExamPrep,
  ExamSaveInput,
  ExamSummary,
  ExamTopicSetInput,
  GpaOverview,
  InstructorNote,
  LetterRow,
  Material,
  MaterialKind,
  PlanPreview,
  SchoolBoard,
  SchoolRestoreInput,
  SchoolSetupInput,
  StudyBlockStatus,
  Term,
  TermSaveInput,
  TopicSaveInput,
} from '@shared/ipc'
import {
  DEFAULT_LETTER_TABLE,
  gpa,
  letterFor,
  letterPoints,
  requiredScores,
  weightedScore,
  type GpaCourse,
} from '@shared/school/grades'
import { dayKey, parseDayKey } from '../domain/recurrence'
import { attendanceStatus, type AttendanceLimit } from '../domain/school/attendance'
import {
  buildStudyPlan,
  dayFreeSlots,
  examReadiness,
  redistribute,
  topicMinutes,
  type FreeSlot,
  type Interval,
  type Level,
  type PlannedBlock,
  type StudyTopic,
} from '../domain/school/studyPlan'
import {
  defaultEndDate,
  inTerm,
  nextTone,
  slotOccurrences,
  termProgress,
  nextOccurrence,
  termWeek,
  weekRange,
} from '../domain/school/term'
import { logActivity } from './activity'
import type { Db, DbTx } from './client'
import type { MediaRow } from '../media'
import {
  assignments,
  attendance,
  courseMaterials,
  courseSlots,
  courses,
  courseWeeks,
  examTopics,
  exams,
  gradeComponents,
  instructorNotes,
  instructors,
  media,
  noteFlags,
  notes,
  reminders,
  routines,
  studyBlocks,
  terms,
  topics,
} from './schema'

// Okul (Aşama 6, OKUL.md). Taha'nın her yazımı `activity_log`'a; çalışma planının kaçırılan bloklarının
// yeniden dağıtılması `system` aktörüyle tek grupla. Arşiv dönemin dersleri salt okunur (arayüzde).

type Conn = Db | DbTx
type TermRow = typeof terms.$inferSelect
type CourseRow = typeof courses.$inferSelect
type SlotRow = typeof courseSlots.$inferSelect
type ComponentRow = typeof gradeComponents.$inferSelect
type ExamRow = typeof exams.$inferSelect
type StudyRow = typeof studyBlocks.$inferSelect
type AssignmentRow = typeof assignments.$inferSelect

/** Ödev hatırlatması son teslimden bu kadar önce. */
export const ASSIGNMENT_REMIND_MS = 48 * 3600_000
/** Günlük en fazla çalışma varsayılanı (dk); Ayarlar > Okul. */
export const DEFAULT_DAILY_STUDY_MIN = 180

const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()

function log(
  tx: Conn,
  action: 'create' | 'update' | 'delete' | 'restore',
  targetTable: string,
  targetId: string,
  before?: unknown,
  after?: unknown,
  groupId?: string,
  actor: 'taha' | 'system' = 'taha',
) {
  logActivity(tx, { actor, action, targetTable, targetId, before, after, groupId })
}

const parseJson = <T>(json: string | null): T | null => (json ? (JSON.parse(json) as T) : null)

const toTerm = (r: TermRow): Term => ({
  id: r.id,
  name: r.name,
  startDate: r.startDate,
  endDate: r.endDate,
  weekCount: r.weekCount,
  active: r.active,
})

const toSlot = (s: SlotRow) => ({
  id: s.id,
  weekday: s.weekday,
  startMin: s.startMin,
  endMin: s.endMin,
  room: s.room,
})

function toCourse(r: CourseRow, slots: readonly SlotRow[]): Course {
  return {
    id: r.id,
    termId: r.termId,
    name: r.name,
    code: r.code,
    credit: r.credit,
    tone: r.tone,
    instructorId: r.instructorId,
    room: r.room,
    attendanceLimit: parseJson<AttendanceLimit>(r.attendanceLimitJson),
    letterTable: parseJson<LetterRow[]>(r.letterTableJson),
    letter: r.letter,
    targetLetter: r.targetLetter,
    slots: slots
      .filter((s) => s.courseId === r.id)
      .sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin)
      .map(toSlot),
  }
}

const letterTableOf = (r: CourseRow): readonly LetterRow[] =>
  parseJson<LetterRow[]>(r.letterTableJson) ?? DEFAULT_LETTER_TABLE

function liveTerm(tx: Conn, id: string): TermRow {
  const row = tx
    .select()
    .from(terms)
    .where(and(eq(terms.id, id), isNull(terms.deletedAt)))
    .get()
  if (!row) throw new Error('Dönem bulunamadı')
  return row
}

function liveCourse(tx: Conn, id: string): CourseRow {
  const row = tx
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), isNull(courses.deletedAt)))
    .get()
  if (!row) throw new Error('Ders bulunamadı')
  return row
}

export function activeTerm(tx: Conn): TermRow | undefined {
  return tx
    .select()
    .from(terms)
    .where(and(eq(terms.active, true), isNull(terms.deletedAt)))
    .get()
}

const termCourses = (tx: Conn, termId: string) =>
  tx
    .select()
    .from(courses)
    .where(and(eq(courses.termId, termId), isNull(courses.deletedAt)))
    .orderBy(asc(courses.sort), asc(courses.createdAt))
    .all()

const slotsOf = (tx: Conn, courseIds: string[]) =>
  courseIds.length ? tx.select().from(courseSlots).where(inArray(courseSlots.courseId, courseIds)).all() : []

const componentsOf = (tx: Conn, courseIds: string[]) =>
  courseIds.length
    ? tx
        .select()
        .from(gradeComponents)
        .where(and(inArray(gradeComponents.courseId, courseIds), isNull(gradeComponents.deletedAt)))
        .orderBy(asc(gradeComponents.sort), asc(gradeComponents.createdAt))
        .all()
    : []

// ---------------------------------------------------------------- dönem

export function listTerms(db: Db): Term[] {
  return db
    .select()
    .from(terms)
    .where(isNull(terms.deletedAt))
    .orderBy(asc(terms.startDate))
    .all()
    .map(toTerm)
}

/** Dönemin her dersinde hafta satırları hafta sayısına tamamlanır (fazlası silinmez, gizlenir). */
function ensureWeeks(tx: DbTx, courseId: string, weekCount: number, now: Date) {
  const have = new Set(
    tx
      .select({ n: courseWeeks.weekNo })
      .from(courseWeeks)
      .where(eq(courseWeeks.courseId, courseId))
      .all()
      .map((r) => r.n),
  )
  for (let n = 1; n <= weekCount; n++) {
    if (have.has(n)) continue
    tx.insert(courseWeeks)
      .values({ id: ulid(), courseId, weekNo: n, createdAt: now, updatedAt: now })
      .run()
  }
}

function activate(tx: DbTx, id: string, now: Date, groupId: string) {
  for (const other of tx
    .select()
    .from(terms)
    .where(and(eq(terms.active, true), ne(terms.id, id)))
    .all()) {
    const after = tx
      .update(terms)
      .set({ active: false, updatedAt: now })
      .where(eq(terms.id, other.id))
      .returning()
      .get()
    log(tx, 'update', 'terms', other.id, other, after, groupId)
  }
}

function writeTerm(tx: DbTx, input: TermSaveInput, now: Date, groupId: string): TermRow {
  const weekCount = input.weekCount
  const endDate = input.endDate ?? defaultEndDate(input.startDate, weekCount)
  let row: TermRow
  if (input.id) {
    const before = liveTerm(tx, input.id)
    row = tx
      .update(terms)
      .set({
        name: input.name.trim(),
        startDate: input.startDate,
        endDate,
        weekCount,
        ...(input.active !== undefined && { active: input.active }),
        updatedAt: now,
      })
      .where(eq(terms.id, input.id))
      .returning()
      .get()
    log(tx, 'update', 'terms', row.id, before, row, groupId)
    for (const c of termCourses(tx, row.id)) ensureWeeks(tx, c.id, weekCount, now)
  } else {
    const active = input.active ?? !activeTerm(tx)
    row = tx
      .insert(terms)
      .values({
        id: ulid(),
        name: input.name.trim(),
        startDate: input.startDate,
        endDate,
        weekCount,
        active,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'terms', row.id, undefined, row, groupId)
  }
  if (row.active) activate(tx, row.id, now, groupId)
  return row
}

export function saveTerm(db: Db, input: TermSaveInput, now = new Date()): Term {
  return db.transaction((tx) => toTerm(writeTerm(tx, input, now, ulid())))
}

export function activateTerm(db: Db, id: string, now = new Date()): void {
  db.transaction((tx) => {
    const before = liveTerm(tx, id)
    const groupId = ulid()
    if (!before.active) {
      const after = tx
        .update(terms)
        .set({ active: true, updatedAt: now })
        .where(eq(terms.id, id))
        .returning()
        .get()
      log(tx, 'update', 'terms', id, before, after, groupId)
    }
    activate(tx, id, now, groupId)
  })
}

/** Dönem ve dersleri aynı anla çöp kutusuna (geri alma aynı anlı dersleri de döndürür). */
export function deleteTerm(db: Db, id: string, now = new Date()): void {
  db.transaction((tx) => {
    const before = liveTerm(tx, id)
    const groupId = ulid()
    const after = tx
      .update(terms)
      .set({ deletedAt: now, active: false, updatedAt: now })
      .where(eq(terms.id, id))
      .returning()
      .get()
    log(tx, 'delete', 'terms', id, before, after, groupId)
    for (const c of termCourses(tx, id)) {
      const a = tx
        .update(courses)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(courses.id, c.id))
        .returning()
        .get()
      log(tx, 'delete', 'courses', c.id, c, a, groupId)
    }
  })
}

// ---------------------------------------------------------------- ders

function resolveInstructor(tx: DbTx, name: string | undefined, now: Date, groupId: string): string | null {
  const clean = name?.trim()
  if (!clean) return null
  const key = clean.toLocaleLowerCase('tr-TR')
  const found = tx
    .select()
    .from(instructors)
    .where(isNull(instructors.deletedAt))
    .all()
    .find((i) => i.name.toLocaleLowerCase('tr-TR') === key)
  if (found) return found.id
  const row = tx
    .insert(instructors)
    .values({ id: ulid(), name: clean, createdAt: now, updatedAt: now })
    .returning()
    .get()
  log(tx, 'create', 'instructors', row.id, undefined, row, groupId)
  return row.id
}

function writeSlots(
  tx: DbTx,
  courseId: string,
  slots: NonNullable<CourseSaveInput['slots']>,
  now: Date,
  groupId: string,
) {
  const existing = tx.select().from(courseSlots).where(eq(courseSlots.courseId, courseId)).all()
  const keep = new Set(slots.map((s) => s.id).filter(Boolean))
  for (const old of existing) {
    if (keep.has(old.id)) continue
    tx.delete(courseSlots).where(eq(courseSlots.id, old.id)).run()
    log(tx, 'delete', 'course_slots', old.id, old, undefined, groupId)
  }
  for (const s of slots) {
    const values = {
      weekday: s.weekday,
      startMin: s.startMin,
      endMin: s.endMin,
      room: (s.room ?? '').trim(),
    }
    const old = s.id ? existing.find((e) => e.id === s.id) : undefined
    if (old) {
      if (
        old.weekday === values.weekday &&
        old.startMin === values.startMin &&
        old.endMin === values.endMin &&
        old.room === values.room
      )
        continue
      const after = tx
        .update(courseSlots)
        .set({ ...values, updatedAt: now })
        .where(eq(courseSlots.id, old.id))
        .returning()
        .get()
      log(tx, 'update', 'course_slots', old.id, old, after, groupId)
    } else {
      const row = tx
        .insert(courseSlots)
        .values({ id: ulid(), courseId, ...values, createdAt: now, updatedAt: now })
        .returning()
        .get()
      log(tx, 'create', 'course_slots', row.id, undefined, row, groupId)
    }
  }
}

function writeCourse(tx: DbTx, input: CourseSaveInput, now: Date, groupId: string): CourseRow {
  const term = liveTerm(tx, input.termId)
  const instructorId =
    input.instructorName !== undefined ? resolveInstructor(tx, input.instructorName, now, groupId) : undefined
  // Güncellemede verilmeyen alan korunur.
  const common = {
    name: input.name.trim(),
    ...(input.code !== undefined && { code: input.code.trim() }),
    ...(input.credit !== undefined && { credit: input.credit }),
    ...(input.room !== undefined && { room: input.room.trim() }),
    ...(instructorId !== undefined && { instructorId }),
    ...(input.attendanceLimit !== undefined && {
      attendanceLimitJson: input.attendanceLimit ? JSON.stringify(input.attendanceLimit) : null,
    }),
    ...(input.letterTable !== undefined && {
      letterTableJson: input.letterTable ? JSON.stringify(input.letterTable) : null,
    }),
    ...(input.letter !== undefined && { letter: input.letter?.trim() || null }),
    ...(input.targetLetter !== undefined && { targetLetter: input.targetLetter.trim() }),
    ...(input.tone !== undefined && { tone: input.tone.toUpperCase() }),
  }
  let row: CourseRow
  if (input.id) {
    const before = liveCourse(tx, input.id)
    row = tx
      .update(courses)
      .set({ ...common, termId: term.id, updatedAt: now })
      .where(eq(courses.id, input.id))
      .returning()
      .get()
    log(tx, 'update', 'courses', row.id, before, row, groupId)
  } else {
    const siblings = termCourses(tx, term.id)
    row = tx
      .insert(courses)
      .values({
        id: ulid(),
        termId: term.id,
        tone: nextTone(siblings.map((c) => c.tone)),
        sort: siblings.length,
        ...common,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'courses', row.id, undefined, row, groupId)
    ensureWeeks(tx, row.id, term.weekCount, now)
    ;(input.components ?? []).forEach((c, i) => {
      const comp = tx
        .insert(gradeComponents)
        .values({
          id: ulid(),
          courseId: row.id,
          name: c.name.trim(),
          kind: c.kind,
          weight: c.weight,
          sort: i,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      log(tx, 'create', 'grade_components', comp.id, undefined, comp, groupId)
    })
  }
  if (input.slots) writeSlots(tx, row.id, input.slots, now, groupId)
  return row
}

export function saveCourse(db: Db, input: CourseSaveInput, now = new Date()): Course {
  return db.transaction((tx) => {
    const row = writeCourse(tx, input, now, ulid())
    return toCourse(row, slotsOf(tx, [row.id]))
  })
}

/** İlk kurulum: dönem (aktif) + dersler tek grupla. */
export function setupSchool(db: Db, input: SchoolSetupInput, now = new Date()): Term {
  return db.transaction((tx) => {
    const groupId = ulid()
    const term = writeTerm(tx, { ...input.term, active: true }, now, groupId)
    for (const c of input.courses) writeCourse(tx, { ...c, termId: term.id }, now, groupId)
    return toTerm(term)
  })
}

export function deleteCourse(db: Db, id: string, now = new Date()): void {
  db.transaction((tx) => {
    const before = liveCourse(tx, id)
    const after = tx
      .update(courses)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(courses.id, id))
      .returning()
      .get()
    log(tx, 'delete', 'courses', id, before, after)
  })
}

export function listCourses(db: Db, termId: string): CourseListItem[] {
  const rows = termCourses(db, termId)
  const slots = slotsOf(
    db,
    rows.map((r) => r.id),
  )
  const names = new Map(
    db
      .select()
      .from(instructors)
      .all()
      .map((i) => [i.id, i.name]),
  )
  return rows.map((r) => ({
    ...toCourse(r, slots),
    instructorName: r.instructorId ? (names.get(r.instructorId) ?? null) : null,
  }))
}

/** Ders sırası (Ayarlar'da sürükleme yok; yukarı / aşağı). */
export function moveCourse(db: Db, id: string, dir: -1 | 1, now = new Date()): void {
  db.transaction((tx) => {
    const row = liveCourse(tx, id)
    const list = termCourses(tx, row.termId)
    const i = list.findIndex((c) => c.id === id)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const [a, b] = [list[i]!, list[j]!]
    const groupId = ulid()
    list.forEach((c, k) => {
      const sort = c.id === a.id ? j : c.id === b.id ? i : k
      if (c.sort === sort) return
      const after = tx
        .update(courses)
        .set({ sort, updatedAt: now })
        .where(eq(courses.id, c.id))
        .returning()
        .get()
      log(tx, 'update', 'courses', c.id, c, after, groupId)
    })
  })
}

// ---------------------------------------------------------------- not ve devam hesabı

function courseScore(course: CourseRow, comps: readonly ComponentRow[]): CourseScore {
  const table = letterTableOf(course)
  const inputs = comps
    .filter((c) => c.courseId === course.id)
    .map((c) => ({ id: c.id, weight: c.weight, score: c.score }))
  const w = weightedScore(inputs)
  // Harf tahmin edilmez: elle girilen harf ya da bütün bileşenler girilince çıkan sonuç.
  const complete = inputs.length > 0 && inputs.every((c) => c.weight <= 0 || c.score !== null)
  const estimated = complete ? letterFor(w.earned, table).letter : null
  return {
    earned: w.earned,
    current: w.current,
    completedWeight: w.completedWeight,
    totalWeight: w.totalWeight,
    letter: course.letter ?? estimated,
    letterManual: !!course.letter,
    required: requiredScores(inputs, course.targetLetter, table),
  }
}

type AttendanceRow = typeof attendance.$inferSelect

function courseSessions(
  term: TermRow,
  slots: readonly SlotRow[],
  marks: readonly AttendanceRow[],
  now: Date,
): AttendanceSession[] {
  const today = dayKey(now)
  const nowMin = minuteOfDay(now)
  const byKey = new Map(marks.map((m) => [`${m.slotId}|${m.day}`, m]))
  const seen = new Set<string>()
  const out: AttendanceSession[] = slotOccurrences(term, slots).map((o) => {
    const key = `${o.slotId}|${o.day}`
    seen.add(key)
    return {
      ...o,
      status: byKey.get(key)?.status ?? null,
      past: o.day < today || (o.day === today && o.endMin <= nowMin),
    }
  })
  // Programdan kaldırılmış saatlerin eski yoklamaları da sayılır.
  for (const m of marks) {
    if (seen.has(`${m.slotId}|${m.day}`)) continue
    out.push({
      slotId: m.slotId,
      day: m.day,
      startMin: m.startMin,
      endMin: m.startMin + m.durationMin,
      status: m.status,
      past: true,
    })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin)
}

const attendanceOf = (course: CourseRow, sessions: readonly AttendanceSession[]) =>
  attendanceStatus(
    sessions.map((s) => ({ durationMin: s.endMin - s.startMin, status: s.status })),
    parseJson<AttendanceLimit>(course.attendanceLimitJson),
  )

// ---------------------------------------------------------------- çalışma blokları, yeniden dağıtma

type Busy = Interval

/** O günün dolu saatleri: aktif dönemin dersleri (iptal edilmemiş), rutinler, diğer çalışma blokları. */
function busyForDay(tx: Conn, day: DayKey, excludeStudyIds: ReadonlySet<string>): Busy[] {
  const out: Busy[] = []
  const iso = getISODay(parseDayKey(day))
  const term = activeTerm(tx)
  if (term && inTerm(term, day)) {
    const courseIds = termCourses(tx, term.id).map((c) => c.id)
    const cancelled = new Set(
      courseIds.length
        ? tx
            .select({ slotId: attendance.slotId })
            .from(attendance)
            .where(and(eq(attendance.day, day), eq(attendance.status, 'cancelled')))
            .all()
            .map((r) => r.slotId)
        : [],
    )
    for (const s of slotsOf(tx, courseIds))
      if (s.weekday === iso && !cancelled.has(s.id)) out.push({ start: s.startMin, end: s.endMin })
  }
  for (const r of tx.select().from(routines).where(and(isNull(routines.deletedAt), eq(routines.active, true))).all()) {
    const days = JSON.parse(r.daysJson) as number[]
    if (!days.includes(iso)) continue
    const [h, m] = r.startTime.split(':').map(Number) as [number, number]
    out.push({ start: h * 60 + m, end: h * 60 + m + r.durationMin })
  }
  for (const b of tx
    .select()
    .from(studyBlocks)
    .where(and(eq(studyBlocks.day, day), ne(studyBlocks.status, 'missed')))
    .all())
    if (!excludeStudyIds.has(b.id)) out.push({ start: b.startMin, end: b.endMin })
  return out
}

function daysBetween(from: DayKey, before: DayKey): DayKey[] {
  const out: DayKey[] = []
  for (let d = parseDayKey(from); dayKey(d) < before; d = addDays(d, 1)) out.push(dayKey(d))
  return out
}

/** Bugünden sınava kadar boş saatler ve günlük yük (sayılmayacak bloklar hariç). */
function freeUntil(
  tx: Conn,
  examDay: DayKey,
  now: Date,
  exclude: ReadonlySet<string>,
): { freeSlots: FreeSlot[]; load: Record<DayKey, number> } {
  const today = dayKey(now)
  const freeSlots: FreeSlot[] = []
  const load: Record<DayKey, number> = {}
  const days = daysBetween(today, examDay)
  if (!days.length) return { freeSlots, load }
  const study = tx
    .select()
    .from(studyBlocks)
    .where(and(gte(studyBlocks.day, today), ne(studyBlocks.status, 'missed')))
    .all()
  for (const b of study) {
    if (exclude.has(b.id)) continue
    load[b.day] = (load[b.day] ?? 0) + (b.endMin - b.startMin)
  }
  for (const day of days)
    freeSlots.push(
      ...dayFreeSlots(day, busyForDay(tx, day, exclude), undefined, day === today ? minuteOfDay(now) : undefined),
    )
  return { freeSlots, load }
}

/**
 * Günü geçmiş, işaretlenmemiş çalışma blokları "kaçırıldı" olur ve süreleri sınava kadar kalan günlere
 * yayılır (sınav geçmişse sadece işaretlenir). Açılışta ve Bugün'ün her okumasında çalışır.
 */
export function sweepMissedStudy(tx: DbTx, now: Date, dailyMax: number): number {
  const today = dayKey(now)
  const missed = tx
    .select()
    .from(studyBlocks)
    .where(and(eq(studyBlocks.status, 'planned'), lte(studyBlocks.day, dayKey(addDays(now, -1)))))
    .all()
  if (!missed.length) return 0
  const groupId = ulid()
  for (const b of missed) {
    const after = tx
      .update(studyBlocks)
      .set({ status: 'missed', updatedAt: now })
      .where(eq(studyBlocks.id, b.id))
      .returning()
      .get()
    log(tx, 'update', 'study_blocks', b.id, b, after, groupId, 'system')
  }
  const byExam = new Map<string, StudyRow[]>()
  for (const b of missed) byExam.set(b.examId, [...(byExam.get(b.examId) ?? []), b])
  for (const [examId, list] of byExam) {
    const exam = tx
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), isNull(exams.deletedAt)))
      .get()
    if (!exam || exam.day <= today) continue
    const { freeSlots, load } = freeUntil(tx, exam.day, now, new Set())
    const r = redistribute({
      missed: list.map((b) => ({ day: b.day, start: b.startMin, end: b.endMin, topicId: b.topicId })),
      examDay: exam.day,
      today,
      freeSlots,
      dailyMax,
      load,
    })
    insertBlocks(tx, examId, r.blocks, now, groupId, 'system')
    const after = tx
      .update(exams)
      .set({ unfitMin: r.unfitMin, updatedAt: now })
      .where(eq(exams.id, examId))
      .returning()
      .get()
    log(tx, 'update', 'exams', examId, exam, after, groupId, 'system')
  }
  return missed.length
}

function insertBlocks(
  tx: DbTx,
  examId: string,
  blocks: readonly PlannedBlock[],
  now: Date,
  groupId: string,
  actor: 'taha' | 'system',
) {
  for (const b of blocks) {
    const row = tx
      .insert(studyBlocks)
      .values({
        id: ulid(),
        examId,
        topicId: b.topicId,
        day: b.day,
        startMin: b.start,
        endMin: b.end,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'study_blocks', row.id, undefined, row, groupId, actor)
  }
}

export type SchoolDayBlock = {
  kind: 'class' | 'study'
  sourceId: string
  start: number
  end: number
  title: string
  tone: string
  /** Ders: derslik; çalışma: konu. */
  detail: string
  courseId: string
  /** Ders: yoklama; çalışma: durum. */
  mark: AttendanceMark | StudyBlockStatus | null
}

/** Bugün'ün akış bandına giren okul blokları: dersler (iptaller hariç) ve çalışma blokları. */
export function schoolDayBlocks(tx: Conn, day: DayKey): SchoolDayBlock[] {
  const out: SchoolDayBlock[] = []
  const term = activeTerm(tx)
  const iso = getISODay(parseDayKey(day))
  const courseRows = term ? termCourses(tx, term.id) : []
  const byId = new Map(courseRows.map((c) => [c.id, c]))
  if (term && inTerm(term, day)) {
    const marks = new Map(
      tx
        .select()
        .from(attendance)
        .where(eq(attendance.day, day))
        .all()
        .map((m) => [m.slotId, m.status]),
    )
    for (const s of slotsOf(tx, [...byId.keys()])) {
      if (s.weekday !== iso || marks.get(s.id) === 'cancelled') continue
      const c = byId.get(s.courseId)!
      out.push({
        kind: 'class',
        sourceId: s.id,
        start: s.startMin,
        end: s.endMin,
        title: c.name,
        tone: c.tone,
        detail: s.room || c.room,
        courseId: c.id,
        mark: marks.get(s.id) ?? null,
      })
    }
  }
  const blocks = tx
    .select()
    .from(studyBlocks)
    .where(and(eq(studyBlocks.day, day), ne(studyBlocks.status, 'missed')))
    .all()
  if (blocks.length) {
    const examRows = tx
      .select()
      .from(exams)
      .where(
        and(
          inArray(
            exams.id,
            blocks.map((b) => b.examId),
          ),
          isNull(exams.deletedAt),
        ),
      )
      .all()
    const examById = new Map(examRows.map((e) => [e.id, e]))
    const topicNames = topicNameMap(tx, blocks.map((b) => b.topicId).filter((t): t is string => !!t))
    const courseAll = new Map(
      tx
        .select()
        .from(courses)
        .where(
          inArray(
            courses.id,
            examRows.map((e) => e.courseId),
          ),
        )
        .all()
        .map((c) => [c.id, c]),
    )
    for (const b of blocks) {
      const exam = examById.get(b.examId)
      const course = exam && courseAll.get(exam.courseId)
      if (!exam || !course || course.deletedAt) continue
      out.push({
        kind: 'study',
        sourceId: b.id,
        start: b.startMin,
        end: b.endMin,
        title: `${exam.title} çalışması`,
        tone: course.tone,
        detail: b.topicId ? (topicNames.get(b.topicId) ?? 'Konu') : 'Genel tekrar',
        courseId: course.id,
        mark: b.status,
      })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

function topicNameMap(tx: Conn, ids: string[]): Map<string, string> {
  if (!ids.length) return new Map()
  return new Map(
    tx
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(inArray(topics.id, ids))
      .all()
      .map((t) => [t.id, t.name]),
  )
}

/** Bugün'deki "Derse katıldın mı?": bugün biten ve işaretlenmemiş dersler. */
export function attendanceQuestions(db: Db, now = new Date()): AttendanceQuestion[] {
  const today = dayKey(now)
  const nowMin = minuteOfDay(now)
  return schoolDayBlocks(db, today)
    .filter((b) => b.kind === 'class' && b.mark === null && b.end <= nowMin)
    .map((b) => ({
      slotId: b.sourceId,
      courseId: b.courseId,
      name: b.title,
      tone: b.tone,
      day: today,
      startMin: b.start,
      endMin: b.end,
    }))
}

export function setStudyStatus(db: Db, id: string, status: 'planned' | 'done', now = new Date()): void {
  db.transaction((tx) => {
    const before = tx.select().from(studyBlocks).where(eq(studyBlocks.id, id)).get()
    if (!before) throw new Error('Çalışma bloğu bulunamadı')
    if (before.status === status) return
    const after = tx
      .update(studyBlocks)
      .set({ status, updatedAt: now })
      .where(eq(studyBlocks.id, id))
      .returning()
      .get()
    log(tx, 'update', 'study_blocks', id, before, after)
  })
}

// ---------------------------------------------------------------- yoklama

export function setAttendance(
  db: Db,
  input: { slotId: string; day: DayKey; status: AttendanceMark | null },
  now = new Date(),
): void {
  db.transaction((tx) => {
    const slot = tx.select().from(courseSlots).where(eq(courseSlots.id, input.slotId)).get()
    const before = tx
      .select()
      .from(attendance)
      .where(and(eq(attendance.slotId, input.slotId), eq(attendance.day, input.day)))
      .get()
    if (input.status === null) {
      if (!before) return
      tx.delete(attendance).where(eq(attendance.id, before.id)).run()
      log(tx, 'delete', 'attendance', before.id, before)
      return
    }
    if (before) {
      if (before.status === input.status) return
      const after = tx
        .update(attendance)
        .set({ status: input.status, updatedAt: now })
        .where(eq(attendance.id, before.id))
        .returning()
        .get()
      log(tx, 'update', 'attendance', before.id, before, after)
      return
    }
    if (!slot) throw new Error('Ders saati bulunamadı')
    if (getISODay(parseDayKey(input.day)) !== slot.weekday) throw new Error('Bu gün o dersin günü değil')
    const row = tx
      .insert(attendance)
      .values({
        id: ulid(),
        courseId: slot.courseId,
        slotId: slot.id,
        day: input.day,
        status: input.status,
        durationMin: slot.endMin - slot.startMin,
        startMin: slot.startMin,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'attendance', row.id, undefined, row)
  })
}

// ---------------------------------------------------------------- pano

function examStats(tx: Conn, examIds: string[]) {
  const levels = new Map<string, { level: number; emphasized: boolean }[]>()
  const minutes = new Map<string, { planned: number; done: number }>()
  if (!examIds.length) return { levels, minutes }
  const rows = tx
    .select({ examId: examTopics.examId, level: examTopics.level, emphasized: topics.emphasized })
    .from(examTopics)
    .innerJoin(topics, eq(topics.id, examTopics.topicId))
    .where(and(inArray(examTopics.examId, examIds), isNull(topics.deletedAt)))
    .all()
  for (const r of rows) levels.set(r.examId, [...(levels.get(r.examId) ?? []), r])
  for (const b of tx.select().from(studyBlocks).where(inArray(studyBlocks.examId, examIds)).all()) {
    const m = minutes.get(b.examId) ?? { planned: 0, done: 0 }
    const len = b.endMin - b.startMin
    if (b.status !== 'missed') m.planned += len
    if (b.status === 'done') m.done += len
    minutes.set(b.examId, m)
  }
  return { levels, minutes }
}

const readinessOf = (list: { level: number; emphasized: boolean }[] | undefined) =>
  examReadiness((list ?? []).map((t) => ({ level: t.level as Level, emphasized: t.emphasized })))

const daysUntil = (from: DayKey, to: DayKey) =>
  Math.round((parseDayKey(to).getTime() - parseDayKey(from).getTime()) / 86_400_000)

function termGpaCourses(tx: Conn, term: TermRow, order: number): GpaCourse[] {
  const rows = termCourses(tx, term.id)
  const comps = componentsOf(
    tx,
    rows.map((r) => r.id),
  )
  return rows.map((c) => {
    const score = courseScore(c, comps)
    return {
      key: c.code || c.name,
      credit: c.credit,
      points: score.letter ? letterPoints(score.letter, letterTableOf(c)) : null,
      order,
    }
  })
}

export function getBoard(db: Db, dailyMax: number, now = new Date()): SchoolBoard {
  return db.transaction((tx) => {
    sweepMissedStudy(tx, now, dailyMax)
    const today = dayKey(now)
    const tomorrow = dayKey(addDays(now, 1))
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const weekStart = dayKey(startOfWeek(now, { weekStartsOn: 1 }))
    const weekEnd = dayKey(addDays(parseDayKey(weekStart), 6))
    const term = activeTerm(tx)
    const allTerms = tx.select().from(terms).where(isNull(terms.deletedAt)).orderBy(asc(terms.startDate)).all()
    const overall = gpa(allTerms.flatMap((t, i) => termGpaCourses(tx, t, i)))
    if (!term)
      return {
        term: null,
        today,
        week: 0,
        progress: 0,
        termGpa: null,
        overallGpa: overall.gpa,
        courses: [],
        exams: [],
        weekStart,
        classes: [],
        study: [],
        dueThisWeek: [],
        tomorrow,
        soonClasses: [],
        soonStudy: [],
        dueSoon: [],
      }

    const courseRows = termCourses(tx, term.id)
    const ids = courseRows.map((c) => c.id)
    const byId = new Map(courseRows.map((c) => [c.id, c]))
    const slots = slotsOf(tx, ids)
    const comps = componentsOf(tx, ids)
    const marks = ids.length ? tx.select().from(attendance).where(inArray(attendance.courseId, ids)).all() : []
    const weekSummaries = courseWeekSummaries(tx, ids, term.weekCount)

    const boardCourses = courseRows.map((c) => {
      const courseSlotRows = slots.filter((s) => s.courseId === c.id)
      const sessions = courseSessions(
        term,
        courseSlotRows,
        marks.filter((m) => m.courseId === c.id),
        now,
      )
      const next = nextOccurrence(term, courseSlotRows, today, nowMin)
      const nextSlot = next && courseSlotRows.find((s) => s.id === next.slotId)
      return {
        id: c.id,
        name: c.name,
        code: c.code,
        credit: c.credit,
        tone: c.tone,
        targetLetter: c.targetLetter,
        score: courseScore(c, comps),
        attendance: attendanceOf(c, sessions),
        weeks: weekSummaries.get(c.id) ?? [],
        nextClass: next && {
          day: next.day,
          startMin: next.startMin,
          endMin: next.endMin,
          room: nextSlot?.room || c.room,
        },
      }
    })

    const examRows = ids.length
      ? tx
          .select()
          .from(exams)
          .where(and(inArray(exams.courseId, ids), isNull(exams.deletedAt), gte(exams.day, today)))
          .orderBy(asc(exams.day), asc(exams.startMin))
          .all()
      : []
    const stats = examStats(
      tx,
      examRows.map((e) => e.id),
    )
    const examCards = examRows.map((e) => {
      const c = byId.get(e.courseId)!
      const m = stats.minutes.get(e.id) ?? { planned: 0, done: 0 }
      return {
        id: e.id,
        courseId: c.id,
        courseName: c.name,
        tone: c.tone,
        title: e.title,
        day: e.day,
        startMin: e.startMin,
        place: e.place,
        daysLeft: daysUntil(today, e.day),
        readiness: readinessOf(stats.levels.get(e.id)),
        topicCount: stats.levels.get(e.id)?.length ?? 0,
        plannedMin: m.planned,
        doneMin: m.done,
      }
    })

    const classesOn = (day: DayKey) => {
      if (!inTerm(term, day)) return []
      const iso = getISODay(parseDayKey(day))
      return slots
        .filter((s) => s.weekday === iso)
        .map((s) => {
          const c = byId.get(s.courseId)!
          return {
            slotId: s.id,
            courseId: c.id,
            name: c.name,
            code: c.code,
            tone: c.tone,
            room: s.room || c.room,
            day,
            startMin: s.startMin,
            endMin: s.endMin,
            attendance: marks.find((m) => m.slotId === s.id && m.day === day)?.status ?? null,
          }
        })
        .sort((a, b) => a.startMin - b.startMin)
    }
    const classes = Array.from({ length: 7 }, (_, i) => dayKey(addDays(parseDayKey(weekStart), i))).flatMap(classesOn)

    const weekBlocks = tx
      .select()
      .from(studyBlocks)
      .where(
        and(
          gte(studyBlocks.day, weekStart),
          // Pazar günü "yarın" gelecek haftada
          lte(studyBlocks.day, tomorrow > weekEnd ? tomorrow : weekEnd),
          ne(studyBlocks.status, 'missed'),
        ),
      )
      .all()
    const blockExams = weekBlocks.length
      ? tx
          .select()
          .from(exams)
          .where(
            and(
              inArray(
                exams.id,
                weekBlocks.map((b) => b.examId),
              ),
              isNull(exams.deletedAt),
            ),
          )
          .all()
      : []
    const topicNames = topicNameMap(tx, weekBlocks.map((b) => b.topicId).filter((t): t is string => !!t))
    const blocks = weekBlocks.flatMap((b) => {
      const e = blockExams.find((x) => x.id === b.examId)
      const c = e && byId.get(e.courseId)
      if (!e || !c) return []
      return [
        {
          id: b.id,
          examId: e.id,
          courseId: c.id,
          tone: c.tone,
          title: b.topicId ? (topicNames.get(b.topicId) ?? e.title) : `${e.title} · tekrar`,
          day: b.day,
          startMin: b.startMin,
          endMin: b.endMin,
          status: b.status,
        },
      ]
    })

    const weekEndMs = addDays(parseDayKey(weekEnd), 1).getTime()
    const weekStartMs = parseDayKey(weekStart).getTime()
    const due = ids.length
      ? tx
          .select()
          .from(assignments)
          .where(and(inArray(assignments.courseId, ids), isNull(assignments.deletedAt)))
          .orderBy(asc(assignments.dueAt))
          .all()
      : []
    const dueThisWeek = due
      .filter((a) => {
        const t = a.dueAt.getTime()
        const open = a.status === 'todo' || a.status === 'doing'
        return t < weekEndMs && (open || t >= weekStartMs)
      })
      .map((a) => ({ ...toAssignment(a), courseName: byId.get(a.courseId)!.name, tone: byId.get(a.courseId)!.tone }))
    const soonLimit = now.getTime() + 48 * 3_600_000
    const dueSoon = due
      .filter((a) => (a.status === 'todo' || a.status === 'doing') && a.dueAt.getTime() < soonLimit)
      .map((a) => ({ ...toAssignment(a), courseName: byId.get(a.courseId)!.name, tone: byId.get(a.courseId)!.tone }))
    const soon = (day: DayKey) => day === today || day === tomorrow

    return {
      term: toTerm(term),
      today,
      week: termWeek(term, today),
      progress: termProgress(term, today),
      termGpa: gpa(termGpaCourses(tx, term, allTerms.findIndex((t) => t.id === term.id))).gpa,
      overallGpa: overall.gpa,
      courses: boardCourses,
      exams: examCards,
      weekStart,
      classes: classes.sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin),
      study: blocks.filter((b) => b.day <= weekEnd),
      dueThisWeek,
      tomorrow,
      soonClasses: [today, tomorrow].flatMap(classesOn),
      soonStudy: blocks.filter((b) => soon(b.day)).sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin),
      dueSoon,
    }
  })
}

/**
 * Panodaki ders satırlarının hafta kareleri. Kare "dolu": haftanın başlığı, konusu, dolu notu ya da materyali var.
 * Açık "anlamadım" işaretleri ayrıca sayılır.
 */
function courseWeekSummaries(tx: Conn, ids: string[], weekCount: number): Map<string, BoardWeek[]> {
  const out = new Map<string, BoardWeek[]>()
  if (!ids.length) return out
  const weekRows = tx
    .select()
    .from(courseWeeks)
    .where(and(inArray(courseWeeks.courseId, ids), lte(courseWeeks.weekNo, weekCount)))
    .all()
  const topicRows = tx
    .select({ courseId: topics.courseId, weekNo: topics.weekNo })
    .from(topics)
    .where(and(inArray(topics.courseId, ids), isNull(topics.deletedAt)))
    .all()
  const noteRows = tx
    .select({ weekId: notes.weekId, body: notes.bodyMd })
    .from(notes)
    .where(and(inArray(notes.courseId, ids), isNotNull(notes.weekId), isNull(notes.deletedAt)))
    .all()
  const materialRows = tx
    .select({ courseId: courseMaterials.courseId, weekNo: courseMaterials.weekNo })
    .from(courseMaterials)
    .where(and(inArray(courseMaterials.courseId, ids), isNull(courseMaterials.deletedAt)))
    .all()
  const flagRows = tx
    .select({ courseId: noteFlags.courseId, weekNo: noteFlags.weekNo })
    .from(noteFlags)
    .where(and(inArray(noteFlags.courseId, ids), isNull(noteFlags.deletedAt), isNull(noteFlags.resolvedAt)))
    .all()
  const key = (courseId: string, weekNo: number | null) => `${courseId}:${weekNo}`
  const content = new Set([...topicRows, ...materialRows].map((r) => key(r.courseId, r.weekNo)))
  const notedWeeks = new Set(noteRows.filter((n) => n.body.trim()).map((n) => n.weekId))
  const flags = new Map<string, number>()
  for (const f of flagRows) flags.set(key(f.courseId, f.weekNo), (flags.get(key(f.courseId, f.weekNo)) ?? 0) + 1)
  for (const w of weekRows.sort((a, b) => a.weekNo - b.weekNo)) {
    const k = key(w.courseId, w.weekNo)
    const list = out.get(w.courseId) ?? []
    list.push({
      weekNo: w.weekNo,
      title: w.title,
      filled: !!w.title.trim() || content.has(k) || notedWeeks.has(w.id),
      openFlags: flags.get(k) ?? 0,
    })
    out.set(w.courseId, list)
  }
  return out
}

const toAssignment = (a: AssignmentRow): Assignment => ({
  id: a.id,
  courseId: a.courseId,
  title: a.title,
  dueAt: a.dueAt.getTime(),
  status: a.status,
  score: a.score,
  weekNo: a.weekNo,
})

// ---------------------------------------------------------------- ders detayı

const mediaUrl = (fileName: string) => `sm-media://m/${fileName}`

export function getCourseDetail(db: Db, id: string, dailyMax: number, now = new Date()): CourseDetail | null {
  return db.transaction((tx) => {
    sweepMissedStudy(tx, now, dailyMax)
    const course = tx
      .select()
      .from(courses)
      .where(and(eq(courses.id, id), isNull(courses.deletedAt)))
      .get()
    if (!course) return null
    const term = liveTerm(tx, course.termId)
    const today = dayKey(now)
    const slots = slotsOf(tx, [id])
    const comps = componentsOf(tx, [id])
    const marks = tx.select().from(attendance).where(eq(attendance.courseId, id)).all()
    const instructor = course.instructorId
      ? tx.select().from(instructors).where(eq(instructors.id, course.instructorId)).get()
      : undefined

    const instructorNoteRows = instructor
      ? tx
          .select()
          .from(instructorNotes)
          .where(and(eq(instructorNotes.instructorId, instructor.id), isNull(instructorNotes.deletedAt)))
          .orderBy(asc(instructorNotes.day), asc(instructorNotes.createdAt))
          .all()
      : []
    const noteCourseNames = new Map(
      tx
        .select({ id: courses.id, name: courses.name })
        .from(courses)
        .all()
        .map((c) => [c.id, c.name]),
    )
    const iNotes: InstructorNote[] = instructorNoteRows.reverse().map((n) => ({
      id: n.id,
      text: n.text,
      day: n.day,
      courseId: n.courseId,
      courseName: n.courseId ? (noteCourseNames.get(n.courseId) ?? null) : null,
    }))

    const weekRows = tx
      .select()
      .from(courseWeeks)
      .where(and(eq(courseWeeks.courseId, id), lte(courseWeeks.weekNo, term.weekCount)))
      .orderBy(asc(courseWeeks.weekNo))
      .all()
    const topicRows = tx
      .select()
      .from(topics)
      .where(and(eq(topics.courseId, id), isNull(topics.deletedAt)))
      .orderBy(asc(topics.weekNo), asc(topics.sort), asc(topics.createdAt))
      .all()
    const weekNotes = tx
      .select({ id: notes.id, weekId: notes.weekId, body: notes.bodyMd })
      .from(notes)
      .where(and(eq(notes.courseId, id), isNotNull(notes.weekId), isNull(notes.deletedAt)))
      .all()
    const materialRows = tx
      .select({ m: courseMaterials, file: media })
      .from(courseMaterials)
      .innerJoin(media, eq(media.id, courseMaterials.mediaId))
      .where(and(eq(courseMaterials.courseId, id), isNull(courseMaterials.deletedAt)))
      .orderBy(asc(courseMaterials.createdAt))
      .all()
    const materials: Material[] = materialRows.map(({ m, file }) => ({
      id: m.id,
      weekNo: m.weekNo,
      kind: m.kind,
      title: m.title,
      url: mediaUrl(file.fileName),
      mime: file.mime,
    }))
    const flagRows = tx
      .select()
      .from(noteFlags)
      .where(and(eq(noteFlags.courseId, id), isNull(noteFlags.deletedAt)))
      .orderBy(asc(noteFlags.createdAt))
      .all()

    const weeks = weekRows.map((w) => {
      const note = weekNotes.find((n) => n.weekId === w.id)
      const range = weekRange(term, w.weekNo)
      return {
        weekNo: w.weekNo,
        id: w.id,
        title: w.title,
        start: range.start,
        end: range.end,
        noteId: note?.id ?? null,
        hasNote: !!note?.body.trim(),
        materialCount: materials.filter((m) => m.weekNo === w.weekNo).length,
        openFlags: flagRows.filter((f) => f.weekNo === w.weekNo && !f.resolvedAt).length,
        topics: topicRows
          .filter((t) => t.weekNo === w.weekNo)
          .map((t) => ({ id: t.id, weekNo: t.weekNo, name: t.name, emphasized: t.emphasized })),
      }
    })

    const examRows = tx
      .select()
      .from(exams)
      .where(and(eq(exams.courseId, id), isNull(exams.deletedAt)))
      .orderBy(asc(exams.day))
      .all()
    const examSummaries = examsToSummaries(tx, examRows, comps)
    const sessions = courseSessions(term, slots, marks, now)
    const next = examRows.find((e) => e.day >= today)

    return {
      course: toCourse(course, slots),
      term: toTerm(term),
      readOnly: !term.active,
      instructor: instructor
        ? {
            id: instructor.id,
            name: instructor.name,
            email: instructor.email,
            room: instructor.room,
            officeHours: instructor.officeHours,
          }
        : null,
      instructorNotes: iNotes,
      currentWeek: termWeek(term, today),
      weeks,
      components: comps.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        weight: c.weight,
        score: c.score,
        scoredOn: c.scoredOn,
      })),
      score: courseScore(course, comps),
      exams: examSummaries,
      assignments: tx
        .select()
        .from(assignments)
        .where(and(eq(assignments.courseId, id), isNull(assignments.deletedAt)))
        .orderBy(asc(assignments.dueAt))
        .all()
        .map(toAssignment),
      attendance: attendanceOf(course, sessions),
      sessions,
      materials,
      flags: flagRows.map((f) => ({
        id: f.id,
        weekNo: f.weekNo,
        noteId: f.noteId,
        excerpt: f.excerpt,
        resolved: !!f.resolvedAt,
        createdAt: f.createdAt.getTime(),
      })),
      nextExamDays: next ? daysUntil(today, next.day) : null,
    }
  })
}

function examsToSummaries(tx: Conn, rows: readonly ExamRow[], comps: readonly ComponentRow[]): ExamSummary[] {
  const ids = rows.map((e) => e.id)
  const stats = examStats(tx, ids)
  const topicIds = new Map<string, string[]>()
  if (ids.length)
    for (const r of tx
      .select({ examId: examTopics.examId, topicId: examTopics.topicId })
      .from(examTopics)
      .innerJoin(topics, eq(topics.id, examTopics.topicId))
      .where(and(inArray(examTopics.examId, ids), isNull(topics.deletedAt)))
      .all())
      topicIds.set(r.examId, [...(topicIds.get(r.examId) ?? []), r.topicId])
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    day: e.day,
    startMin: e.startMin,
    place: e.place,
    componentId: e.componentId,
    score: comps.find((c) => c.id === e.componentId)?.score ?? null,
    reviewMd: e.reviewMd,
    topicIds: topicIds.get(e.id) ?? [],
    weekFrom: e.weekFrom,
    weekTo: e.weekTo,
    readiness: readinessOf(stats.levels.get(e.id)),
  }))
}

// ---------------------------------------------------------------- hoca

export function listInstructors(db: Db) {
  return db
    .select()
    .from(instructors)
    .where(isNull(instructors.deletedAt))
    .orderBy(asc(instructors.name))
    .all()
    .map((i) => ({ id: i.id, name: i.name, email: i.email, room: i.room, officeHours: i.officeHours }))
}

export function saveInstructor(
  db: Db,
  input: { id?: string; name: string; email: string; room: string; officeHours: string },
  courseId?: string,
  now = new Date(),
): { id: string } {
  return db.transaction((tx) => {
    const values = {
      name: input.name.trim(),
      email: input.email.trim(),
      room: input.room.trim(),
      officeHours: input.officeHours.trim(),
    }
    const groupId = ulid()
    if (input.id) {
      const before = tx.select().from(instructors).where(eq(instructors.id, input.id)).get()
      if (!before) throw new Error('Hoca bulunamadı')
      const after = tx
        .update(instructors)
        .set({ ...values, updatedAt: now })
        .where(eq(instructors.id, input.id))
        .returning()
        .get()
      log(tx, 'update', 'instructors', input.id, before, after, groupId)
      return { id: input.id }
    }
    const row = tx
      .insert(instructors)
      .values({ id: ulid(), ...values, createdAt: now, updatedAt: now })
      .returning()
      .get()
    log(tx, 'create', 'instructors', row.id, undefined, row, groupId)
    if (courseId) {
      const before = liveCourse(tx, courseId)
      const after = tx
        .update(courses)
        .set({ instructorId: row.id, updatedAt: now })
        .where(eq(courses.id, courseId))
        .returning()
        .get()
      log(tx, 'update', 'courses', courseId, before, after, groupId)
    }
    return { id: row.id }
  })
}

export function addInstructorNote(db: Db, courseId: string, text: string, now = new Date()): { id: string } {
  return db.transaction((tx) => {
    const course = liveCourse(tx, courseId)
    if (!course.instructorId) throw new Error('Önce dersin hocasını gir')
    const row = tx
      .insert(instructorNotes)
      .values({
        id: ulid(),
        instructorId: course.instructorId,
        courseId,
        text: text.trim(),
        day: dayKey(now),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'instructor_notes', row.id, undefined, row)
    return { id: row.id }
  })
}

// ---------------------------------------------------------------- hafta, konu, not, işaret, materyal

function weekRow(tx: Conn, courseId: string, weekNo: number) {
  const row = tx
    .select()
    .from(courseWeeks)
    .where(and(eq(courseWeeks.courseId, courseId), eq(courseWeeks.weekNo, weekNo)))
    .get()
  if (!row) throw new Error('Hafta bulunamadı')
  return row
}

export function setWeekTitle(db: Db, courseId: string, weekNo: number, title: string, now = new Date()): void {
  db.transaction((tx) => {
    const before = weekRow(tx, courseId, weekNo)
    if (before.title === title.trim()) return
    const after = tx
      .update(courseWeeks)
      .set({ title: title.trim(), updatedAt: now })
      .where(eq(courseWeeks.id, before.id))
      .returning()
      .get()
    log(tx, 'update', 'course_weeks', before.id, before, after)
  })
}

/** Haftanın ders notu: yoksa oluşturulur (Bilgi listesinde görünmez, aramada çıkar). */
export function weekNote(db: Db, courseId: string, weekNo: number, now = new Date()): { noteId: string } {
  return db.transaction((tx) => {
    const course = liveCourse(tx, courseId)
    const week = weekRow(tx, courseId, weekNo)
    const existing = tx
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.weekId, week.id), isNull(notes.deletedAt)))
      .get()
    if (existing) return { noteId: existing.id }
    const row = tx
      .insert(notes)
      .values({
        id: ulid(),
        title: `${course.name} · ${weekNo}. hafta`,
        courseId,
        weekId: week.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'notes', row.id, undefined, { ...row, tags: [] })
    return { noteId: row.id }
  })
}

export function saveTopic(db: Db, input: TopicSaveInput, now = new Date()): { id: string } {
  return db.transaction((tx) => {
    liveCourse(tx, input.courseId)
    if (input.id) {
      const before = tx
        .select()
        .from(topics)
        .where(and(eq(topics.id, input.id), isNull(topics.deletedAt)))
        .get()
      if (!before) throw new Error('Konu bulunamadı')
      const after = tx
        .update(topics)
        .set({
          name: input.name.trim(),
          ...(input.weekNo !== undefined && { weekNo: input.weekNo }),
          ...(input.emphasized !== undefined && { emphasized: input.emphasized }),
          updatedAt: now,
        })
        .where(eq(topics.id, input.id))
        .returning()
        .get()
      log(tx, 'update', 'topics', input.id, before, after)
      return { id: input.id }
    }
    const count = tx
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.courseId, input.courseId), isNull(topics.deletedAt)))
      .all().length
    const row = tx
      .insert(topics)
      .values({
        id: ulid(),
        courseId: input.courseId,
        weekNo: input.weekNo ?? null,
        name: input.name.trim(),
        emphasized: input.emphasized ?? false,
        sort: count,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'topics', row.id, undefined, row)
    // Yaklaşan sınavların kapsam haftaları bu haftayı içeriyorsa konu sınava da girer.
    if (row.weekNo !== null) {
      const upcoming = tx
        .select()
        .from(exams)
        .where(and(eq(exams.courseId, input.courseId), isNull(exams.deletedAt), gte(exams.day, dayKey(now))))
        .all()
      for (const e of upcoming) {
        if (e.weekFrom === null || e.weekTo === null) continue
        if (row.weekNo < Math.min(e.weekFrom, e.weekTo) || row.weekNo > Math.max(e.weekFrom, e.weekTo)) continue
        tx.insert(examTopics).values({ examId: e.id, topicId: row.id, createdAt: now, updatedAt: now }).run()
      }
    }
    return { id: row.id }
  })
}

/** Soft delete; tabloya göre ortak çöp kutusu işlemi. */
const SOFT_TABLES = {
  terms,
  courses,
  topics,
  grade_components: gradeComponents,
  exams,
  assignments,
  course_materials: courseMaterials,
  instructor_notes: instructorNotes,
  note_flags: noteFlags,
} as const

export function softDelete(db: Db, table: SchoolRestoreInput['table'], id: string, now = new Date()): void {
  if (table === 'terms') return deleteTerm(db, id, now)
  const t = SOFT_TABLES[table]
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(t)
      .where(and(eq(t.id, id), isNull(t.deletedAt)))
      .get()
    if (!before) throw new Error('Kayıt bulunamadı')
    const after = tx.update(t).set({ deletedAt: now, updatedAt: now }).where(eq(t.id, id)).returning().get()
    log(tx, 'delete', table, id, before, after)
    // Ödev silinince hatırlatması da gider.
    if (table === 'assignments') dropReminder(tx, (before as AssignmentRow).reminderId, now)
  })
}

export function restoreSchool(db: Db, { table, id }: SchoolRestoreInput, now = new Date()): void {
  const t = SOFT_TABLES[table]
  db.transaction((tx) => {
    const before = tx.select().from(t).where(eq(t.id, id)).get()
    if (!before?.deletedAt) return
    const groupId = ulid()
    const after = tx.update(t).set({ deletedAt: null, updatedAt: now }).where(eq(t.id, id)).returning().get()
    log(tx, 'restore', table, id, before, after, groupId)
    if (table === 'terms') {
      // Başka aktif dönem yoksa geri gelen dönem aktif olur.
      if (!activeTerm(tx)) tx.update(terms).set({ active: true }).where(eq(terms.id, id)).run()
      // Dönemle aynı anda çöpe giden dersler de döner.
      for (const c of tx
        .select()
        .from(courses)
        .where(and(eq(courses.termId, id), eq(courses.deletedAt, before.deletedAt)))
        .all()) {
        const a = tx
          .update(courses)
          .set({ deletedAt: null, updatedAt: now })
          .where(eq(courses.id, c.id))
          .returning()
          .get()
        log(tx, 'restore', 'courses', c.id, c, a, groupId)
      }
    }
    if (table === 'assignments') syncReminder(tx, after as AssignmentRow, now, groupId)
  })
}

export function addFlag(db: Db, noteId: string, excerpt: string, now = new Date()): { id: string } {
  return db.transaction((tx) => {
    const note = tx
      .select()
      .from(notes)
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
      .get()
    if (!note?.courseId || !note.weekId) throw new Error('İşaret sadece hafta notuna konur')
    const week = tx.select().from(courseWeeks).where(eq(courseWeeks.id, note.weekId)).get()
    if (!week) throw new Error('Hafta bulunamadı')
    const row = tx
      .insert(noteFlags)
      .values({
        id: ulid(),
        noteId,
        courseId: note.courseId,
        weekNo: week.weekNo,
        excerpt: excerpt.trim(),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'note_flags', row.id, undefined, row)
    return { id: row.id }
  })
}

export function setFlagResolved(db: Db, id: string, resolved: boolean, now = new Date()): void {
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(noteFlags)
      .where(and(eq(noteFlags.id, id), isNull(noteFlags.deletedAt)))
      .get()
    if (!before) throw new Error('İşaret bulunamadı')
    if (!!before.resolvedAt === resolved) return
    const after = tx
      .update(noteFlags)
      .set({ resolvedAt: resolved ? now : null, updatedAt: now })
      .where(eq(noteFlags.id, id))
      .returning()
      .get()
    log(tx, 'update', 'note_flags', id, before, after)
  })
}

export function addMaterial(
  db: Db,
  input: { courseId: string; weekNo: number | null; kind: MaterialKind; title: string },
  file: MediaRow,
  now = new Date(),
): { id: string } {
  return db.transaction((tx) => {
    liveCourse(tx, input.courseId)
    const row = tx
      .insert(courseMaterials)
      .values({
        id: ulid(),
        courseId: input.courseId,
        weekNo: input.weekNo,
        mediaId: file.id,
        kind: input.kind,
        title: input.title.trim() || file.originalName,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'course_materials', row.id, undefined, row)
    return { id: row.id }
  })
}

export function updateMaterial(
  db: Db,
  input: { id: string; title?: string; kind?: MaterialKind; weekNo?: number | null },
  now = new Date(),
): void {
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(courseMaterials)
      .where(and(eq(courseMaterials.id, input.id), isNull(courseMaterials.deletedAt)))
      .get()
    if (!before) throw new Error('Materyal bulunamadı')
    const after = tx
      .update(courseMaterials)
      .set({
        ...(input.title !== undefined && { title: input.title.trim() || before.title }),
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.weekNo !== undefined && { weekNo: input.weekNo }),
        updatedAt: now,
      })
      .where(eq(courseMaterials.id, input.id))
      .returning()
      .get()
    log(tx, 'update', 'course_materials', input.id, before, after)
  })
}

/** Materyalin `media/` içindeki dosya adı (açma ve PDF görüntüleme için). */
export function materialFile(db: Db, id: string): { fileName: string; mime: string } {
  const row = db
    .select({ fileName: media.fileName, mime: media.mime })
    .from(courseMaterials)
    .innerJoin(media, eq(media.id, courseMaterials.mediaId))
    .where(and(eq(courseMaterials.id, id), isNull(courseMaterials.deletedAt)))
    .get()
  if (!row) throw new Error('Materyal bulunamadı')
  return row
}

// ---------------------------------------------------------------- değerlendirme

export function saveComponent(
  db: Db,
  input: { id?: string; courseId: string; name: string; kind: ComponentRow['kind']; weight: number },
  now = new Date(),
): { id: string } {
  return db.transaction((tx) => {
    liveCourse(tx, input.courseId)
    const values = { name: input.name.trim(), kind: input.kind, weight: input.weight }
    if (input.id) {
      const before = tx
        .select()
        .from(gradeComponents)
        .where(and(eq(gradeComponents.id, input.id), isNull(gradeComponents.deletedAt)))
        .get()
      if (!before) throw new Error('Bileşen bulunamadı')
      const after = tx
        .update(gradeComponents)
        .set({ ...values, updatedAt: now })
        .where(eq(gradeComponents.id, input.id))
        .returning()
        .get()
      log(tx, 'update', 'grade_components', input.id, before, after)
      return { id: input.id }
    }
    const sort = componentsOf(tx, [input.courseId]).length
    const row = tx
      .insert(gradeComponents)
      .values({ id: ulid(), courseId: input.courseId, ...values, sort, createdAt: now, updatedAt: now })
      .returning()
      .get()
    log(tx, 'create', 'grade_components', row.id, undefined, row)
    return { id: row.id }
  })
}

export function setGrade(db: Db, componentId: string, score: number | null, now = new Date()): void {
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(gradeComponents)
      .where(and(eq(gradeComponents.id, componentId), isNull(gradeComponents.deletedAt)))
      .get()
    if (!before) throw new Error('Bileşen bulunamadı')
    if (before.score === score) return
    const after = tx
      .update(gradeComponents)
      .set({ score, scoredOn: score === null ? null : dayKey(now), updatedAt: now })
      .where(eq(gradeComponents.id, componentId))
      .returning()
      .get()
    log(tx, 'update', 'grade_components', componentId, before, after)
  })
}

// ---------------------------------------------------------------- sınav

export function saveExam(db: Db, input: ExamSaveInput, now = new Date()): { id: string } {
  return db.transaction((tx) => {
    liveCourse(tx, input.courseId)
    const groupId = ulid()
    const values = {
      title: input.title.trim(),
      day: input.day,
      startMin: input.startMin ?? null,
      place: (input.place ?? '').trim(),
      ...(input.componentId !== undefined && { componentId: input.componentId }),
      ...(input.reviewMd !== undefined && { reviewMd: input.reviewMd }),
      ...(input.weekFrom !== undefined && { weekFrom: input.weekFrom }),
      ...(input.weekTo !== undefined && { weekTo: input.weekTo }),
    }
    // Kapsam haftaları verildiyse konu listesi o haftaların konularıdır.
    let topicIdsIn = input.topicIds
    if (!topicIdsIn && input.weekFrom != null && input.weekTo != null) {
      const lo = Math.min(input.weekFrom, input.weekTo)
      const hi = Math.max(input.weekFrom, input.weekTo)
      topicIdsIn = tx
        .select()
        .from(topics)
        .where(and(eq(topics.courseId, input.courseId), isNull(topics.deletedAt)))
        .all()
        .filter((t) => t.weekNo !== null && t.weekNo >= lo && t.weekNo <= hi)
        .map((t) => t.id)
    }
    let id = input.id
    if (id) {
      const before = tx
        .select()
        .from(exams)
        .where(and(eq(exams.id, id), isNull(exams.deletedAt)))
        .get()
      if (!before) throw new Error('Sınav bulunamadı')
      const after = tx
        .update(exams)
        .set({ ...values, updatedAt: now })
        .where(eq(exams.id, id))
        .returning()
        .get()
      log(tx, 'update', 'exams', id, before, after, groupId)
    } else {
      const row = tx
        .insert(exams)
        .values({ id: ulid(), courseId: input.courseId, ...values, createdAt: now, updatedAt: now })
        .returning()
        .get()
      id = row.id
      log(tx, 'create', 'exams', id, undefined, row, groupId)
    }
    if (topicIdsIn) {
      const existing = tx.select().from(examTopics).where(eq(examTopics.examId, id)).all()
      const want = new Set(topicIdsIn)
      for (const e of existing)
        if (!want.has(e.topicId)) {
          tx.delete(examTopics)
            .where(and(eq(examTopics.examId, id), eq(examTopics.topicId, e.topicId)))
            .run()
          log(tx, 'delete', 'exam_topics', `${id}:${e.topicId}`, e, undefined, groupId)
        }
      const have = new Set(existing.map((e) => e.topicId))
      for (const topicId of want)
        if (!have.has(topicId)) {
          const row = tx
            .insert(examTopics)
            .values({ examId: id, topicId, createdAt: now, updatedAt: now })
            .returning()
            .get()
          log(tx, 'create', 'exam_topics', `${id}:${topicId}`, undefined, row, groupId)
        }
    }
    return { id }
  })
}

export function setExamTopic(db: Db, input: ExamTopicSetInput, now = new Date()): void {
  db.transaction((tx) => {
    const key = `${input.examId}:${input.topicId}`
    const before = tx
      .select()
      .from(examTopics)
      .where(and(eq(examTopics.examId, input.examId), eq(examTopics.topicId, input.topicId)))
      .get()
    if (input.included === false) {
      if (!before) return
      tx.delete(examTopics)
        .where(and(eq(examTopics.examId, input.examId), eq(examTopics.topicId, input.topicId)))
        .run()
      log(tx, 'delete', 'exam_topics', key, before)
      return
    }
    if (!before) {
      const row = tx
        .insert(examTopics)
        .values({
          examId: input.examId,
          topicId: input.topicId,
          level: input.level ?? 0,
          estimateMin: input.estimateMin ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      log(tx, 'create', 'exam_topics', key, undefined, row)
      return
    }
    const after = tx
      .update(examTopics)
      .set({
        ...(input.level !== undefined && { level: input.level }),
        ...(input.estimateMin !== undefined && { estimateMin: input.estimateMin }),
        updatedAt: now,
      })
      .where(and(eq(examTopics.examId, input.examId), eq(examTopics.topicId, input.topicId)))
      .returning()
      .get()
    log(tx, 'update', 'exam_topics', key, before, after)
  })
}

function liveExam(tx: Conn, id: string): ExamRow {
  const row = tx
    .select()
    .from(exams)
    .where(and(eq(exams.id, id), isNull(exams.deletedAt)))
    .get()
  if (!row) throw new Error('Sınav bulunamadı')
  return row
}

/** Sınava dahil konular (planın girdisi) ve yapılmış çalışma düşülmüş süreleri. */
function planTopics(tx: Conn, exam: ExamRow) {
  const rows = tx
    .select({ t: topics, et: examTopics })
    .from(examTopics)
    .innerJoin(topics, eq(topics.id, examTopics.topicId))
    .where(and(eq(examTopics.examId, exam.id), isNull(topics.deletedAt)))
    .all()
  const done = new Map<string, number>()
  for (const b of tx
    .select()
    .from(studyBlocks)
    .where(and(eq(studyBlocks.examId, exam.id), eq(studyBlocks.status, 'done')))
    .all())
    if (b.topicId) done.set(b.topicId, (done.get(b.topicId) ?? 0) + (b.endMin - b.startMin))
  return rows.map(({ t, et }) => {
    const base: StudyTopic = {
      id: t.id,
      level: Math.max(0, Math.min(3, et.level)) as Level,
      emphasized: t.emphasized,
      estimateMin: et.estimateMin,
      sort: (t.weekNo ?? 99) * 1000 + t.sort,
    }
    return { ...base, estimateMin: Math.max(0, topicMinutes(base) - (done.get(t.id) ?? 0)), name: t.name }
  })
}

/** Planın yerine geçecek bloklar: bu sınavın henüz başlamamış planlı blokları. */
function replaceable(tx: Conn, examId: string, now: Date): StudyRow[] {
  const today = dayKey(now)
  const nowMin = minuteOfDay(now)
  return tx
    .select()
    .from(studyBlocks)
    .where(and(eq(studyBlocks.examId, examId), eq(studyBlocks.status, 'planned'), gte(studyBlocks.day, today)))
    .all()
    .filter((b) => b.day > today || b.startMin > nowMin)
}

function computePlan(tx: Conn, examId: string, dailyMax: number, now: Date) {
  const exam = liveExam(tx, examId)
  const replace = replaceable(tx, examId, now)
  const topicList = planTopics(tx, exam)
  const { freeSlots, load } = freeUntil(tx, exam.day, now, new Set(replace.map((b) => b.id)))
  const plan = buildStudyPlan({
    examDay: exam.day,
    today: dayKey(now),
    topics: topicList,
    freeSlots,
    dailyMax,
    load,
  })
  const names = new Map(topicList.map((t) => [t.id, t.name]))
  return { exam, replace, plan, names }
}

export function previewPlan(db: Db, examId: string, dailyMax: number, now = new Date()): PlanPreview {
  const { replace, plan, names } = computePlan(db, examId, dailyMax, now)
  return {
    blocks: plan.blocks.map((b) => ({
      day: b.day,
      startMin: b.start,
      endMin: b.end,
      topicId: b.topicId,
      topicName: b.topicId ? (names.get(b.topicId) ?? 'Konu') : 'Genel tekrar',
    })),
    totalMin: plan.blocks.reduce((n, b) => n + b.end - b.start, 0),
    reviewMin: plan.reviewMin,
    unfitMin: plan.unfitMin,
    replaces: replace.length,
  }
}

/** "Planı onayla": başlamamış planlı bloklar silinir, yeni plan yazılır (tek grup, geri alınabilir). */
export function applyPlan(db: Db, examId: string, dailyMax: number, now = new Date()): { blocks: number } {
  return db.transaction((tx) => {
    const { exam, replace, plan } = computePlan(tx, examId, dailyMax, now)
    const groupId = ulid()
    for (const b of replace) {
      tx.delete(studyBlocks).where(eq(studyBlocks.id, b.id)).run()
      log(tx, 'delete', 'study_blocks', b.id, b, undefined, groupId)
    }
    insertBlocks(tx, examId, plan.blocks, now, groupId, 'taha')
    const after = tx
      .update(exams)
      .set({ unfitMin: plan.unfitMin, updatedAt: now })
      .where(eq(exams.id, examId))
      .returning()
      .get()
    log(tx, 'update', 'exams', examId, exam, after, groupId)
    return { blocks: plan.blocks.length }
  })
}

/** Planı kaldırır: başlamamış planlı bloklar silinir. */
export function clearPlan(db: Db, examId: string, now = new Date()): void {
  db.transaction((tx) => {
    const groupId = ulid()
    for (const b of replaceable(tx, examId, now)) {
      tx.delete(studyBlocks).where(eq(studyBlocks.id, b.id)).run()
      log(tx, 'delete', 'study_blocks', b.id, b, undefined, groupId)
    }
  })
}

export function getExamPrep(db: Db, examId: string, dailyMax: number, now = new Date()): ExamPrep | null {
  return db.transaction((tx) => {
    sweepMissedStudy(tx, now, dailyMax)
    const exam = tx
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), isNull(exams.deletedAt)))
      .get()
    if (!exam) return null
    const course = liveCourse(tx, exam.courseId)
    const term = liveTerm(tx, course.termId)
    const comps = componentsOf(tx, [course.id])
    const today = dayKey(now)
    const allTopics = tx
      .select()
      .from(topics)
      .where(and(eq(topics.courseId, course.id), isNull(topics.deletedAt)))
      .orderBy(asc(topics.weekNo), asc(topics.sort), asc(topics.createdAt))
      .all()
    const included = new Map(
      tx
        .select()
        .from(examTopics)
        .where(eq(examTopics.examId, examId))
        .all()
        .map((e) => [e.topicId, e]),
    )
    const flags = tx
      .select()
      .from(noteFlags)
      .where(and(eq(noteFlags.courseId, course.id), isNull(noteFlags.deletedAt), isNull(noteFlags.resolvedAt)))
      .all()
    const blocks = tx
      .select()
      .from(studyBlocks)
      .where(eq(studyBlocks.examId, examId))
      .orderBy(asc(studyBlocks.day), asc(studyBlocks.startMin))
      .all()
    const names = new Map(allTopics.map((t) => [t.id, t.name]))
    const planned = blocks.filter((b) => b.status !== 'missed').reduce((n, b) => n + b.endMin - b.startMin, 0)
    const done = blocks.filter((b) => b.status === 'done').reduce((n, b) => n + b.endMin - b.startMin, 0)
    const reviews = tx
      .select()
      .from(exams)
      .where(and(eq(exams.courseId, course.id), isNull(exams.deletedAt), ne(exams.id, examId)))
      .orderBy(asc(exams.day))
      .all()
      .filter((e) => e.day < exam.day && e.reviewMd.trim())
      .map((e) => ({ id: e.id, title: e.title, day: e.day, reviewMd: e.reviewMd }))

    return {
      exam: examsToSummaries(tx, [exam], comps)[0]!,
      courseId: course.id,
      courseName: course.name,
      tone: course.tone,
      daysLeft: daysUntil(today, exam.day),
      readOnly: !term.active,
      topics: allTopics.map((t) => {
        const et = included.get(t.id)
        const level = (et?.level ?? 0) as Level
        return {
          topicId: t.id,
          name: t.name,
          weekNo: t.weekNo,
          emphasized: t.emphasized,
          included: !!et,
          level,
          estimateMin: et?.estimateMin ?? null,
          minutes: topicMinutes({ level, emphasized: t.emphasized, estimateMin: et?.estimateMin ?? null }),
          openFlags: flags.filter((f) => f.weekNo === t.weekNo).map((f) => ({ id: f.id, excerpt: f.excerpt })),
        }
      }),
      blocks: blocks.map((b) => ({
        id: b.id,
        day: b.day,
        startMin: b.startMin,
        endMin: b.endMin,
        topicId: b.topicId,
        topicName: b.topicId ? (names.get(b.topicId) ?? 'Konu') : 'Genel tekrar',
        status: b.status,
      })),
      plannedMin: planned,
      doneMin: done,
      unfitMin: exam.unfitMin,
      dailyMaxMin: dailyMax,
      reviews,
    }
  })
}

// ---------------------------------------------------------------- ödev

function dropReminder(tx: DbTx, reminderId: string | null, now: Date, groupId?: string) {
  if (!reminderId) return
  const before = tx
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, reminderId), isNull(reminders.deletedAt)))
    .get()
  if (!before) return
  const after = tx
    .update(reminders)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(reminders.id, reminderId))
    .returning()
    .get()
  log(tx, 'delete', 'reminders', reminderId, before, after, groupId)
}

/**
 * Teslim edilmemiş ödevin hatırlatması son teslimden 48 saat önceye kurulur; o an geçmişse kurulmaz.
 * Teslim edilince ya da ödev silinince hatırlatma kalkar.
 */
function syncReminder(tx: DbTx, a: AssignmentRow, now: Date, groupId?: string) {
  const open = !a.deletedAt && (a.status === 'todo' || a.status === 'doing')
  const at = new Date(a.dueAt.getTime() - ASSIGNMENT_REMIND_MS)
  const want = open && at > now
  const current = a.reminderId
    ? tx
        .select()
        .from(reminders)
        .where(and(eq(reminders.id, a.reminderId), isNull(reminders.deletedAt)))
        .get()
    : undefined
  if (!want) {
    if (current) dropReminder(tx, current.id, now, groupId)
    return
  }
  const course = liveCourse(tx, a.courseId)
  const title = `${course.name}: ${a.title} · 2 gün kaldı`
  if (current) {
    if (current.at.getTime() === at.getTime() && current.title === title) return
    const after = tx
      .update(reminders)
      .set({ at, title, firedAt: null, missedAt: null, updatedAt: now })
      .where(eq(reminders.id, current.id))
      .returning()
      .get()
    log(tx, 'update', 'reminders', current.id, current, after, groupId)
    return
  }
  const row = tx
    .insert(reminders)
    .values({ id: ulid(), title, at, courseId: a.courseId, createdAt: now, updatedAt: now })
    .returning()
    .get()
  log(tx, 'create', 'reminders', row.id, undefined, row, groupId)
  tx.update(assignments).set({ reminderId: row.id }).where(eq(assignments.id, a.id)).run()
}

export function saveAssignment(db: Db, input: AssignmentSaveInput, now = new Date()): { id: string } {
  return db.transaction((tx) => {
    liveCourse(tx, input.courseId)
    const groupId = ulid()
    const values = {
      title: input.title.trim(),
      dueAt: new Date(input.dueAt),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.score !== undefined && { score: input.score }),
      ...(input.weekNo !== undefined && { weekNo: input.weekNo }),
    }
    let row: AssignmentRow
    if (input.id) {
      const before = tx
        .select()
        .from(assignments)
        .where(and(eq(assignments.id, input.id), isNull(assignments.deletedAt)))
        .get()
      if (!before) throw new Error('Ödev bulunamadı')
      const submitting =
        input.status !== undefined &&
        (input.status === 'submitted' || input.status === 'graded') &&
        !before.submittedAt
      row = tx
        .update(assignments)
        .set({
          ...values,
          // Puan girilen ödev notlandı sayılır.
          ...(input.score !== undefined && input.score !== null && input.status === undefined && { status: 'graded' }),
          ...(submitting && { submittedAt: now }),
          ...(input.status !== undefined &&
            (input.status === 'todo' || input.status === 'doing') && { submittedAt: null }),
          updatedAt: now,
        })
        .where(eq(assignments.id, input.id))
        .returning()
        .get()
      log(tx, 'update', 'assignments', row.id, before, row, groupId)
    } else {
      row = tx
        .insert(assignments)
        .values({ id: ulid(), courseId: input.courseId, ...values, createdAt: now, updatedAt: now })
        .returning()
        .get()
      log(tx, 'create', 'assignments', row.id, undefined, row, groupId)
    }
    syncReminder(tx, row, now, groupId)
    return { id: row.id }
  })
}

/** Başarılar karosu: bu hafta teslim edilen ödevler. */
export function submittedSince(db: Db, since: Date): number {
  return db
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(isNull(assignments.deletedAt), gte(assignments.submittedAt, since)))
    .all().length
}

// ---------------------------------------------------------------- GANO

export function gpaOverview(db: Db): GpaOverview {
  const termRows = db.select().from(terms).where(isNull(terms.deletedAt)).orderBy(asc(terms.startDate)).all()
  return {
    terms: termRows.map((t, order) => {
      const rows = termCourses(db, t.id)
      const comps = componentsOf(
        db,
        rows.map((r) => r.id),
      )
      return {
        id: t.id,
        name: t.name,
        active: t.active,
        order,
        courses: rows.map((c) => {
          const s = courseScore(c, comps)
          return {
            id: c.id,
            name: c.name,
            code: c.code,
            credit: c.credit,
            letter: s.letter,
            estimated: !s.letterManual,
            letterTable: [...letterTableOf(c)],
          }
        }),
      }
    }),
  }
}
