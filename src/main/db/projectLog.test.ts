import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import { createTask, setTaskDone } from './planning'
import { pastePlaytest } from './playtest'
import { addLogNote, devlogDraft, listLog, setLogNoteDeleted } from './projectLog'
import { closeSession, createProject, startSession } from './projects'
import * as schema from './schema'

let db: Db
let id: string

const at = (day: number, hour = 12, min = 0) => new Date(2026, 8, day, hour, min)

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
  id = createProject(
    db,
    { name: 'Runika', kind: 'unity', color: '#3BE08F', folderPath: 'C:\\x\\Runika' },
    at(1),
  )
  const folderId = db.select().from(schema.projectFolders).get()!.id
  const commit = (day: number, message: string, areas: Record<string, number>) =>
    db
      .insert(schema.commits)
      .values({
        id: ulid(),
        projectId: id,
        folderId,
        hash: ulid(),
        message,
        author: 'Taha',
        committedAt: at(day, 15),
        areasJson: JSON.stringify(areas),
        filesJson: '[]',
      })
      .run()
  commit(22, 'Ses: menü geçişleri', { Ses: 3 })
  commit(22, 'Ses: boss döngüsü', { Ses: 2, Kod: 1 })
  commit(23, 'Merge branch main', {})
  const s = startSession(db, { projectId: id }, at(23, 20))
  closeSession(db, { id: s.id, leftOff: 'Boss yarım', nextStep: 'Boss fazı 2' }, at(23, 21, 30))
  const t = createTask(db, { title: 'Ölüm paneli tuşları', projectId: id, kind: 'bug' }, at(20))
  setTaskDone(db, t.id, true, at(24, 10))
  pastePlaytest(
    db,
    {
      projectId: id,
      text: '[12:03] Ali: ölüm panelinde takıldım tuşlar gitmiyor',
      tester: '',
      receivedOn: '2026-09-24',
    },
    at(24, 13),
  )
})

describe('Günlük', () => {
  it("gün gün, en yeni önce; commit'ler günde tek grup ve alanlar toplanır", () => {
    addLogNote(db, { projectId: id, bodyMd: 'Boss müziği için referans dinledim' }, at(24, 22))
    const page = listLog(db, id, '2026-09-24', at(24, 23))
    expect(page.days.map((d) => d.day)).toEqual(['2026-09-24', '2026-09-23', '2026-09-22'])
    const d22 = page.days[2]!.items
    expect(d22).toHaveLength(1)
    expect(d22[0]).toMatchObject({
      kind: 'commits',
      messages: ['Ses: menü geçişleri', 'Ses: boss döngüsü'],
      areas: [
        ['Ses', 5],
        ['Kod', 1],
      ],
    })
    expect(page.days[1]!.items.map((i) => i.kind).sort()).toEqual(['commits', 'session'])
    expect(page.days[0]!.items.map((i) => i.kind)).toEqual(['note', 'playtest', 'task'])
    expect(page.days[0]!.items[1]).toMatchObject({ kind: 'playtest', people: ['Ali'], points: 1 })
    expect(page.nextUntil).toBeNull()
  })

  it('silinen not görünmez, geri gelir', () => {
    const noteId = addLogNote(db, { projectId: id, bodyMd: 'not' }, at(24, 22))
    setLogNoteDeleted(db, noteId, true, at(24, 23))
    expect(listLog(db, id, '2026-09-24').days[0]!.items.some((i) => i.kind === 'note')).toBe(false)
    setLogNoteDeleted(db, noteId, false, at(24, 23))
    expect(listLog(db, id, '2026-09-24').days[0]!.items.some((i) => i.kind === 'note')).toBe(true)
  })

  it('30 günden eski kayıt varsa sonraki sayfa günü verilir', () => {
    expect(listLog(db, id, '2026-10-30', at(30)).nextUntil).toBe('2026-09-30')
  })
})

describe('devlog taslağı', () => {
  it('haftanın verisinden (Pzt–Paz) şablon; merge atılır, aynı başlangıçlı birleşir', () => {
    const d = devlogDraft(db, id, '2026-09-24', at(27))
    expect(d.weekStart).toBe('2026-09-21')
    expect(d.week).toBe(39)
    expect(d.empty).toBe(false)
    expect(d.markdown).toContain('# Runika · Hafta 39')
    expect(d.markdown).toContain('Bu hafta 1 oturum, 1,5 saat; 1 iş bitti.')
    expect(d.markdown).toContain('- Ses: menü geçişleri (2 commit)')
    expect(d.markdown).toContain('## Düzeltilen hatalar\n- Ölüm paneli tuşları')
    expect(d.markdown).not.toContain('Merge')
    expect(d.images).toEqual([])
  })

  it('kayıtsız hafta boş', () => {
    expect(devlogDraft(db, id, '2026-09-10', at(27)).empty).toBe(true)
  })
})
