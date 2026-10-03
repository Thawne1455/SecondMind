import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import type { NoteUpdateInput } from '@shared/ipc'
import type { Db } from './client'
import {
  createCollection,
  createNote,
  deleteCollection,
  deleteNote,
  getNote,
  listCollections,
  listNotes,
  listTags,
  renameCollection,
  restoreCollection,
  restoreNote,
  searchNotes,
  setCollectionAiExcluded,
  updateNote,
} from './knowledge'
import { loadAiContext } from './aiContext'
import * as schema from './schema'

let db: Db

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
})

const log = () => db.select().from(schema.activityLog).all()

function note(body: string, extra: Omit<NoteUpdateInput, 'id'> = {}) {
  const { id } = createNote(db, null)
  updateNote(db, { id, bodyMd: body, ...extra })
  return id
}

describe('koleksiyonlar', () => {
  it('oluşturur, sayar, yeniden adlandırır; canlı adlar benzersiz', () => {
    const okul = createCollection(db, 'Okul')
    createNote(db, okul.id)
    expect(listCollections(db)).toEqual([
      { id: okul.id, name: 'Okul', noteCount: 1, aiExcluded: false },
    ])
    expect(() => createCollection(db, 'Okul')).toThrow(/zaten var/)
    renameCollection(db, okul.id, 'Ders notları')
    expect(listCollections(db)[0]?.name).toBe('Ders notları')
  })

  it("AI'a kapalı koleksiyonun ve notun başlıkları AI bağlamına girmez", () => {
    const gizli = createCollection(db, 'Kişisel')
    const acik = createCollection(db, 'Okul')
    const a = createNote(db, gizli.id).id
    updateNote(db, { id: a, title: 'Gizli günlük' })
    const b = createNote(db, acik.id).id
    updateNote(db, { id: b, title: 'Ders özeti' })
    note('x', { title: 'Tek tek kapalı', aiExcluded: true })
    note('y', { title: 'Koleksiyonsuz' })

    const titles = () =>
      loadAiContext(db, '')
        .notes.map((n) => n.title)
        .sort()
    expect(titles()).toEqual(['Ders özeti', 'Gizli günlük', 'Koleksiyonsuz'])

    setCollectionAiExcluded(db, gizli.id, true)
    expect(listCollections(db).find((c) => c.id === gizli.id)?.aiExcluded).toBe(true)
    expect(titles()).toEqual(['Ders özeti', 'Koleksiyonsuz'])
    expect(log().at(-1)).toMatchObject({ targetTable: 'collections', action: 'update' })

    setCollectionAiExcluded(db, gizli.id, false)
    expect(titles()).toEqual(['Ders özeti', 'Gizli günlük', 'Koleksiyonsuz'])
  })

  it('keepNotes: notlar koleksiyonsuz kalır, geri alınca geri bağlanır', () => {
    const c = createCollection(db, 'Unity')
    const a = createNote(db, c.id).id
    const b = createNote(db, c.id).id
    deleteCollection(db, c.id, 'keepNotes')
    expect(listCollections(db)).toEqual([])
    expect(
      listNotes(db, { collectionId: 'none' })
        .map((n) => n.id)
        .sort(),
    ).toEqual([a, b].sort())

    // Arada başka koleksiyona taşınan not geri çekilmez.
    const other = createCollection(db, 'Diğer')
    updateNote(db, { id: b, collectionId: other.id })

    restoreCollection(db, c.id)
    expect(listNotes(db, { collectionId: c.id }).map((n) => n.id)).toEqual([a])
    expect(listNotes(db, { collectionId: other.id }).map((n) => n.id)).toEqual([b])
  })

  it('withNotes: notlar aynı grupla çöpe gider ve birlikte döner', () => {
    const c = createCollection(db, 'Fikirler')
    const a = createNote(db, c.id).id
    deleteCollection(db, c.id, 'withNotes')
    expect(getNote(db, a)).toBeNull()
    const deletes = log().filter((l) => l.action === 'delete')
    expect(deletes).toHaveLength(2)
    expect(new Set(deletes.map((l) => l.groupId)).size).toBe(1)

    restoreCollection(db, c.id)
    expect(getNote(db, a)?.collectionId).toBe(c.id)
    expect(
      log()
        .filter((l) => l.action === 'delete')
        .every((l) => l.undoneAt),
    ).toBe(true)
  })

  it('silinen adla yenisi açıldıysa geri gelen ek alır', () => {
    const c = createCollection(db, 'Okul')
    deleteCollection(db, c.id, 'keepNotes')
    createCollection(db, 'Okul')
    restoreCollection(db, c.id)
    expect(listCollections(db).map((x) => x.name)).toEqual(['Okul (2)', 'Okul'])
  })
})

describe('notlar', () => {
  it('etiketleri normalize eder, tekrarı atar; etiket listesi canlı notları sayar', () => {
    const id = note('x', { tags: ['Oyun', 'OYUN', '#Shader', ' '] })
    expect(getNote(db, id)?.tags).toEqual(['oyun', 'shader'])
    const [oyun] = listTags(db)
    expect(oyun).toMatchObject({ name: 'oyun', noteCount: 1 })
    expect(listNotes(db, { tagId: oyun?.id }).map((n) => n.id)).toEqual([id])
    deleteNote(db, id)
    expect(listTags(db)).toEqual([])
  })

  it('sabitlenenler önce; sabitleme tarihi ilerletmez', () => {
    const t0 = new Date('2026-09-01T10:00:00Z')
    const a = createNote(db, null).id
    const b = createNote(db, null).id
    updateNote(db, { id: a, title: 'eski' }, t0)
    updateNote(db, { id: b, title: 'yeni' }, new Date('2026-09-02T10:00:00Z'))
    expect(listNotes(db, {}).map((n) => n.id)).toEqual([b, a])
    const pinned = updateNote(db, { id: a, pinned: true })
    expect(pinned.updatedAt).toBe(t0.getTime())
    expect(listNotes(db, {}).map((n) => n.id)).toEqual([a, b])
    expect(listNotes(db, { pinned: true }).map((n) => n.id)).toEqual([a])
  })

  it('önizleme ve kapak markdown gövdesinden gelir', () => {
    const id = note('# Başlık\n\n![](sm-media://m/abc.png)\n\n**kalın** metin')
    const [s] = listNotes(db, {})
    expect(s).toMatchObject({ id, preview: 'Başlık kalın metin', coverUrl: 'sm-media://m/abc.png' })
  })

  it("10 dk içindeki güncellemeler tek 'update' kaydında birleşir", () => {
    const { id } = createNote(db, null)
    const t = new Date('2026-09-27T10:00:00Z').getTime()
    updateNote(db, { id, bodyMd: 'a' }, new Date(t))
    updateNote(db, { id, bodyMd: 'ab' }, new Date(t + 5 * 60_000))
    updateNote(db, { id, bodyMd: 'abc' }, new Date(t + 9 * 60_000))
    updateNote(db, { id, bodyMd: 'abcd' }, new Date(t + 11 * 60_000))
    const updates = log().filter((l) => l.action === 'update')
    expect(updates).toHaveLength(2)
    expect(JSON.parse(updates[0]?.beforeJson ?? '{}').bodyMd).toBe('')
    expect(JSON.parse(updates[0]?.afterJson ?? '{}').bodyMd).toBe('abc')
    expect(JSON.parse(updates[1]?.afterJson ?? '{}').bodyMd).toBe('abcd')
  })

  it('değişmeyen güncelleme log yazmaz', () => {
    const id = note('aynı')
    const before = log().length
    updateNote(db, { id, bodyMd: 'aynı', tags: [] })
    expect(log()).toHaveLength(before)
  })

  it('silinen not geri alınınca döner; koleksiyonu silindiyse koleksiyonsuz döner', () => {
    const c = createCollection(db, 'Geçici')
    const id = createNote(db, c.id).id
    deleteNote(db, id)
    expect(listNotes(db, {})).toEqual([])
    deleteCollection(db, c.id, 'keepNotes')
    restoreNote(db, id)
    expect(getNote(db, id)?.collectionId).toBeNull()
  })
})

describe('arama (FTS5)', () => {
  it('başlık ve gövdede arar, son kelimeye önek eşleşir, vurgu aralığı döner', () => {
    const a = note('Runika için **ses efekti** listesi', { title: 'Ses notları' })
    note('Alakasız bir not')
    const [hit, ...rest] = searchNotes(db, 'ses ef')
    expect(rest).toEqual([])
    expect(hit?.id).toBe(a)
    expect(hit?.snippet).toContain('ses efekti')
    const [start, end] = hit?.ranges[0] ?? [0, 0]
    expect(hit?.snippet.slice(start, end)).toBe('ses')
  })

  it('aksanları katlar (ş→s), güncelleme ve silmeyi izler', () => {
    const id = note('Şema çizimi')
    expect(searchNotes(db, 'sema').map((r) => r.id)).toEqual([id])
    updateNote(db, { id, bodyMd: 'Diyagram' })
    expect(searchNotes(db, 'sema')).toEqual([])
    expect(searchNotes(db, 'diya').map((r) => r.id)).toEqual([id])
    deleteNote(db, id)
    expect(searchNotes(db, 'diya')).toEqual([])
  })

  it('operatör içeren sorgu hata vermez', () => {
    note('a OR b')
    expect(() => searchNotes(db, 'OR "NEAR( *')).not.toThrow()
    expect(searchNotes(db, '   ')).toEqual([])
  })
})
