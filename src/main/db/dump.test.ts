import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { storeMedia } from '../media'
import type { Db } from './client'
import { approveProposal, finishJob, jobProposals, rejectProposal, startJob } from './ai'
import {
  countPendingDumps,
  createDump,
  deleteDump,
  listDumps,
  pendingDumpIds,
  requeueDump,
  restoreDump,
} from './dump'
import * as schema from './schema'

let db: Db
let mediaDir: string

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
  mediaDir = mkdtempSync(join(tmpdir(), 'sm-media-'))
})

afterEach(() => rmSync(mediaDir, { recursive: true, force: true }))

const png = (seed: number) => ({
  name: 'tahta.png',
  mime: 'image/png',
  bytes: new Uint8Array([seed, 1, 2, 3]),
})

describe('döküm sorguları', () => {
  it('metin dökümünü kaydeder, listeler ve sayar', () => {
    createDump(db, '  Runika için ses efekti ara  ', [])
    const [item] = listDumps(db, 'pending')
    expect(item).toMatchObject({ kind: 'text', content: 'Runika için ses efekti ara' })
    expect(countPendingDumps(db)).toBe(1)
  })

  it('aynı içerikli dosyayı media klasörüne bir kez yazar', () => {
    const a = storeMedia(db, mediaDir, png(7))
    const b = storeMedia(db, mediaDir, png(7))
    const c = storeMedia(db, mediaDir, png(8))
    expect(b.id).toBe(a.id)
    expect(c.id).not.toBe(a.id)
    expect(readdirSync(mediaDir)).toHaveLength(2)
    expect(a.fileName).toMatch(/^[a-f0-9]{64}\.png$/)
  })

  it('ekleri sırasıyla döndürür, tekrar eden eki bir kez tutar', () => {
    const a = storeMedia(db, mediaDir, png(1))
    const b = storeMedia(db, mediaDir, { ...png(2), name: 'notlar.pdf', mime: 'application/pdf' })
    createDump(db, 'tahtadaki formül', [a, b, a])
    const [item] = listDumps(db, 'pending')
    expect(item?.kind).toBe('image')
    expect(item?.attachments.map((x) => x.name)).toEqual(['tahta.png', 'notlar.pdf'])
    expect(item?.attachments[0]?.url).toBe(`sm-media://m/${a.fileName}`)
  })

  it('silinen döküm listeden düşer, geri alınınca döner; her adım günlüğe yazılır', () => {
    const { id } = createDump(db, 'sil beni', [])
    deleteDump(db, id)
    expect(listDumps(db, 'pending')).toHaveLength(0)
    expect(countPendingDumps(db)).toBe(0)

    restoreDump(db, id)
    expect(listDumps(db, 'pending').map((d) => d.id)).toEqual([id])

    const log = db.select().from(schema.activityLog).all()
    expect(log.map((l) => l.action)).toEqual(['create', 'delete', 'restore'])
    expect(JSON.parse(log[1]?.afterJson ?? '{}').deletedAt).toBeTruthy()
  })

  it('iki kez silmek ikinci günlük kaydı üretmez', () => {
    const { id } = createDump(db, 'x', [])
    deleteDump(db, id)
    deleteDump(db, id)
    expect(db.select().from(schema.activityLog).all()).toHaveLength(2)
  })
})

describe('AI sonrası döküm listeleri', () => {
  const task = (title: string, sourceDumpIds: string[]) => ({
    op: 'create_task' as const,
    sourceDumpIds,
    title,
  })

  it('kuyruk işlenenleri de gösterir, bekleyen kimlikleri işlenenleri göstermez', () => {
    const a = createDump(db, 'kahve filtresi', []).id
    const b = createDump(db, 'ödev soru 4', []).id
    startJob(db, { kind: 'dump', model: 'fast', dumpIds: [a], inputSummary: '' })
    expect(
      listDumps(db, 'pending')
        .map((d) => [d.id, d.status])
        .sort(),
    ).toEqual(
      [
        [a, 'processing'],
        [b, 'pending'],
      ].sort(),
    )
    expect(pendingDumpIds(db)).toEqual([b])
    expect(countPendingDumps(db)).toBe(1)
  })

  it('işlenen döküm dönüştüğü önerileri ve kararlarını taşır; atlanan gerekçesini', () => {
    const a = createDump(db, 'menü müziği uzun, hocaya mail', []).id
    const b = createDump(db, 'kahve filtresi', []).id
    const jobId = startJob(db, { kind: 'dump', model: 'fast', dumpIds: [a, b], inputSummary: '' })
    finishJob(
      db,
      jobId,
      {
        operations: [task('Menü müziğini kırp', [a]), task('Hocaya mail at', [a])],
        rejected: [],
        unprocessed: [{ dumpId: b, reason: 'Ne yapılacağı belli değil' }],
      },
      null,
    )
    const [first, second] = jobProposals(db, jobId)
    approveProposal(db, first!.id)
    rejectProposal(db, second!.id)

    const [processed] = listDumps(db, 'processed')
    expect(processed!.skipReason).toBeNull()
    expect(processed!.results.map((r) => [r.op, r.summary, r.status, r.undone])).toEqual([
      ['create_task', 'Menü müziğini kırp', 'approved', false],
      ['create_task', 'Hocaya mail at', 'rejected', false],
    ])

    const [skipped] = listDumps(db, 'skipped')
    expect(skipped).toMatchObject({ id: b, skipReason: 'Ne yapılacağı belli değil', results: [] })
  })

  it('atlanan döküm yeniden kuyruğa alınır, gerekçesi silinir; işlenene etkisi yok', () => {
    const a = createDump(db, 'menü müziği', []).id
    const b = createDump(db, 'belirsiz not', []).id
    const jobId = startJob(db, { kind: 'dump', model: 'fast', dumpIds: [a, b], inputSummary: '' })
    finishJob(
      db,
      jobId,
      {
        operations: [task('Bir şey yap', [a])],
        rejected: [],
        unprocessed: [{ dumpId: b, reason: 'Anlaşılmadı' }],
      },
      null,
    )
    requeueDump(db, a)
    expect(listDumps(db, 'processed').map((d) => d.id)).toEqual([a])
    requeueDump(db, b)
    expect(listDumps(db, 'skipped')).toEqual([])
    const [back] = listDumps(db, 'pending')
    expect(back).toMatchObject({ id: b, status: 'pending', skipReason: null })
  })
})
