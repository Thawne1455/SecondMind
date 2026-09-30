import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import { listNotes } from './knowledge'
import { getTodaySchedule } from './schedule'
import {
  addFlag,
  applyPlan,
  attendanceQuestions,
  getBoard,
  getCourseDetail,
  getExamPrep,
  gpaOverview,
  previewPlan,
  restoreSchool,
  saveAssignment,
  saveCourse,
  saveExam,
  saveTopic,
  setAttendance,
  setExamTopic,
  setGrade,
  setStudyStatus,
  setupSchool,
  softDelete,
  weekNote,
} from './school'
import * as schema from './schema'

let db: Db

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
})

// 21 Eylül 2026 Pazartesi dönem başı; testler 5 Ekim (3. hafta, Pazartesi) civarında.
const at = (month: number, day: number, hour = 12, min = 0) => new Date(2026, month - 1, day, hour, min)
const log = () => db.select().from(schema.activityLog).all()

function setup() {
  const term = setupSchool(
    db,
    {
      term: { name: '2026-2027 Güz', startDate: '2026-09-21', weekCount: 14 },
      courses: [
        {
          name: 'Veri Yapıları',
          code: 'BIL201',
          credit: 6,
          instructorName: 'Ayşe Kaya',
          attendanceLimit: { kind: 'hours', value: 8 },
          slots: [{ weekday: 1, startMin: 540, endMin: 650, room: 'D-201' }],
          components: [
            { name: 'Vize', kind: 'midterm', weight: 30 },
            { name: 'Ödevler', kind: 'homework', weight: 20 },
            { name: 'Final', kind: 'final', weight: 50 },
          ],
        },
        { name: 'Lineer Cebir', code: 'MAT205', credit: 4, slots: [{ weekday: 3, startMin: 600, endMin: 720 }] },
      ],
    },
    at(9, 20),
  )
  const courses = db.select().from(schema.courses).all()
  const ds = courses.find((c) => c.code === 'BIL201')!
  const la = courses.find((c) => c.code === 'MAT205')!
  return { term, ds, la }
}

describe('kurulum', () => {
  it('dönem aktif, dersler tonlu, haftalar ve bileşenler açılır, hoca oluşur; tek grup', () => {
    const { term, ds, la } = setup()
    expect(term.active).toBe(true)
    expect(term.endDate).toBe('2026-12-27')
    expect(ds.tone).not.toBe(la.tone)
    expect(db.select().from(schema.courseWeeks).where(eq(schema.courseWeeks.courseId, ds.id)).all()).toHaveLength(14)
    expect(db.select().from(schema.instructors).all()).toHaveLength(1)
    expect(new Set(log().map((l) => l.groupId)).size).toBe(1)
  })

  it('aynı adlı hoca yeniden kullanılır', () => {
    const { term } = setup()
    saveCourse(db, { termId: term.id, name: 'Algoritmalar', instructorName: 'ayşe kaya' })
    expect(db.select().from(schema.instructors).all()).toHaveLength(1)
  })
})

describe('not ve pano', () => {
  it('ağırlıklı puan, harf tahmin edilmez, finalde gereken', () => {
    const { ds } = setup()
    const comps = db.select().from(schema.gradeComponents).all()
    setGrade(db, comps.find((c) => c.name === 'Vize')!.id, 70, at(10, 5))
    setGrade(db, comps.find((c) => c.name === 'Ödevler')!.id, 90, at(10, 5))
    const board = getBoard(db, 180, at(10, 5))
    const row = board.courses.find((c) => c.id === ds.id)!
    expect(row.score.current).toBe(78)
    expect(row.score.letter).toBeNull()
    expect(row.score.required).toEqual({ status: 'needs', min: 82, remaining: [comps.find((c) => c.name === 'Final')!.id] })
    expect(board.week).toBe(3)
    expect(board.termGpa).toBeNull()
  })

  it('haftalık program, yoklama ve devamsızlık', () => {
    const { ds } = setup()
    const slot = db.select().from(schema.courseSlots).where(eq(schema.courseSlots.courseId, ds.id)).get()!
    setAttendance(db, { slotId: slot.id, day: '2026-09-21', status: 'absent' })
    setAttendance(db, { slotId: slot.id, day: '2026-09-28', status: 'absent' })
    setAttendance(db, { slotId: slot.id, day: '2026-10-05', status: 'present' })
    expect(() => setAttendance(db, { slotId: slot.id, day: '2026-10-06', status: 'present' })).toThrow()
    const board = getBoard(db, 180, at(10, 6))
    expect(board.classes.map((c) => [c.day, c.name, c.attendance])).toEqual([
      ['2026-10-05', 'Veri Yapıları', 'present'],
      ['2026-10-07', 'Lineer Cebir', null],
    ])
    expect(board.courses.find((c) => c.id === ds.id)!.attendance).toMatchObject({ used: 4, limit: 8, remaining: 4, state: 'ok' })
    setAttendance(db, { slotId: slot.id, day: '2026-10-05', status: null })
    expect(db.select().from(schema.attendance).all()).toHaveLength(2)
  })

  it('Bugün / Yarın şeridi, sıradaki ders ve hafta kareleri', () => {
    const { ds, la } = setup()
    // Pazar 4 Ekim: yarın Pazartesi (gelecek hafta) Veri Yapıları
    let board = getBoard(db, 180, at(10, 4))
    expect(board.tomorrow).toBe('2026-10-05')
    expect(board.soonClasses.map((c) => [c.day, c.name])).toEqual([['2026-10-05', 'Veri Yapıları']])
    // Pazartesi 10:00: ders sürüyor; Lineer Cebir Çarşamba
    board = getBoard(db, 180, at(10, 5, 10))
    const row = (id: string) => board.courses.find((c) => c.id === id)!
    expect(row(ds.id).nextClass).toEqual({ day: '2026-10-05', startMin: 540, endMin: 650, room: 'D-201' })
    expect(row(la.id).nextClass?.day).toBe('2026-10-07')

    saveTopic(db, { courseId: ds.id, weekNo: 1, name: 'Diziler' })
    const { noteId } = weekNote(db, ds.id, 2)
    addFlag(db, noteId, 'Neden O(log n)?')
    saveAssignment(db, { courseId: ds.id, title: 'Yarın teslim', dueAt: at(10, 6, 9).getTime() }, at(10, 5))
    saveAssignment(db, { courseId: ds.id, title: 'Haftaya', dueAt: at(10, 12).getTime() }, at(10, 5))
    board = getBoard(db, 180, at(10, 5, 10))
    const weeks = row(ds.id).weeks
    expect(weeks).toHaveLength(14)
    expect(weeks[0]).toMatchObject({ weekNo: 1, filled: true, openFlags: 0 })
    expect(weeks[1]).toMatchObject({ weekNo: 2, openFlags: 1 })
    expect(weeks[2]).toMatchObject({ weekNo: 3, filled: false })
    expect(board.dueSoon.map((a) => a.title)).toEqual(['Yarın teslim'])
  })

  it('bitmiş ders "katıldın mı?" sorusu olur, işaretlenince kalkar', () => {
    const { ds } = setup()
    expect(attendanceQuestions(db, at(10, 5, 10))).toHaveLength(0)
    const q = attendanceQuestions(db, at(10, 5, 11))
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ courseId: ds.id, day: '2026-10-05', startMin: 540 })
    setAttendance(db, { slotId: q[0]!.slotId, day: q[0]!.day, status: 'present' })
    expect(attendanceQuestions(db, at(10, 5, 11))).toHaveLength(0)
  })

  it('GANO: elle harf; eksik notlu derste harf yok, hepsi girilince sonuç', () => {
    const { ds, la } = setup()
    saveCourse(db, { id: la.id, termId: la.termId, name: la.name, credit: 4, letter: 'AA' })
    const comps = db.select().from(schema.gradeComponents).all()
    setGrade(db, comps.find((c) => c.name === 'Vize')!.id, 85)
    const g = gpaOverview(db)
    const rows = g.terms[0]!.courses
    expect(rows.find((c) => c.id === ds.id)).toMatchObject({ letter: null })
    for (const c of comps.filter((x) => x.courseId === ds.id && x.name !== 'Vize')) setGrade(db, c.id, 85)
    expect(gpaOverview(db).terms[0]!.courses.find((c) => c.id === ds.id)).toMatchObject({ letter: 'BA' })
    expect(rows.find((c) => c.id === la.id)).toMatchObject({ letter: 'AA', estimated: false })
  })
})

describe('hafta defteri', () => {
  it('hafta notu bir kez oluşur, Bilgi listesinde görünmez; anlamadım işareti', () => {
    const { ds } = setup()
    const { noteId } = weekNote(db, ds.id, 3)
    expect(weekNote(db, ds.id, 3).noteId).toBe(noteId)
    expect(listNotes(db, {})).toHaveLength(0)
    addFlag(db, noteId, 'AVL döndürmeleri neden iki tane?')
    const d = getCourseDetail(db, ds.id, 180, at(10, 6))!
    expect(d.weeks[2]).toMatchObject({ weekNo: 3, noteId, openFlags: 1, start: '2026-10-05' })
    expect(d.flags[0]).toMatchObject({ weekNo: 3, resolved: false })
    expect(d.currentWeek).toBe(3)
    expect(d.nextExamDays).toBeNull()
  })
})

describe('sınav hazırlığı', () => {
  function examWithTopics() {
    const s = setup()
    const t1 = saveTopic(db, { courseId: s.ds.id, weekNo: 1, name: 'Diziler' }).id
    const t2 = saveTopic(db, { courseId: s.ds.id, weekNo: 2, name: 'Ağaçlar', emphasized: true }).id
    const exam = saveExam(db, { courseId: s.ds.id, title: 'Vize', day: '2026-10-09', weekFrom: 1, weekTo: 2 }).id
    setExamTopic(db, { examId: exam, topicId: t1, level: 3 })
    return { ...s, t1, t2, exam }
  }

  it('hazırlık yüzdesi ve plan önizleme; derse çakışmaz, son gün tekrar', () => {
    const { exam, t2 } = examWithTopics()
    const prep = getExamPrep(db, exam, 180, at(10, 5, 8))!
    expect(prep.daysLeft).toBe(4)
    expect(prep.exam.readiness).toBe(40) // (1 + 0·1,5) / 2,5
    expect(prep.topics.filter((t) => t.included)).toHaveLength(2)

    const preview = previewPlan(db, exam, 180, at(10, 5, 8))
    expect(preview.unfitMin).toBe(0)
    // Pazartesi 09:00–10:50 ders: o saatlere blok düşmez.
    for (const b of preview.blocks.filter((x) => x.day === '2026-10-05'))
      expect(b.endMin <= 530 || b.startMin >= 660).toBe(true)
    expect(preview.blocks.filter((b) => b.day === '2026-10-08').every((b) => b.topicId === null)).toBe(true)
    // Vurgulanan zor konu önce.
    expect(preview.blocks[0]!.topicId).toBe(t2)
  })

  it('onay yazar, Bugün bandına girer; kaçırılan blok ertesi gün yayılır', () => {
    const { exam } = examWithTopics()
    const { blocks } = applyPlan(db, exam, 180, at(10, 5, 8))
    expect(blocks).toBeGreaterThan(0)
    const today = getTodaySchedule(db, at(10, 5, 8))
    const study = today.blocks.filter((b) => b.kind === 'study')
    const klass = today.blocks.filter((b) => b.kind === 'class')
    expect(study.length).toBeGreaterThan(0)
    expect(klass).toHaveLength(1)
    expect(klass[0]).toMatchObject({ title: 'Veri Yapıları', detail: 'D-201' })

    // Bir blok yapıldı, diğerleri kaçırıldı: ertesi gün okununca kaçırılanlar dağıtılır.
    const first = db.select().from(schema.studyBlocks).where(eq(schema.studyBlocks.day, '2026-10-05')).all()
    setStudyStatus(db, first[0]!.id, 'done')
    const before = db.select().from(schema.studyBlocks).all().length
    getTodaySchedule(db, at(10, 6, 8))
    const rows = db.select().from(schema.studyBlocks).all()
    expect(rows.filter((r) => r.status === 'missed')).toHaveLength(first.length - 1)
    expect(rows.length).toBeGreaterThan(before)
    expect(rows.filter((r) => r.day === '2026-10-05' && r.status === 'planned')).toHaveLength(0)
    const sweep = log().filter((l) => l.actor === 'system' && l.targetTable === 'study_blocks')
    expect(new Set(sweep.map((l) => l.groupId)).size).toBe(1)

    // Yeniden onay: sadece başlamamış planlılar değişir, yapılan kalır.
    applyPlan(db, exam, 180, at(10, 6, 8))
    expect(db.select().from(schema.studyBlocks).where(eq(schema.studyBlocks.status, 'done')).all()).toHaveLength(1)
  })

  it('pano sınav şeridi: yüzde ve saatler', () => {
    const { exam } = examWithTopics()
    applyPlan(db, exam, 180, at(10, 5, 8))
    const card = getBoard(db, 180, at(10, 5, 8)).exams[0]!
    expect(card).toMatchObject({ id: exam, daysLeft: 4, readiness: 40, topicCount: 2, doneMin: 0 })
    expect(card.plannedMin).toBeGreaterThan(0)
  })

  it('yeni konu kapsamdaki haftaya eklenirse sınava girer', () => {
    const { ds, exam } = examWithTopics()
    saveTopic(db, { courseId: ds.id, weekNo: 2, name: 'Yığınlar' })
    saveTopic(db, { courseId: ds.id, weekNo: 5, name: 'Graflar' })
    const prep = getExamPrep(db, exam, 180, at(9, 30))!
    expect(prep.topics.filter((t) => t.included).map((t) => t.name)).toEqual(['Diziler', 'Ağaçlar', 'Yığınlar'])
  })
})

describe('ödev', () => {
  it('48 saat önce hatırlatma; teslimde kalkar, silinip geri gelince yeniden kurulur', () => {
    const { ds } = setup()
    const due = at(10, 10, 23, 59).getTime()
    const { id } = saveAssignment(db, { courseId: ds.id, title: 'Bağlı liste', dueAt: due }, at(10, 5))
    const reminder = () => db.select().from(schema.reminders).all().filter((r) => !r.deletedAt)
    expect(reminder()).toHaveLength(1)
    expect(reminder()[0]!.at.getTime()).toBe(due - 48 * 3600_000)
    saveAssignment(db, { id, courseId: ds.id, title: 'Bağlı liste', dueAt: due, status: 'submitted' }, at(10, 6))
    expect(reminder()).toHaveLength(0)
    saveAssignment(db, { id, courseId: ds.id, title: 'Bağlı liste', dueAt: due, status: 'todo' }, at(10, 6))
    expect(reminder()).toHaveLength(1)
    softDelete(db, 'assignments', id)
    expect(reminder()).toHaveLength(0)
    restoreSchool(db, { table: 'assignments', id }, at(10, 6))
    expect(reminder()).toHaveLength(1)
    // Pano "bu hafta teslim".
    expect(getBoard(db, 180, at(10, 6)).dueThisWeek).toHaveLength(1)
  })

  it('dönem silinince dersleri de gider, geri gelince döner', () => {
    const { term } = setup()
    softDelete(db, 'terms', term.id, at(10, 1))
    expect(getBoard(db, 180, at(10, 1)).term).toBeNull()
    restoreSchool(db, { table: 'terms', id: term.id }, at(10, 1))
    // Başka aktif dönem yoksa yeniden aktif olur; dersler döner.
    expect(getBoard(db, 180, at(10, 1)).term?.id).toBe(term.id)
    expect(db.select().from(schema.courses).all().every((c) => c.deletedAt === null)).toBe(true)
  })
})
