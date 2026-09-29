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
import { listMilestones, projectNextSteps } from './roadmap'
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
