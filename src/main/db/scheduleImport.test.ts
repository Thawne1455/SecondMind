import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { operationSchema, type Operation } from '@shared/schemas/ai'
import {
  approveAll,
  approveProposal,
  finishJob,
  jobProposals,
  rejectProposal,
  startJob,
  undoProposal,
} from './ai'
import type { Db } from './client'
import { createDump } from './dump'
import type { SchedulePreview } from '@shared/ipc'
import { inbox, pendingProposalCount } from './inbox'
import { setupSchool } from './school'
import * as schema from './schema'

// Ders programı önerileri (4e-2): dönem ve ders önerilerinin onayı, birlikte uygulanması, geri alınması, önizleme.

let db: Db

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
})

const now = new Date(2026, 9, 3, 10, 0)

function job(raw: unknown[]): { jobId: string; ids: string[] } {
  const d = createDump(db, 'Ders programı', []).id
  const ops = raw.map((o) =>
    operationSchema.parse({ sourceDumpIds: [d], ...(o as object) }),
  ) as Operation[]
  const jobId = startJob(
    db,
    { kind: 'schedule_import', model: 'deep', dumpIds: [d], inputSummary: '1 döküm' },
    now,
  )
  finishJob(db, jobId, { operations: ops, rejected: [], unprocessed: [] }, null, now)
  return { jobId, ids: jobProposals(db, jobId).map((p) => p.id) }
}

const liveTerms = () => db.select().from(schema.terms).where(isNull(schema.terms.deletedAt)).all()
const liveCourses = () =>
  db.select().from(schema.courses).where(isNull(schema.courses.deletedAt)).all()
const slotsOf = (courseId: string) =>
  db
    .select()
    .from(schema.courseSlots)
    .where(eq(schema.courseSlots.courseId, courseId))
    .all()
    .map((s) => `${s.weekday} ${s.startMin}-${s.endMin} ${s.room}`)
    .sort()
const status = (id: string) =>
  db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).get()!

const bahar = { op: 'import_term', name: '2026-2027 Bahar', startDate: '2027-02-15', weekCount: 14 }
const veri = {
  op: 'import_course',
  name: 'Veri Yapıları',
  code: 'BLM201',
  instructor: 'Dr. Ayşe Kaya',
  instructorEmail: 'ayse@uni.edu.tr',
  slots: [
    { weekday: 1, start: '09:00', end: '10:50', room: 'D-201' },
    { weekday: 3, start: '13:00', end: '14:50', room: 'D-201' },
  ],
}
const lineer = {
  op: 'import_course',
  name: 'Lineer Cebir',
  slots: [{ weekday: 2, start: '10:00', end: '11:50', room: 'B-105' }],
}

function guz() {
  setupSchool(
    db,
    {
      term: { name: '2026-2027 Güz', startDate: '2026-09-21', weekCount: 14 },
      courses: [
        {
          name: 'Veri Yapıları',
          code: 'BLM 201',
          slots: [{ weekday: 1, startMin: 540, endMin: 650, room: 'D-201' }],
        },
      ],
    },
    now,
  )
}

describe('yeni dönem', () => {
  it('ders onaylanınca dönem de onunla oluşur ve aktif olur; geri alınca ikisi birlikte', () => {
    guz()
    const { ids } = job([bahar, veri])
    const [termId, courseId] = ids as [string, string]
    approveProposal(db, courseId, undefined, now)

    expect(status(termId).status).toBe('approved')
    expect(status(termId).groupId).toBe(status(courseId).groupId)
    const term = liveTerms().find((t) => t.name === '2026-2027 Bahar')!
    expect(term.active).toBe(true)
    expect(liveTerms().find((t) => t.name === '2026-2027 Güz')!.active).toBe(false)
    const course = liveCourses().find((c) => c.termId === term.id)!
    expect(course.room).toBe('D-201')
    expect(slotsOf(course.id)).toEqual(['1 540-650 D-201', '3 780-890 D-201'])
    const inst = db
      .select()
      .from(schema.instructors)
      .where(eq(schema.instructors.id, course.instructorId!))
      .get()!
    expect(inst).toMatchObject({ name: 'Dr. Ayşe Kaya', email: 'ayse@uni.edu.tr' })

    undoProposal(db, courseId, now)
    expect(status(termId).undoneAt).not.toBeNull()
    expect(liveTerms().map((t) => t.name)).toEqual(['2026-2027 Güz'])
    expect(liveTerms()[0]!.active).toBe(true)
  })

  it('Programı onayla: dönem önce, her ders kendi grubunda; ilk ders dönemi geri alamaz, son ders alabilir', () => {
    const { jobId, ids } = job([veri, lineer, bahar])
    const result = approveAll(db, jobId, now)
    expect(result).toEqual({ applied: 3, failed: [] })
    const term = liveTerms()[0]!
    expect(term.name).toBe('2026-2027 Bahar')
    expect(liveCourses().filter((c) => c.termId === term.id)).toHaveLength(2)
    const termProposalId = ids[2]!
    // Dönemi geri almak, sonra eklenen dersleri dönemsiz bırakırdı.
    expect(() => undoProposal(db, termProposalId, now)).toThrow(/önce onları geri al/)
    undoProposal(db, ids[0]!, now)
    undoProposal(db, ids[1]!, now)
    undoProposal(db, termProposalId, now)
    expect(liveTerms()).toHaveLength(0)
  })

  it('başlangıç tarihi olmayan yeni dönem onaylanamaz', () => {
    const { ids } = job([{ op: 'import_term', name: '2026-2027 Bahar' }, lineer])
    expect(() => approveProposal(db, ids[1]!, undefined, now)).toThrow(/başlangıç tarihi/)
    expect(status(ids[0]!).status).toBe('pending')
    expect(liveTerms()).toHaveLength(0)
    approveProposal(db, ids[0]!, { startDate: '2027-02-15' }, now)
    expect(liveTerms()[0]!.startDate).toBe('2027-02-15')
  })

  it('dönem reddedilirse dersler aktif döneme', () => {
    guz()
    const { ids } = job([bahar, lineer])
    rejectProposal(db, ids[0]!, now)
    approveProposal(db, ids[1]!, undefined, now)
    const guzId = liveTerms()[0]!.id
    expect(liveCourses().find((c) => c.name === 'Lineer Cebir')!.termId).toBe(guzId)
  })
})

describe('var olan dönem', () => {
  it('aynı ders güncellenir (saat kimliği korunur), geri alınca eski saatler döner', () => {
    guz()
    const before = liveCourses()[0]!
    const oldSlot = db.select().from(schema.courseSlots).get()!
    const { ids } = job([
      { op: 'import_term', name: '2026-2027 GÜZ' },
      { ...veri, code: 'blm-201' },
    ])
    approveProposal(db, ids[1]!, undefined, now)

    expect(liveCourses()).toHaveLength(1)
    expect(liveTerms()).toHaveLength(1)
    expect(slotsOf(before.id)).toEqual(['1 540-650 D-201', '3 780-890 D-201'])
    expect(
      db.select().from(schema.courseSlots).where(eq(schema.courseSlots.id, oldSlot.id)).get(),
    ).toBeTruthy()
    // Bekleyen ders kalmayınca var olan döneme işaret eden dönem önerisi kendiliğinden kapanır.
    expect(status(ids[0]!).status).toBe('approved')

    undoProposal(db, ids[1]!, now)
    expect(slotsOf(before.id)).toEqual(['1 540-650 D-201'])
    expect(liveCourses()[0]!.instructorId).toBeNull()
  })

  it('kaldırılan saat geri almada geri yazılır', () => {
    guz()
    const course = liveCourses()[0]!
    const { ids } = job([
      { ...veri, slots: [{ weekday: 4, start: '15:00', end: '16:50', room: null }] },
    ])
    approveProposal(db, ids[0]!, undefined, now)
    expect(slotsOf(course.id)).toEqual(['4 900-1010 '])
    undoProposal(db, ids[0]!, now)
    expect(slotsOf(course.id)).toEqual(['1 540-650 D-201'])
  })

  it('saatsiz gelen mevcut dersin saatleri silinmez', () => {
    guz()
    const course = liveCourses()[0]!
    const { ids } = job([{ op: 'import_course', name: 'veri yapıları', credit: 6, slots: [] }])
    approveProposal(db, ids[0]!, undefined, now)
    expect(slotsOf(course.id)).toEqual(['1 540-650 D-201'])
    expect(liveCourses()[0]!.credit).toBe(6)
    expect(liveCourses()[0]!.name).toBe('Veri Yapıları')
  })

  it('dönem yoksa ders onaylanamaz', () => {
    const { ids } = job([lineer])
    expect(() => approveProposal(db, ids[0]!, undefined, now)).toThrow(/Aktif dönem yok/)
  })

  it('rozet var olan döneme işaret eden dönem önerisini saymaz', () => {
    guz()
    job([{ op: 'import_term', name: '2026-2027 Güz' }, lineer, bahar])
    expect(pendingProposalCount(db)).toBe(2)
  })

  it('bütün dersler reddedilince var olan döneme işaret eden öneri de kapanır', () => {
    guz()
    const { jobId, ids } = job([{ op: 'import_term', name: '2026-2027 Güz' }, lineer])
    rejectProposal(db, ids[1]!, now)
    expect(status(ids[0]!).status).toBe('approved')
    expect(inbox(db).groups.find((g) => g.jobId === jobId)).toBeUndefined()
  })
})

describe('önizleme', () => {
  it('yeni dönem: bütün dersler yeni, tonlar farklı', () => {
    guz()
    job([bahar, veri, lineer])
    const s = inbox(db).groups[0]!.schedule!
    expect(s.term).toMatchObject({ mode: 'new', name: '2026-2027 Bahar', startDate: '2027-02-15' })
    expect(s.courses.map((c) => c.update)).toEqual([false, false])
    expect(new Set(s.courses.map((c) => c.tone)).size).toBe(2)
  })

  it('var olan dönem: eşleşen ders güncelleme, eski saatler ve değişiklikler', () => {
    guz()
    const tone = liveCourses()[0]!.tone
    job([veri, lineer])
    const s = inbox(db).groups[0]!.schedule!
    expect(s.term).toMatchObject({
      mode: 'existing',
      name: '2026-2027 Güz',
      active: true,
      proposalId: null,
    })
    const [v, l] = s.courses as [(typeof s.courses)[0], (typeof s.courses)[0]]
    expect(v).toMatchObject({ update: true, tone })
    // Pzt 09:00 yerinde kaldı, Çar eklendi: kayan eski saat yok.
    expect(v.oldSlots).toEqual([])
    expect(v.changes.map((c) => c.label)).toEqual(['Hoca', 'Saat'])
    expect(l).toMatchObject({ update: false, changes: [], oldSlots: [] })
    expect(l.tone).not.toBe(tone)
  })

  it('saati kayan ders eski yerini gösterir; sadece derslik değişince "Derslik"', () => {
    setupSchool(
      db,
      {
        term: { name: '2026-2027 Güz', startDate: '2026-09-21', weekCount: 14 },
        courses: [
          {
            name: 'Olasılık',
            room: 'A-12',
            slots: [{ weekday: 4, startMin: 840, endMin: 950, room: '' }],
          },
          { name: 'Fizik', slots: [{ weekday: 2, startMin: 600, endMin: 710, room: '' }] },
        ],
      },
      now,
    )
    job([
      {
        op: 'import_course',
        name: 'Olasılık',
        slots: [{ weekday: 4, start: '13:00', end: '14:50', room: 'A-12' }],
      },
      {
        op: 'import_course',
        name: 'Fizik',
        slots: [{ weekday: 2, start: '10:00', end: '11:50', room: 'B-1' }],
      },
    ])
    const [o, f] = inbox(db).groups[0]!.schedule!.courses as [
      SchedulePreview['courses'][0],
      SchedulePreview['courses'][0],
    ]
    expect(o.oldSlots).toEqual([{ weekday: 4, startMin: 840, endMin: 950, room: 'A-12' }])
    expect(o.changes).toEqual([
      { label: 'Saat', before: 'Per 14:00-15:50 A-12', after: 'Per 13:00-14:50 A-12' },
    ])
    expect(f.oldSlots).toEqual([])
    expect(f.changes).toEqual([{ label: 'Derslik', before: '—', after: 'B-1' }])
  })

  it('dersin genel dersliği saatin dersliği sayılır: değişiklik yok', () => {
    guz()
    db.update(schema.courseSlots).set({ room: '' }).run()
    db.update(schema.courses).set({ room: 'D-201' }).run()
    job([
      {
        op: 'import_course',
        name: 'Veri Yapıları',
        slots: [{ weekday: 1, start: '09:00', end: '10:50', room: 'D-201' }],
      },
    ])
    expect(inbox(db).groups[0]!.schedule!.courses[0]!.changes).toEqual([])
  })

  it('dönem yok', () => {
    job([lineer])
    expect(inbox(db).groups[0]!.schedule!.term.mode).toBe('none')
  })

  it('onaylanan yeni dönem "yeni" kalır', () => {
    const { ids } = job([bahar, veri, lineer])
    approveProposal(db, ids[1]!, undefined, now)
    const s = inbox(db).groups[0]!.schedule!
    expect(s.term.mode).toBe('new')
    // Uygulanan ders kendisiyle eşleşir ama güncelleme sayılmaz.
    expect(s.courses[0]).toMatchObject({ update: false, changes: [] })
  })

  it('ders programı olmayan işte önizleme yok', () => {
    const d = createDump(db, 'x', []).id
    const jobId = startJob(db, { kind: 'dump', model: 'fast', dumpIds: [d], inputSummary: '' }, now)
    finishJob(
      db,
      jobId,
      {
        operations: [{ op: 'create_idea', sourceDumpIds: [d], title: 'Fikir' }],
        rejected: [],
        unprocessed: [],
      },
      null,
      now,
    )
    expect(inbox(db).groups[0]!.schedule).toBeNull()
  })
})

describe('günlük', () => {
  it('ders ve onunla oluşan dönem AI grubunda', () => {
    const { ids } = job([bahar, lineer])
    approveProposal(db, ids[1]!, undefined, now)
    const group = status(ids[1]!).groupId!
    const rows = db
      .select()
      .from(schema.activityLog)
      .where(and(eq(schema.activityLog.groupId, group), eq(schema.activityLog.actor, 'ai')))
      .all()
    expect(rows.map((r) => r.targetTable)).toEqual(
      expect.arrayContaining(['terms', 'courses', 'course_slots']),
    )
  })
})
