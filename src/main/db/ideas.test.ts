import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import { createIdea, ideaToday, listIdeas, markIdeaOpened, setIdeaStatus } from './ideas'
import {
  createCollection,
  createNote,
  deleteNote,
  getNote,
  listCollections,
  listNotes,
  listTags,
  restoreNote,
  searchNotes,
  updateNote,
} from './knowledge'
import * as schema from './schema'

let db: Db

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
})

const day = (d: number, month = 8) => new Date(2026, month, d, 12)
const log = () => db.select().from(schema.activityLog).all()

function idea(title: string, createdAt: Date) {
  const { id } = createIdea(db, createdAt)
  updateNote(db, { id, title }, createdAt)
  return id
}

describe('fikirler', () => {
  it('yeni fikir 14 gün kuluçkada; not ve fikir aynı grupla loglanır', () => {
    const note = createIdea(db, day(1))
    expect(note.idea).toMatchObject({ status: 'incubating', stage: 'incubating', daysLeft: 14 })
    expect(getNote(db, note.id, day(10))?.idea?.daysLeft).toBe(5)
    expect(getNote(db, note.id, day(15))?.idea?.stage).toBe('due')

    const creates = log()
    expect(creates.map((l) => l.targetTable).sort()).toEqual(['ideas', 'notes'])
    expect(new Set(creates.map((l) => l.groupId)).size).toBe(1)
  })

  it('notlar listesinde ve koleksiyon sayılarında yok; etiket filtresinde ve aramada var', () => {
    const c = createCollection(db, 'Unity')
    const n = createNote(db, c.id).id
    updateNote(db, { id: n, title: 'Shader notu', tags: ['unity'] })
    const i = idea('Ritim bulmacası', day(1))
    updateNote(db, { id: i, tags: ['unity'] })

    expect(listNotes(db, {}).map((x) => x.id)).toEqual([n])
    expect(listNotes(db, { collectionId: 'none' })).toEqual([])
    expect(listCollections(db)[0]?.noteCount).toBe(1)

    const tag = listTags(db)[0]!
    expect(tag.noteCount).toBe(2)
    const tagged = listNotes(db, { tagId: tag.id })
    expect(tagged.find((x) => x.id === i)?.isIdea).toBe(true)
    expect(tagged.find((x) => x.id === n)?.isIdea).toBe(false)

    expect(searchNotes(db, 'ritim')).toMatchObject([{ id: i, isIdea: true }])
    expect(() => updateNote(db, { id: i, collectionId: c.id })).toThrow(/koleksiyona/)
  })

  it('liste sırası: karar bekleyen, kuluçka, aktif, arşiv', () => {
    const due = idea('Dolan', day(1))
    const inc = idea('Kuluçkada', day(10))
    const act = idea('Aktif', day(2))
    setIdeaStatus(db, { noteId: act, status: 'active' }, day(3))
    const arc = idea('Arşiv', day(4))
    setIdeaStatus(db, { noteId: arc, status: 'archived' }, day(5))

    const list = listIdeas(db, day(20))
    expect(list.map((x) => x.id)).toEqual([due, inc, act, arc])
    expect(list.map((x) => x.idea.stage)).toEqual(['due', 'incubating', 'active', 'archived'])
    expect(list[1]?.idea.daysLeft).toBe(4)
  })

  it('karar decided_at yazar, geri alma siler; her değişiklik loglanır', () => {
    const id = idea('Mod fikri', day(1))
    setIdeaStatus(db, { noteId: id, status: 'archived' }, day(16))
    expect(getNote(db, id, day(16))?.idea).toMatchObject({
      status: 'archived',
      decidedAt: day(16).getTime(),
    })
    setIdeaStatus(db, { noteId: id, status: 'incubating' }, day(16))
    const back = getNote(db, id, day(16))?.idea
    expect(back).toMatchObject({ stage: 'due', decidedAt: null })
    expect(log().filter((l) => l.targetTable === 'ideas' && l.action === 'update')).toHaveLength(2)

    // Aynı duruma geçiş log yazmaz.
    setIdeaStatus(db, { noteId: id, status: 'incubating' }, day(16))
    expect(log().filter((l) => l.targetTable === 'ideas' && l.action === 'update')).toHaveLength(2)
  })

  it('çöpteki fikir listede, Bugün karolarında yok; geri alınca döner', () => {
    const id = idea('Silinecek', day(1))
    deleteNote(db, id)
    expect(listIdeas(db, day(20))).toEqual([])
    expect(ideaToday(db, day(20)).due).toBeNull()
    expect(() => setIdeaStatus(db, { noteId: id, status: 'active' })).toThrow(/bulunamadı/)
    restoreNote(db, id)
    expect(ideaToday(db, day(20)).due?.noteId).toBe(id)
  })
})

describe('Bugün karoları', () => {
  it('kuluçka: en eski dolan + toplam; yoksa sıradaki', () => {
    const a = idea('Eski', day(1))
    idea('Daha yeni', day(3))
    const c = idea('Taze', day(15))
    expect(ideaToday(db, day(20))).toMatchObject({
      due: { noteId: a, title: 'Eski', days: 5 },
      dueCount: 2,
      next: { noteId: c, days: 9 },
    })
    expect(ideaToday(db, day(14))).toMatchObject({ due: null, dueCount: 0, next: { noteId: a } })
  })

  it('radar: 30 gün açılmamış aktif fikir; açılınca düşer, açılma loglanmaz', () => {
    const id = idea('Unutulan', day(1, 6))
    setIdeaStatus(db, { noteId: id, status: 'active' }, day(20, 6))
    expect(ideaToday(db, day(18, 7)).radar).toBeNull()
    expect(ideaToday(db, day(19, 7)).radar).toMatchObject({ noteId: id, days: 30 })

    const before = log().length
    markIdeaOpened(db, id, day(19, 7))
    expect(ideaToday(db, day(19, 7)).radar).toBeNull()
    expect(log()).toHaveLength(before)
  })
})
