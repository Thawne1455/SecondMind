import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { storeMedia } from '../media'
import { imageDirSuggestions, importShots } from '../scan/shots'
import type { Db } from './client'
import { closeSession, createProject, startSession } from './projects'
import * as schema from './schema'
import {
  addAsset,
  addPastedShot,
  listAssets,
  listShots,
  projectImageDirs,
  setImageDir,
  updateAsset,
  updateShot,
} from './shots'

let db: Db
let dir: string
let mediaDir: string
let id: string
let folderId: string

const png = (seed: number) => new Uint8Array([137, 80, 78, 71, seed])
const at = (day: number, hour = 12) => new Date(2026, 8, day, hour)

function writeShot(rel: string, seed: number, day: number) {
  const path = join(dir, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, png(seed))
  utimesSync(path, at(day), at(day))
}

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
  dir = mkdtempSync(join(tmpdir(), 'sm-shots-'))
  mediaDir = mkdtempSync(join(tmpdir(), 'sm-media-'))
  id = createProject(
    db,
    { name: 'Runika', kind: 'unity', color: '#3BE08F', folderPath: dir },
    at(1),
  )
  folderId = db.select().from(schema.projectFolders).get()!.id
  writeShot('Captures/a.png', 1, 20)
  writeShot('Captures/b.png', 2, 25)
  writeShot('Captures/kopya.png', 2, 26) // b ile aynı içerik
  writeShot('.secondmind/goruntuler/2026-09-27_1430.png', 3, 27)
  writeShot('Assets/Sprites/kilic.png', 4, 10)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(mediaDir, { recursive: true, force: true })
})

describe('zaman makinesi', () => {
  it('Captures önerilir, Sprites önerilmez', async () => {
    const s = await imageDirSuggestions(projectImageDirs(db, id))
    expect(s.map((d) => [d.path, d.images])).toEqual([['Captures', 3]])
  })

  it('bağlı klasörden ve Editor klasöründen kareler dosya gününe göre; aynı içerik bir kez; tekrar almaz', async () => {
    // Bağlanmadan önce sadece Editor klasörü okunur.
    expect(await importShots(db, mediaDir, id, projectImageDirs(db, id))).toBe(1)
    setImageDir(db, folderId, 'Captures', true, at(28))
    expect(await importShots(db, mediaDir, id, projectImageDirs(db, id))).toBe(2)
    expect(await importShots(db, mediaDir, id, projectImageDirs(db, id))).toBe(0)
    const shots = listShots(db, id)
    expect(shots.map((s) => [s.takenOn, s.source])).toEqual([
      ['2026-09-27', 'editor'],
      ['2026-09-25', 'folder'],
      ['2026-09-20', 'folder'],
    ])
  })

  it('oturum kapanışında yapıştırma: kare + oturumun shot_media_id; yıldız ve silme', () => {
    const s = startSession(db, { projectId: id }, at(28, 10))
    closeSession(db, { id: s.id, leftOff: '', nextStep: 'x' }, at(28, 11))
    const file = storeMedia(db, mediaDir, {
      name: 'yapistir.png',
      mime: 'image/png',
      bytes: png(9),
    })
    const shotId = addPastedShot(db, id, file, s.id, at(28, 11))
    expect(db.select().from(schema.sessions).get()!.shotMediaId).toBe(file.id)
    updateShot(db, shotId, { starred: true })
    expect(listShots(db, id)[0]!.starred).toBe(true)
    updateShot(db, shotId, { deleted: true })
    expect(listShots(db, id)).toHaveLength(0)
    // Aynı kare yeniden yapıştırılınca geri gelir.
    addPastedShot(db, id, file, undefined, at(28, 12))
    expect(listShots(db, id)).toHaveLength(1)
  })
})

describe('varlıklar', () => {
  it('eklenir, türü MIME/uzantıdan; sayfaya bağlanır; silinir', () => {
    const file = storeMedia(db, mediaDir, { name: 'demo.mp3', mime: 'audio/mpeg', bytes: png(7) })
    const assetId = addAsset(db, id, file, 'demo', at(2))
    expect(listAssets(db, id)).toMatchObject([
      { id: assetId, kind: 'audio', title: 'demo', external: false },
    ])
    updateAsset(db, { id: assetId, docId: 'doc1' })
    expect(listAssets(db, id)[0]!.docId).toBe('doc1')
    updateAsset(db, { id: assetId, deleted: true })
    expect(listAssets(db, id)).toEqual([])
  })
})
