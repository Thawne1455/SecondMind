import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Operation } from '@shared/schemas/ai'
import { approveProposal, finishJob, rejectProposal, startJob } from './ai'
import type { Db } from './client'
import { createDump } from './dump'
import { activityList, inbox, pendingProposalCount, undoActivity } from './inbox'
import { createNote, updateNote } from './knowledge'
import { createProject, updateProject } from './projects'
import * as schema from './schema'

let db: Db

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
})

const now = new Date(2026, 8, 30, 10, 0)

function job(ops: Operation[], dumpIds: string[], at = now) {
  const jobId = startJob(db, { kind: 'dump', model: 'fast', dumpIds, inputSummary: '' }, at)
  finishJob(db, jobId, { operations: ops, rejected: [], unprocessed: [] }, null, at)
  return jobId
}

describe('Onay Kutusu listesi', () => {
  it('hedef alan, kaynak alıntısı ve fark karosu; tamamen karara bağlanan iş düşer', () => {
    const pid = createProject(
      db,
      { name: 'Runika', kind: 'unity', color: '#3be08f', folderPath: null },
      now,
    )
    updateProject(db, { id: pid, nextStep: 'Eski adım' }, now)
    const note = createNote(db)
    updateNote(db, { id: note.id, title: 'Sorular', bodyMd: 'a\nb\nc\n' }, now)
    const d1 = createDump(db, 'Runika   menü\nmüziği uzun', []).id
    const d2 = createDump(db, 'not', []).id
    const jobId = job(
      [
        {
          op: 'create_task',
          sourceDumpIds: [d1],
          title: 'Menü müziğini kırp',
          context: { projectId: pid },
        },
        { op: 'set_project_next_step', sourceDumpIds: [d1], projectId: pid, text: 'Yeni adım' },
        { op: 'append_to_note', sourceDumpIds: [d2], noteId: note.id, appendMd: '- d\n- e' },
        { op: 'create_reminder', sourceDumpIds: [d2], title: 'Mail', at: '2026-10-01T09:00' },
      ],
      [d1, d2],
    )
    expect(pendingProposalCount(db)).toBe(4)
    const [group] = inbox(db).groups
    expect(group).toMatchObject({ jobId, pending: 4, model: 'fast' })
    const [task, step, append, reminder] = group!.proposals
    expect(task!.target).toEqual({
      domain: 'projects',
      label: 'Runika',
      fill: '#3BE08F',
      missing: false,
    })
    expect(task!.sources[0]!.excerpt).toBe('Runika menü müziği uzun')
    expect(task!.diff).toBeNull()
    expect(step!.diff).toEqual({
      title: 'Sıradaki adım',
      context: [],
      removed: ['Eski adım'],
      added: ['Yeni adım'],
    })
    expect(append!.diff).toEqual({
      title: 'Sorular',
      context: ['b', 'c'],
      removed: [],
      added: ['- d', '- e'],
    })
    expect(reminder!.target).toMatchObject({ domain: 'today', label: 'Bugün' })

    approveProposal(db, task!.id, undefined, now)
    rejectProposal(db, step!.id, now)
    approveProposal(db, append!.id, undefined, now)
    expect(inbox(db).groups[0]!.pending).toBe(1)
    expect(pendingProposalCount(db)).toBe(1)
    rejectProposal(db, reminder!.id, now)
    expect(inbox(db).groups).toEqual([])
  })

  it('bilinmeyen proje işaretlenir; Düzenle seçicileri arşivi göstermez', () => {
    const live = createProject(
      db,
      { name: 'Albüm', kind: 'creative', color: '#f59be6', folderPath: null },
      now,
    )
    const old = createProject(
      db,
      { name: 'Eski', kind: 'general', color: '#ff8a3d', folderPath: null },
      now,
    )
    updateProject(db, { id: old, status: 'archived' }, now)
    const d1 = createDump(db, 'x', []).id
    job([{ op: 'set_project_next_step', sourceDumpIds: [d1], projectId: 'yok', text: 'a' }], [d1])
    const box = inbox(db)
    expect(box.groups[0]!.proposals[0]!.target).toMatchObject({ missing: true })
    expect(box.contexts.projects.map((p) => p.id)).toEqual([live])
  })
})

describe('İşlem günlüğü', () => {
  it('AI önerisini gruplar, günlükten geri alınca öneri de geri alındı olur', () => {
    const d1 = createDump(db, 'a', []).id
    const jobId = job([{ op: 'create_task', sourceDumpIds: [d1], title: 'Görev A' }], [d1])
    const [p] = inbox(db).groups[0]!.proposals
    approveProposal(db, p!.id, undefined, now)

    const ai = activityList(db, { actor: 'ai', days: 30 }, now)
    expect(ai.entries).toHaveLength(1)
    expect(ai.entries[0]).toMatchObject({
      actor: 'ai',
      lines: ['Görev eklendi: Görev A'],
      undoable: true,
    })

    undoActivity(db, ai.entries[0]!.groupId!, now)
    const row = db.select().from(schema.proposals).get()!
    expect(row.jobId).toBe(jobId)
    expect(row.undoneAt).not.toBeNull()

    const all = activityList(db, { actor: 'all', days: 30 }, now)
    const undo = all.entries.find((e) => e.isUndo)
    expect(undo).toMatchObject({
      actor: 'taha',
      undoable: false,
      lines: ['Görev silindi: Görev A'],
    })
    expect(all.entries.find((e) => e.actor === 'ai')).toMatchObject({
      undone: true,
      undoable: false,
    })
    expect(() => undoActivity(db, undo!.groupId!, now)).toThrow()
  })

  it('aralık dışındaki kayıt için "daha eski" der', () => {
    createDump(db, 'eski', [])
    const later = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000)
    expect(activityList(db, { actor: 'all', days: 30 }, later)).toMatchObject({
      entries: [],
      hasMore: true,
    })
    expect(activityList(db, { actor: 'all', days: 60 }, later).entries.length).toBeGreaterThan(0)
  })
})
