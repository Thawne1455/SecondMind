import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import { createTask, listProjectTasks, setTaskDone, updateTask } from './planning'
import { addParking, createProject, resolveParking, updateProject } from './projects'
import {
  applyMilestoneTemplate,
  createMilestone,
  deleteMilestone,
  listMilestones,
  milestoneScopes,
  projectCalendar,
  projectNextSteps,
  restoreMilestone,
  updateMilestone,
} from './roadmap'
import * as schema from './schema'

let db: Db
let id: string

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour)

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
  id = createProject(
    db,
    { name: 'Runika', kind: 'unity', color: '#3BE08F', folderPath: null },
    at(1),
  )
})

describe('proje görevleri (5c)', () => {
  it('projeli görev kanbanda Yapılacak doğar, bitince Bitti olur', () => {
    const t = createTask(db, { title: 'Ölüm paneli', projectId: id }, at(2))
    const row = () =>
      db
        .select()
        .from(schema.tasks)
        .all()
        .find((r) => r.id === t.id)!
    expect(row().kanbanStatus).toBe('todo')
    setTaskDone(db, t.id, true, at(3))
    expect(row().kanbanStatus).toBe('done')
    setTaskDone(db, t.id, false, at(3))
    expect(row().kanbanStatus).toBe('todo')
  })

  it('proje dışı görevin kanban kolonu yok', () => {
    const t = createTask(db, { title: 'Market' }, at(2))
    setTaskDone(db, t.id, true, at(3))
    expect(db.select().from(schema.tasks).get()!.kanbanStatus).toBeNull()
  })

  it('park öğesinden çevrilen görevin kaynağı park', () => {
    const item = addParking(db, { projectId: id, text: 'Ses ayarı', source: 'app' }, at(2))
    resolveParking(db, item.id, 'convert', at(3))
    const task = db.select().from(schema.tasks).get()!
    expect(task).toMatchObject({ source: 'park', sourceId: item.id, kanbanStatus: 'todo' })
  })
})

describe('projectNextSteps', () => {
  it('görev yoksa ve adım yazılmadıysa boş', () => {
    expect(projectNextSteps(db, id, at(5))).toEqual([])
  })

  it('kritik hata öne geçer, yazılan adım göreve eşleşir', () => {
    const a = createTask(db, { title: 'Menü müziği', projectId: id }, at(2))
    const b = createTask(db, { title: 'Ölüm panelinde takılma', projectId: id }, at(2))
    db.update(schema.tasks)
      .set({ kind: 'bug', severity: 'critical' })
      .where(eq(schema.tasks.id, b.id))
      .run()
    updateProject(db, { id, nextStep: 'Menü müziği' }, at(3))
    const steps = projectNextSteps(db, id, at(5))
    expect(steps.map((s) => s.taskId)).toEqual([b.id, a.id])
    expect(steps[0]!.reason).toContain('kritik hata')
    expect(steps[1]!.reason).toContain('son oturumda buradan devam edecektin')
  })

  it('playtest kümesini bildiren kişiler sayılır', () => {
    const t = createTask(db, { title: 'Zıplama gecikmesi', projectId: id }, at(2))
    const cluster = ulid()
    db.insert(schema.playtestClusters).values({ id: cluster, projectId: id, taskId: t.id }).run()
    for (const tester of ['Ali', 'Ayşe', 'Ali']) {
      const fb = ulid()
      db.insert(schema.playtestFeedback)
        .values({
          id: fb,
          projectId: id,
          tester,
          receivedOn: '2026-09-04',
          rawText: 'geç zıplıyor',
        })
        .run()
      db.insert(schema.playtestPoints)
        .values({
          id: ulid(),
          feedbackId: fb,
          text: 'geç zıplıyor',
          stems: 'geç zıpla',
          clusterId: cluster,
        })
        .run()
    }
    expect(projectNextSteps(db, id, at(5))[0]!.reason).toContain('2 test eden bildirdi')
  })
})

describe('kanban güncellemesi', () => {
  const row = (tid: string) => db.select().from(schema.tasks).where(eq(schema.tasks.id, tid)).get()!

  it('Bitti kolonu görevi bitirir, geri alınca açılır', () => {
    const t = createTask(db, { title: 'Ses', projectId: id }, at(2))
    updateTask(db, { id: t.id, kanbanStatus: 'testing' }, at(3))
    expect(row(t.id)).toMatchObject({ status: 'open', kanbanStatus: 'testing' })
    updateTask(db, { id: t.id, kanbanStatus: 'done' }, at(4))
    expect(row(t.id)).toMatchObject({ status: 'done', kanbanStatus: 'done' })
    expect(row(t.id).completedAt).toEqual(at(4))
    updateTask(db, { id: t.id, kanbanStatus: 'doing' }, at(5))
    expect(row(t.id)).toMatchObject({ status: 'open', kanbanStatus: 'doing', completedAt: null })
  })

  it('proje dışı görev kolon almaz', () => {
    const t = createTask(db, { title: 'Market' }, at(2))
    updateTask(db, { id: t.id, kanbanStatus: 'done' }, at(3))
    expect(row(t.id)).toMatchObject({ status: 'open', kanbanStatus: null })
  })

  it('taşa bağlanınca an yazılır; hata değilse önem silinir', () => {
    const t = createTask(
      db,
      { title: 'Çökme', projectId: id, kind: 'bug', severity: 'critical' },
      at(2),
    )
    expect(row(t.id).severity).toBe('critical')
    updateTask(db, { id: t.id, milestoneId: 'm1' }, at(3))
    expect(row(t.id).milestoneSetAt).toEqual(at(3))
    updateTask(db, { id: t.id, title: 'Çökme!' }, at(4))
    expect(row(t.id).milestoneSetAt).toEqual(at(3))
    updateTask(db, { id: t.id, kind: 'task' }, at(5))
    expect(row(t.id).severity).toBeNull()
    updateTask(db, { id: t.id, milestoneId: null }, at(6))
    expect(row(t.id).milestoneSetAt).toBeNull()
  })

  it('proje listesi: açıklar önce, bitenler sonra', () => {
    const a = createTask(db, { title: 'A', projectId: id }, at(2))
    const b = createTask(db, { title: 'B', projectId: id }, at(2))
    createTask(db, { title: 'Başka' }, at(2))
    setTaskDone(db, a.id, true, at(3))
    expect(listProjectTasks(db, id, at(4)).map((t) => t.id)).toEqual([b.id, a.id])
  })
})

describe('listMilestones', () => {
  it('göreve bağlı kriter görev bitince işaretli', () => {
    const t = createTask(db, { title: 'Menü', projectId: id }, at(2))
    db.insert(schema.milestones)
      .values({
        id: 'm1',
        projectId: id,
        title: 'Demo',
        criteriaJson: JSON.stringify([
          { id: 'c1', text: 'Menü bitti', done: false, taskId: t.id },
          { id: 'c2', text: 'Fragman', done: false, taskId: null },
        ]),
      })
      .run()
    setTaskDone(db, t.id, true, at(3))
    expect(listMilestones(db, id)[0]!.criteria.map((c) => c.done)).toEqual([true, false])
  })
})

describe('taş yazımları', () => {
  it('oluştur, sona eklenir; güncelle; tamamla ve yeniden aç', () => {
    const a = createMilestone(db, { projectId: id, title: ' Demo ' }, at(2))
    const b = createMilestone(db, { projectId: id, title: 'Beta', targetDate: '2026-11-01' }, at(2))
    expect([a.sort, b.sort]).toEqual([0, 1])
    expect(a.title).toBe('Demo')
    const u = updateMilestone(db, { id: a.id, targetDate: '2026-10-20', done: true }, at(3))
    expect(u).toMatchObject({ targetDate: '2026-10-20', doneAt: at(3).getTime() })
    expect(updateMilestone(db, { id: a.id, done: true }, at(4)).doneAt).toBe(at(3).getTime())
    expect(updateMilestone(db, { id: a.id, done: false }, at(5)).doneAt).toBeNull()
  })

  it('kriterler: yeni olana id verilir, bağlı kriterin done değeri görevden okunur', () => {
    const t = createTask(db, { title: 'Fragman', projectId: id }, at(2))
    const m = createMilestone(db, { projectId: id, title: 'Demo' }, at(2))
    const u = updateMilestone(
      db,
      {
        id: m.id,
        criteria: [
          { text: 'Fragman hazır', done: true, taskId: t.id },
          { text: 'Sayfa', done: true, taskId: null },
        ],
      },
      at(3),
    )
    expect(u.criteria.every((c) => c.id.length > 0)).toBe(true)
    expect(u.criteria.map((c) => c.done)).toEqual([false, true])
    setTaskDone(db, t.id, true, at(4))
    expect(listMilestones(db, id)[0]!.criteria[0]!.done).toBe(true)
    setTaskDone(db, t.id, false, at(5))
    expect(listMilestones(db, id)[0]!.criteria[0]!.done).toBe(false)
  })

  it('sil ve geri al', () => {
    const m = createMilestone(db, { projectId: id, title: 'Demo' }, at(2))
    deleteMilestone(db, m.id, at(3))
    expect(listMilestones(db, id)).toEqual([])
    restoreMilestone(db, m.id, at(4))
    expect(listMilestones(db, id).map((x) => x.id)).toEqual([m.id])
  })

  it('şablon: 6 taş, platform projeye yazılır, taş varken reddedilir', () => {
    const list = applyMilestoneTemplate(db, id, 'itch', at(2))
    expect(list.map((m) => m.title)[2]).toBe('Mağaza sayfası')
    expect(list[2]!.criteria.map((c) => c.text)).toContain('WebGL yapısı yüklendi')
    expect(db.select().from(schema.projects).get()!.releasePlatform).toBe('itch')
    expect(() => applyMilestoneTemplate(db, id, 'steam', at(3))).toThrow()
  })

  it('park öğesi taşa görev olur', () => {
    const m = createMilestone(db, { projectId: id, title: 'Demo' }, at(2))
    const item = addParking(db, { projectId: id, text: 'Ses', source: 'app' }, at(2))
    resolveParking(db, item.id, 'convert', at(3), m.id)
    expect(db.select().from(schema.tasks).get()).toMatchObject({
      milestoneId: m.id,
      milestoneSetAt: at(3),
    })
  })
})

describe('milestoneScopes', () => {
  it('eklenen, biten ve tahmin; tamamlanmış taş yok', () => {
    const m = createMilestone(db, { projectId: id, title: 'Demo', targetDate: '2026-09-20' }, at(1))
    const done = createMilestone(db, { projectId: id, title: 'Eski' }, at(1))
    updateMilestone(db, { id: done.id, done: true }, at(1))
    for (const title of ['A', 'B', 'C'])
      createTask(db, { title, projectId: id, milestoneId: m.id, estimateMin: 60 }, at(10))
    const first = db.select().from(schema.tasks).get()!
    setTaskDone(db, first.id, true, at(12))
    const [s, ...rest] = milestoneScopes(db, id, at(14))
    expect(rest).toEqual([])
    expect(s).toMatchObject({
      milestoneId: m.id,
      openTasks: 2,
      doneTasks: 1,
      trend: { added: 3, done: 1, state: 'balanced' },
    })
    // Oturum yok: hız 0, tarih yok; net akış negatif → bu hızla bitmiyor, hedef var → geç.
    expect(s!.finish).toMatchObject({ remainingMin: 180, finishOn: null, late: true })
  })
})

describe('projectCalendar', () => {
  it('aralıktaki taş hedefleri ve son tarihli görevler, güne göre', () => {
    createMilestone(db, { projectId: id, title: 'Demo', targetDate: '2026-10-05' }, at(2))
    createMilestone(db, { projectId: id, title: 'Uzak', targetDate: '2026-12-05' }, at(2))
    createTask(db, { title: 'Fragman', projectId: id, dueDate: '2026-10-05' }, at(2))
    createTask(db, { title: 'Başka', dueDate: '2026-10-05' }, at(2))
    const list = projectCalendar(db, id, '2026-10-01', '2026-10-31')
    expect(list.map((e) => [e.kind, e.title])).toEqual([
      ['milestone', 'Demo'],
      ['due', 'Fragman'],
    ])
  })
})
