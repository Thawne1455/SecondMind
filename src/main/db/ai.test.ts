import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Operation } from '@shared/schemas/ai'
import {
  approveAll,
  approveProposal,
  failJob,
  finishJob,
  jobProposals,
  recoverStaleJobs,
  rejectProposal,
  startJob,
  undoProposal,
} from './ai'
import type { Db } from './client'
import { createDump } from './dump'
import { createNote, updateNote } from './knowledge'
import { createProject } from './projects'
import { setupSchool } from './school'
import * as schema from './schema'
import { UndoConflictError } from './undo'

let db: Db

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
})

const now = new Date(2026, 8, 30, 10, 0)
const dump = (text: string) => createDump(db, text, []).id
const dumpRow = (id: string) =>
  db.select().from(schema.dumpItems).where(eq(schema.dumpItems.id, id)).get()!
const log = () => db.select().from(schema.activityLog).all()

function job(
  ops: Operation[],
  dumpIds: string[],
  unprocessed: { dumpId: string; reason: string }[] = [],
) {
  const jobId = startJob(
    db,
    { kind: 'dump', model: 'fast', dumpIds, inputSummary: `${dumpIds.length} döküm` },
    now,
  )
  finishJob(db, jobId, { operations: ops, rejected: [], unprocessed }, null, now)
  return jobId
}

describe('iş yaşam döngüsü', () => {
  it('öneriye dönüşen döküm işlendi, gerekçeli olan atlandı', () => {
    const d1 = dump('yarın hocaya mail at')
    const d2 = dump('şu ne demekti')
    const jobId = job(
      [
        {
          op: 'create_reminder',
          sourceDumpIds: [d1],
          title: 'Hocaya mail at',
          at: '2026-10-01T09:00',
        },
      ],
      [d1, d2],
      [{ dumpId: d2, reason: 'Belirsiz' }],
    )
    expect(dumpRow(d1).status).toBe('processed')
    expect(dumpRow(d2)).toMatchObject({ status: 'skipped', skipReason: 'Belirsiz' })
    expect(jobProposals(db, jobId)).toHaveLength(1)
  })

  it('geçerli işlem yoksa iş başarısız, dökümler bekliyor; iptal de öyle', () => {
    const d1 = dump('a')
    const jobId = job([], [d1])
    expect(db.select().from(schema.aiJobs).get()!.status).toBe('failed')
    expect(dumpRow(d1).status).toBe('pending')
    const j2 = startJob(db, { kind: 'dump', model: 'deep', dumpIds: [d1], inputSummary: '' }, now)
    expect(dumpRow(d1).status).toBe('processing')
    failJob(db, j2, 'İptal edildi', 'cancelled', now)
    expect(dumpRow(d1).status).toBe('pending')
    expect(jobId).not.toBe(j2)
  })

  it('açılışta yarım kalan iş başarısız olur, döküm bekliyor’a döner', () => {
    const d1 = dump('a')
    const j = startJob(db, { kind: 'dump', model: 'deep', dumpIds: [d1], inputSummary: '' }, now)
    expect(recoverStaleJobs(db, now)).toBe(1)
    expect(db.select().from(schema.aiJobs).where(eq(schema.aiJobs.id, j)).get()!.status).toBe(
      'failed',
    )
    expect(dumpRow(d1).status).toBe('pending')
    expect(recoverStaleJobs(db, now)).toBe(0)
  })
})

describe('onay, düzenleme, geri alma', () => {
  it('görev önerisi AI adına tek grupla yazılır, geri alınınca çöpe gider', () => {
    const d1 = dump('Runika menü müziği uzun')
    const pid = createProject(
      db,
      { name: 'Runika', kind: 'unity', color: '#3be08f', folderPath: null },
      now,
    )
    const jobId = job(
      [
        {
          op: 'create_task',
          sourceDumpIds: [d1],
          title: 'Menü müziğini kırp',
          context: { projectId: pid },
          kind: 'bug',
        },
      ],
      [d1],
    )
    const [p] = jobProposals(db, jobId)
    approveProposal(db, p!.id, undefined, now)
    const task = db.select().from(schema.tasks).get()!
    expect(task).toMatchObject({
      title: 'Menü müziğini kırp',
      projectId: pid,
      kind: 'bug',
      kanbanStatus: 'todo',
    })
    const entries = log().filter((l) => l.targetTable === 'tasks')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ actor: 'ai', groupId: jobProposals(db, jobId)[0]!.groupId })

    undoProposal(db, p!.id, now)
    expect(db.select().from(schema.tasks).get()!.deletedAt).not.toBeNull()
    expect(jobProposals(db, jobId)[0]!.undoneAt).not.toBeNull()
    expect(() => undoProposal(db, p!.id, now)).toThrow()
  })

  it('not + fikir + sonraki adım; düzenlenerek onay; toplu onay hataları ayrı', () => {
    const d1 = dump('karışık')
    const pid = createProject(
      db,
      { name: 'Runika', kind: 'unity', color: '#3be08f', folderPath: null },
      now,
    )
    const jobId = job(
      [
        {
          op: 'create_note',
          sourceDumpIds: [d1],
          title: 'Rüya',
          bodyMd: 'Uçuyordum',
          collection: 'Günlük',
        },
        { op: 'create_idea', sourceDumpIds: [d1], title: 'Ritim oyunu', note: 'Davul' },
        { op: 'set_project_next_step', sourceDumpIds: [d1], projectId: pid, text: 'Boss dövüşü' },
        { op: 'add_instructor_note', sourceDumpIds: [d1], courseId: 'yok', text: 'x' },
      ],
      [d1],
    )
    const ps = jobProposals(db, jobId)
    approveProposal(
      db,
      ps[0]!.id,
      { title: 'Rüya günlüğü', bodyMd: 'Uçuyordum, sonra düştüm' },
      now,
    )
    const r = approveAll(db, jobId, now)
    expect(r.applied).toBe(2)
    expect(r.failed.map((f) => f.id)).toEqual([ps[3]!.id])
    expect(jobProposals(db, jobId).map((p) => p.status)).toEqual([
      'edited',
      'approved',
      'approved',
      'pending',
    ])

    const allNotes = db.select().from(schema.notes).all()
    const dream = allNotes.find((n) => n.title === 'Rüya günlüğü')!
    expect(dream.bodyMd).toBe('Uçuyordum, sonra düştüm')
    const coll = db.select().from(schema.collections).get()!
    expect([coll.name, dream.collectionId]).toEqual(['Günlük', coll.id])
    expect(db.select().from(schema.ideas).all()).toHaveLength(1)
    expect(db.select().from(schema.projects).get()!.nextStep).toBe('Boss dövüşü')

    // Sonraki adım geri alınır; not elle düzenlendiyse notun geri alınması reddedilir.
    undoProposal(db, ps[2]!.id, now)
    expect(db.select().from(schema.projects).get()!.nextStep).toBe('')
    updateNote(db, { id: dream.id, bodyMd: 'Taha değiştirdi' }, new Date(now.getTime() + 3_600_000))
    expect(() => undoProposal(db, ps[0]!.id, now)).toThrow(UndoConflictError)

    rejectProposal(db, ps[3]!.id, now)
    expect(() => rejectProposal(db, ps[3]!.id, now)).toThrow()
  })

  it('düzenleme türü ve kaynağı değiştiremez, geçersiz düzenleme reddedilir', () => {
    const d1 = dump('x')
    const jobId = job([{ op: 'create_idea', sourceDumpIds: [d1], title: 'A' }], [d1])
    const [p] = jobProposals(db, jobId)
    expect(() => approveProposal(db, p!.id, { title: '' }, now)).toThrow()
    approveProposal(db, p!.id, { op: 'create_task', sourceDumpIds: [], title: 'B' }, now)
    expect(JSON.parse(jobProposals(db, jobId)[0]!.payloadJson)).toMatchObject({
      op: 'create_idea',
      sourceDumpIds: [d1],
      title: 'B',
    })
  })
})

describe('okul, hatırlatma ve nota ekleme', () => {
  it('sınav, hoca notu, ders görevi, hatırlatma, nota ekleme; ekleme geri alınınca eski gövde', () => {
    setupSchool(
      db,
      {
        term: { name: '2026-2027 Güz', startDate: '2026-09-21', weekCount: 14 },
        courses: [{ name: 'Lineer Cebir', code: 'MAT205', instructorName: 'Ali Veli', slots: [] }],
      },
      now,
    )
    const course = db.select().from(schema.courses).get()!
    const note = createNote(db)
    updateNote(db, { id: note.id, title: 'Sorular', bodyMd: 'İlk satır\n' }, now)
    const d1 = dump('karışık')
    const jobId = job(
      [
        {
          op: 'create_exam',
          sourceDumpIds: [d1],
          courseId: course.id,
          title: 'Vize',
          date: '2026-11-02',
          time: '10:30',
        },
        {
          op: 'add_instructor_note',
          sourceDumpIds: [d1],
          courseId: course.id,
          text: 'Soru 4 sınavda çıkar',
        },
        {
          op: 'create_task',
          sourceDumpIds: [d1],
          title: '3. bölümü çalış',
          context: { courseId: course.id },
          kind: 'bug',
        },
        {
          op: 'create_reminder',
          sourceDumpIds: [d1],
          title: 'Hocaya mail',
          at: '2026-10-01T09:00',
        },
        { op: 'append_to_note', sourceDumpIds: [d1], noteId: note.id, appendMd: 'Soru 4 nedir?' },
      ],
      [d1],
    )
    expect(approveAll(db, jobId, now)).toEqual({ applied: 5, failed: [] })
    expect(db.select().from(schema.exams).get()).toMatchObject({
      title: 'Vize',
      day: '2026-11-02',
      startMin: 630,
    })
    expect(db.select().from(schema.instructorNotes).get()!.text).toBe('Soru 4 sınavda çıkar')
    // Proje dışı görevde tür yok sayılır
    expect(db.select().from(schema.tasks).get()).toMatchObject({
      courseId: course.id,
      kind: 'task',
      projectId: null,
    })
    expect(db.select().from(schema.reminders).get()!.at).toEqual(new Date(2026, 9, 1, 9, 0))
    const body = () =>
      db.select().from(schema.notes).where(eq(schema.notes.id, note.id)).get()!.bodyMd
    expect(body()).toBe('İlk satır\n\nSoru 4 nedir?')

    undoProposal(db, jobProposals(db, jobId)[4]!.id, now)
    expect(body()).toBe('İlk satır\n')
    undoProposal(db, jobProposals(db, jobId)[0]!.id, now)
    expect(db.select().from(schema.exams).get()!.deletedAt).not.toBeNull()
  })
})
