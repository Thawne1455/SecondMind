import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import { createTask, listProjectTasks } from './planning'
import {
  clusterNotes,
  convertCluster,
  knownTesters,
  movePoint,
  pastePlaytest,
  playtestOverview,
  previewPaste,
  splitPoint,
  undoPlaytest,
} from './playtest'
import { createProject } from './projects'
import { projectNextSteps } from './roadmap'
import * as schema from './schema'

let db: Db
let id: string

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour)

const CHAT = [
  '[12:03] Ali: ölüm panelinde takılıyor, tuşlar çalışmıyor',
  '[12:05] Can: ölüm panelinde takıldım tuşlar çalışmadı',
  '[12:07] Ece: müzik çok yüksek geliyor bence kısılmalı',
].join('\n')

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

const paste = (text: string, tester = '', day = '2026-09-20') =>
  pastePlaytest(db, { projectId: id, text, tester, receivedOn: day }, at(20))

describe('playtest yapıştırma', () => {
  it('sohbet satırlarından kişileri çıkarır, benzerleri kümeler, sayar', () => {
    const r = paste(CHAT)
    expect(r.points).toBe(3)
    expect(r.newClusters).toBe(2)
    const o = playtestOverview(db, id, at(20))
    expect(o.testers).toEqual(['Ece', 'Can', 'Ali'])
    expect(o.clusters[0]!.people).toBe(2)
    expect(o.clusters[0]!.countLabel).toBe("3 kişiden 2'si")
    expect(o.clusters[1]!.people).toBe(1)
  })

  it('kalıpsız metin Kim alanının kişisiyle kaydedilir; sonraki yapıştırma mevcut kümeye girer', () => {
    paste(CHAT)
    const r = paste('Ölüm panelinde takılıp kaldım, tuşlar çalışmıyordu', 'Deniz', '2026-09-21')
    expect(r.newClusters).toBe(0)
    const o = playtestOverview(db, id, at(21))
    expect(o.clusters[0]!.people).toBe(3)
    expect(o.clusters[0]!.points[0]!.tester).toBe('Deniz')
  })

  it('önizleme kişileri ve nokta sayısını verir, DB’ye yazmaz', () => {
    expect(previewPaste(CHAT, '2026-09-20')).toEqual({
      testers: ['Ali', 'Can', 'Ece'],
      points: 3,
      needsTester: false,
    })
    expect(previewPaste('Müzik yüksek geliyor bence', '2026-09-20').needsTester).toBe(true)
    expect(playtestOverview(db, id).clusters).toHaveLength(0)
  })

  it('geri alınınca yapıştırma ve açtığı kümeler kaybolur', () => {
    const r = paste(CHAT)
    undoPlaytest(db, r.groupId, at(20))
    expect(playtestOverview(db, id, at(20)).clusters).toHaveLength(0)
    expect(knownTesters(db)).toEqual([])
  })
})

describe('taşı / ayır', () => {
  it('taşınan nokta kilitlenir ve sonraki yapıştırmada yerinde kalır; geri alınınca döner', () => {
    paste(CHAT)
    const [death, music] = playtestOverview(db, id, at(20)).clusters
    const ali = death!.points.find((p) => p.tester === 'Ali')!
    const r = movePoint(db, ali.id, music!.id, at(20))
    let o = playtestOverview(db, id, at(20))
    const moved = o.clusters.flatMap((c) => c.points).find((p) => p.id === ali.id)!
    expect(moved.locked).toBe(true)
    expect(o.clusters.find((c) => c.id === music!.id)!.points).toHaveLength(2)

    paste('ölüm panelinde takılıyor tuşlar çalışmıyor', 'Deniz', '2026-09-21')
    o = playtestOverview(db, id, at(21))
    expect(o.clusters.find((c) => c.id === music!.id)!.points.map((p) => p.id)).toContain(ali.id)

    undoPlaytest(db, r.groupId, at(21))
    o = playtestOverview(db, id, at(21))
    expect(o.clusters.find((c) => c.id === death!.id)!.points.map((p) => p.id)).toContain(ali.id)
  })

  it('ayrılan nokta kendi kümesi olur', () => {
    paste(CHAT)
    const death = playtestOverview(db, id, at(20)).clusters[0]!
    const r = splitPoint(db, death.points[0]!.id, at(20))
    const o = playtestOverview(db, id, at(20))
    expect(o.clusters).toHaveLength(3)
    undoPlaytest(db, r.groupId, at(20))
    expect(playtestOverview(db, id, at(20)).clusters).toHaveLength(2)
  })
})

describe('hataya çevir', () => {
  it('başlık en kısa nokta, açıklamada alıntılar; motor kişi sayısını görür; geri alınır', () => {
    paste(CHAT)
    const death = playtestOverview(db, id, at(20)).clusters[0]!
    const r = convertCluster(db, death.id, 'bug', at(20))
    const task = listProjectTasks(db, id, at(20)).find((t) => t.id === r.taskId)!
    expect(task.kind).toBe('bug')
    expect(task.source).toBe('playtest')
    expect(task.title).toBe('ölüm panelinde takıldım tuşlar çalışmadı')
    expect(projectNextSteps(db, id, at(20))[0]!.reason).toContain('2 test eden bildirdi')
    expect(playtestOverview(db, id, at(20)).clusters[0]!.task?.id).toBe(r.taskId)
    expect(() => convertCluster(db, death.id, 'task', at(20))).toThrow('zaten')

    undoPlaytest(db, r.groupId, at(20))
    expect(listProjectTasks(db, id, at(20)).find((t) => t.id === r.taskId)).toBeUndefined()
    expect(playtestOverview(db, id, at(20)).clusters[0]!.task).toBeNull()
  })

  it('proje sözlüğü: ortak iki görev kökü benzer sayılır', () => {
    createTask(db, { title: 'Envanter kilitleniyor', projectId: id }, at(19))
    paste(
      '- envanter kilitleniyor ara sıra ikinci bölümde boss öncesi\n- kilitlenen envanter yüzünden oyundan çıkmak zorunda kaldım',
      'Ali',
    )
    expect(playtestOverview(db, id, at(20)).clusters).toHaveLength(1)
  })

  it('açıklama biçimi', () => {
    expect(
      clusterNotes(
        [
          { text: 'Tuş çalışmıyor', tester: 'Ali', receivedOn: '2026-09-20' },
          { text: 'Tuşlar yok', tester: '', receivedOn: '2026-09-21' },
        ],
        "3 kişiden 1'i",
      ),
    ).toBe(
      "Playtest · 3 kişiden 1'i\n\n> Tuş çalışmıyor — Ali, 20 Eyl\n>\n> Tuşlar yok — 21 Eyl\n\nKişiler: Ali",
    )
  })
})
