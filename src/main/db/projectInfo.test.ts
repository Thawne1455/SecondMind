import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import { projectBriefing, projectScanInfo } from './projectInfo'
import {
  addParking,
  closeSession,
  createProject,
  listProjects,
  markProjectOpened,
  startSession,
} from './projects'
import { recordFolderScan, scanTargets, type FolderScanInput } from './scan'
import * as schema from './schema'

let db: Db
let id: string

// 28 Eylül 2026 Pazartesi.
const at = (day: number, hour = 12) => new Date(2026, 8, day, hour)

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
  id = createProject(
    db,
    { name: 'Runika', kind: 'unity', color: '#3BE08F', folderPath: 'C:\\ajanda\\Runika' },
    at(1),
  )
})

function scan(over: Partial<FolderScanInput>, now: Date) {
  return recordFolderScan(
    db,
    {
      target: scanTargets(db)[0]!,
      commits: [],
      todos: [],
      inventory: null,
      summary: {
        git: true,
        uncommitted: null,
        unity: null,
        inventoryFiles: null,
        latestMtime: null,
      },
      filesChanged: 0,
      ...over,
    },
    now,
  )
}

const commit = (hash: string, when: Date, files: string[], areas: Record<string, number>) => ({
  hash,
  author: 'Taha',
  committedAt: when,
  message: `m-${hash}`,
  files: files.map((path) => ({ path, added: 1, deleted: 0 })),
  areas,
})

describe('geri dönüş brifingi', () => {
  it("son açılıştan 3 günden uzun: son oturum, commit'ler, commit'lenmemişler, park", () => {
    const s = startSession(db, { projectId: id }, at(20, 20))
    closeSession(db, { id: s.id, leftOff: 'Boss müziği yarım', nextStep: 'Hızlandır' }, at(20, 21))
    markProjectOpened(db, id, at(21))
    scan(
      {
        commits: [commit('a', at(22), ['Assets/Boss.cs'], { Kod: 1 })],
        summary: {
          git: true,
          uncommitted: { count: 4, areas: {}, oldestAt: at(20).getTime(), files: [] },
          unity: null,
          inventoryFiles: null,
          latestMtime: null,
        },
      },
      at(23),
    )
    addParking(db, { projectId: id, text: 'GIF', source: 'shortcut' }, at(23))

    const b = projectBriefing(db, id, at(28))!
    expect(b.daysAway).toBe(6)
    expect(b.lastSession).toMatchObject({ minutes: 60, leftOff: 'Boss müziği yarım' })
    expect(b.commits).toEqual([{ message: 'm-a', committedAt: at(22).getTime() }])
    expect(b.commitAreas).toEqual([['Kod', 1]])
    expect(b.files).toEqual(['Assets/Boss.cs'])
    expect(b.uncommitted).toEqual({ count: 4, oldestAt: at(20).getTime(), stale: true })
    expect(b.nextStep).toBe('Hızlandır')
    expect(b.parkedSince).toBe(1)
  })

  it('yakında açılmışsa yok', () => {
    const s = startSession(db, { projectId: id }, at(20, 20))
    closeSession(db, { id: s.id, leftOff: '', nextStep: 'x' }, at(20, 21))
    markProjectOpened(db, id, at(27))
    expect(projectBriefing(db, id, at(28))).toBeNull()
  })
})

describe('Kokpit tarama karoları', () => {
  it('taranmamışsa yok', () => {
    expect(projectScanInfo(db, id, at(29))).toBeNull()
  })

  it("bu haftanın commit'leri ve alanları; ilk taramada not farkı yok, sonrakinde var", () => {
    scan(
      {
        commits: [
          commit('a', at(28, 9), ['a.cs', 'b.wav'], { Kod: 1, Ses: 1 }),
          commit('b', at(29, 9), ['c.cs'], { Kod: 1 }),
          commit('c', at(25, 9), ['old.cs'], { Kod: 1 }),
        ],
        todos: [
          { path: 'a.cs', line: 3, tag: 'TODO', text: 'kamera' },
          { path: 'a.cs', line: 9, tag: 'FIXME', text: 'ses' },
        ],
      },
      at(29, 10),
    )
    const first = projectScanInfo(db, id, at(29, 12))!
    expect(first.week).toEqual({
      commits: 2,
      areas: [
        ['Kod', 2],
        ['Ses', 1],
      ],
    })
    expect(first.todos).toMatchObject({
      open: 2,
      byTag: { TODO: 1, FIXME: 1, HACK: 0 },
      added: null,
      resolved: null,
    })

    scan(
      {
        todos: [
          { path: 'a.cs', line: 3, tag: 'TODO', text: 'kamera' },
          { path: 'b.cs', line: 1, tag: 'HACK', text: 'geçici' },
        ],
      },
      at(29, 11),
    )
    const second = projectScanInfo(db, id, at(29, 12))!
    expect(second.todos).toMatchObject({ open: 2, added: 1, resolved: 1 })
    expect(second.todos!.recent[0]).toMatchObject({ tag: 'HACK', text: 'geçici' })
    expect(second.lastScanAt).toBe(at(29, 11).getTime())
  })

  it('şerit aktivite çubukları: 8 hafta, commit ve dakika', () => {
    scan({ commits: [commit('a', at(28, 9), [], {})] }, at(29))
    const s = startSession(db, { projectId: id }, at(22, 10))
    closeSession(db, { id: s.id, leftOff: '', nextStep: 'x' }, at(22, 11))
    const weeks = listProjects(db, at(29, 12))[0]!.weeks
    expect(weeks).toHaveLength(8)
    expect(weeks[7]).toEqual({ commits: 1, minutes: 0 })
    expect(weeks[6]).toEqual({ commits: 0, minutes: 60 })
  })
})
