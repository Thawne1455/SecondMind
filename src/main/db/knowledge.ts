import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  max,
  notInArray,
  sql,
} from 'drizzle-orm'
import { ulid } from 'ulid'
import {
  MEDIA_URL,
  type CollectionDeleteMode,
  type CollectionSummary,
  type Note,
  type NoteListInput,
  type NoteSearchResult,
  type NoteSummary,
  type NoteUpdateInput,
  type TagSummary,
} from '@shared/ipc'
import {
  firstImageUrl,
  ftsQuery,
  normalizeTags,
  notePreview,
  parseSnippet,
  SNIPPET_CLOSE,
  SNIPPET_OPEN,
} from '../domain/knowledge'
import { ideaState } from '../domain/incubation'
import { logActivity, logUpdateMerged } from './activity'
import type { Db, DbTx } from './client'
import { activityLog, collections, ideas, noteTags, notes, tags } from './schema'

type Conn = Db | DbTx
export type NoteRow = typeof notes.$inferSelect
export type IdeaRow = typeof ideas.$inferSelect

/** Otomatik kayıtta aynı nota bu süre içinde gelen güncellemeler tek log kaydında birleşir. */
export const NOTE_LOG_MERGE_MS = 10 * 60_000

const collator = new Intl.Collator('tr')
const byName = (a: string, b: string) => collator.compare(a, b)

// ---------------------------------------------------------------- koleksiyonlar

function liveCollection(db: Conn, id: string) {
  return db
    .select()
    .from(collections)
    .where(and(eq(collections.id, id), isNull(collections.deletedAt)))
    .get()
}

function nameTaken(db: Conn, name: string, exceptId?: string): boolean {
  const clash = db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.name, name), isNull(collections.deletedAt)))
    .get()
  return !!clash && clash.id !== exceptId
}

function assertNameFree(db: Conn, name: string, exceptId?: string): void {
  if (nameTaken(db, name, exceptId)) throw new Error(`"${name}" adında bir koleksiyon zaten var`)
}

export function listCollections(db: Db): CollectionSummary[] {
  return db
    .select({ id: collections.id, name: collections.name, noteCount: count(notes.id) })
    .from(collections)
    .leftJoin(notes, and(eq(notes.collectionId, collections.id), isNull(notes.deletedAt)))
    .where(isNull(collections.deletedAt))
    .groupBy(collections.id)
    .orderBy(asc(collections.position), asc(collections.id))
    .all()
}

export function createCollection(db: Db, name: string): CollectionSummary {
  return db.transaction((tx) => {
    assertNameFree(tx, name)
    const last = tx
      .select({ p: max(collections.position) })
      .from(collections)
      .get()
    const row = tx
      .insert(collections)
      .values({ id: ulid(), name, position: (last?.p ?? -1) + 1 })
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'create',
      targetTable: 'collections',
      targetId: row.id,
      after: row,
    })
    return { id: row.id, name: row.name, noteCount: 0 }
  })
}

export function renameCollection(db: Db, id: string, name: string): void {
  db.transaction((tx) => {
    const before = liveCollection(tx, id)
    if (!before) throw new Error('Koleksiyon bulunamadı')
    if (before.name === name) return
    assertNameFree(tx, name, id)
    const after = tx
      .update(collections)
      .set({ name, updatedAt: new Date() })
      .where(eq(collections.id, id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'update',
      targetTable: 'collections',
      targetId: id,
      before,
      after,
    })
  })
}

/**
 * Koleksiyonu çöp kutusuna taşır. İçindeki canlı notlar `keepNotes`'ta koleksiyonsuz kalır,
 * `withNotes`'ta onlar da silinir. Hepsi aynı `group_id` ile loglanır; geri alma grubu izler.
 */
export function deleteCollection(db: Db, id: string, mode: CollectionDeleteMode): void {
  db.transaction((tx) => {
    const before = liveCollection(tx, id)
    if (!before) return
    const groupId = ulid()
    const now = new Date()

    const members = tx
      .select()
      .from(notes)
      .where(and(eq(notes.collectionId, id), isNull(notes.deletedAt)))
      .all()
    for (const note of members) {
      const after = tx
        .update(notes)
        .set(mode === 'withNotes' ? { deletedAt: now } : { collectionId: null })
        .where(eq(notes.id, note.id))
        .returning()
        .get()
      logActivity(tx, {
        actor: 'taha',
        action: mode === 'withNotes' ? 'delete' : 'update',
        targetTable: 'notes',
        targetId: note.id,
        groupId,
        before: note,
        after,
      })
    }

    const after = tx
      .update(collections)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(collections.id, id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'delete',
      targetTable: 'collections',
      targetId: id,
      groupId,
      before,
      after,
    })
  })
}

/** Son silmeyi geri alır: koleksiyon döner, grubundaki notlar silindiyse döner, ayrıldıysa geri bağlanır. */
export function restoreCollection(db: Db, id: string): void {
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(collections)
      .where(and(eq(collections.id, id), isNotNull(collections.deletedAt)))
      .get()
    if (!before) return
    const now = new Date()
    const groupId = ulid()

    // Silindikten sonra aynı adla yenisi açıldıysa geri gelen "(2)" ekiyle döner.
    let name = before.name
    for (let n = 2; nameTaken(tx, name); n++) name = `${before.name} (${n})`
    const after = tx
      .update(collections)
      .set({ deletedAt: null, name, updatedAt: now })
      .where(eq(collections.id, id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'restore',
      targetTable: 'collections',
      targetId: id,
      groupId,
      before,
      after,
    })

    const deletion = tx
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.targetTable, 'collections'),
          eq(activityLog.targetId, id),
          eq(activityLog.action, 'delete'),
          isNull(activityLog.undoneAt),
        ),
      )
      .orderBy(desc(activityLog.id))
      .get()
    if (!deletion?.groupId) return

    const group = tx
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.groupId, deletion.groupId), isNull(activityLog.undoneAt)))
      .all()
    for (const entry of group) {
      if (entry.targetTable !== 'notes') continue
      const note = tx.select().from(notes).where(eq(notes.id, entry.targetId)).get()
      if (!note) continue
      if (entry.action === 'delete' && note.deletedAt) {
        const restored = tx
          .update(notes)
          .set({ deletedAt: null })
          .where(eq(notes.id, note.id))
          .returning()
          .get()
        logActivity(tx, {
          actor: 'taha',
          action: 'restore',
          targetTable: 'notes',
          targetId: note.id,
          groupId,
          before: note,
          after: restored,
        })
      } else if (entry.action === 'update' && !note.deletedAt && note.collectionId === null) {
        // Arada başka koleksiyona taşınmış notlara dokunulmaz.
        const relinked = tx
          .update(notes)
          .set({ collectionId: id })
          .where(eq(notes.id, note.id))
          .returning()
          .get()
        logActivity(tx, {
          actor: 'taha',
          action: 'update',
          targetTable: 'notes',
          targetId: note.id,
          groupId,
          before: note,
          after: relinked,
        })
      }
    }
    tx.update(activityLog)
      .set({ undoneAt: now })
      .where(eq(activityLog.groupId, deletion.groupId))
      .run()
  })
}

// ---------------------------------------------------------------- etiketler

export function listTags(db: Db): TagSummary[] {
  return db
    .select({ id: tags.id, name: tags.name, noteCount: count(notes.id) })
    .from(tags)
    .innerJoin(noteTags, eq(noteTags.tagId, tags.id))
    .innerJoin(notes, and(eq(notes.id, noteTags.noteId), isNull(notes.deletedAt)))
    .groupBy(tags.id)
    .all()
    .sort((a, b) => byName(a.name, b.name))
}

export function tagsByNote(db: Conn, noteIds: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (!noteIds.length) return out
  const rows = db
    .select({ noteId: noteTags.noteId, name: tags.name })
    .from(noteTags)
    .innerJoin(tags, eq(tags.id, noteTags.tagId))
    .where(inArray(noteTags.noteId, noteIds))
    .all()
  for (const r of rows) out.set(r.noteId, [...(out.get(r.noteId) ?? []), r.name])
  for (const list of out.values()) list.sort(byName)
  return out
}

function replaceTags(db: Conn, noteId: string, names: string[]): void {
  db.delete(noteTags).where(eq(noteTags.noteId, noteId)).run()
  for (const name of names) {
    db.insert(tags).values({ id: ulid(), name }).onConflictDoNothing().run()
    const tag = db.select({ id: tags.id }).from(tags).where(eq(tags.name, name)).get()
    if (tag) db.insert(noteTags).values({ noteId, tagId: tag.id }).run()
  }
}

// ---------------------------------------------------------------- notlar

export function toSummary(row: NoteRow, tagNames: string[], isIdea = false): NoteSummary {
  return {
    id: row.id,
    title: row.title,
    preview: notePreview(row.bodyMd),
    coverUrl: firstImageUrl(row.bodyMd, MEDIA_URL),
    tags: tagNames,
    pinned: row.pinned,
    isIdea,
    updatedAt: row.updatedAt.getTime(),
  }
}

export function toNote(
  row: NoteRow,
  tagNames: string[],
  idea: IdeaRow | undefined,
  now = new Date(),
): Note {
  return {
    id: row.id,
    title: row.title,
    bodyMd: row.bodyMd,
    collectionId: row.collectionId,
    projectId: row.projectId,
    courseId: row.courseId,
    weekId: row.weekId,
    pinned: row.pinned,
    aiExcluded: row.aiExcluded,
    tags: tagNames,
    idea: idea ? ideaState(idea, now) : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

export function ideaOfNote(db: Conn, noteId: string): IdeaRow | undefined {
  return db.select().from(ideas).where(eq(ideas.noteId, noteId)).get()
}

function liveNote(db: Conn, id: string) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .get()
}

/**
 * Sabitlenenler önce, sonra son düzenlenen. Fikirler kendi listelerinde (`listIdeas`); buraya
 * sadece etiket filtresiyle girer (etiket, notları ve fikirleri kesen bir süzgeç).
 */
export function listNotes(db: Db, filter: NoteListInput): NoteSummary[] {
  const where = [isNull(notes.deletedAt)]
  if (!filter.tagId) where.push(notInArray(notes.id, db.select({ id: ideas.noteId }).from(ideas)))
  if (filter.collectionId === 'none') where.push(isNull(notes.collectionId))
  else if (filter.collectionId) where.push(eq(notes.collectionId, filter.collectionId))
  if (filter.pinned !== undefined) where.push(eq(notes.pinned, filter.pinned))
  if (filter.projectId) where.push(eq(notes.projectId, filter.projectId))
  if (filter.tagId) {
    where.push(
      inArray(
        notes.id,
        db.select({ id: noteTags.noteId }).from(noteTags).where(eq(noteTags.tagId, filter.tagId)),
      ),
    )
  }
  const rows = db
    .select()
    .from(notes)
    .where(and(...where))
    .orderBy(desc(notes.pinned), desc(notes.updatedAt), desc(notes.id))
    .all()
  const ids = rows.map((r) => r.id)
  const tagMap = tagsByNote(db, ids)
  const ideaIds = new Set(
    filter.tagId && ids.length
      ? db
          .select({ id: ideas.noteId })
          .from(ideas)
          .where(inArray(ideas.noteId, ids))
          .all()
          .map((r) => r.id)
      : [],
  )
  return rows.map((r) => toSummary(r, tagMap.get(r.id) ?? [], ideaIds.has(r.id)))
}

export function getNote(db: Db, id: string, now = new Date()): Note | null {
  const row = liveNote(db, id)
  return row ? toNote(row, tagsByNote(db, [id]).get(id) ?? [], ideaOfNote(db, id), now) : null
}

export function createNote(db: Db, collectionId?: string | null, projectId?: string | null): Note {
  return db.transaction((tx) => {
    if (collectionId && !liveCollection(tx, collectionId)) throw new Error('Koleksiyon bulunamadı')
    const row = tx
      .insert(notes)
      .values({ id: ulid(), collectionId: collectionId ?? null, projectId: projectId ?? null })
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'create',
      targetTable: 'notes',
      targetId: row.id,
      after: { ...row, tags: [] },
    })
    return toNote(row, [], undefined)
  })
}

/**
 * Kısmi güncelleme. `updated_at` sadece içerik (başlık, gövde, etiket) değişince ilerler;
 * sabitleme, AI izni ve koleksiyon taşıma listedeki sırayı ve tarihi bozmaz.
 * Log 10 dk'lık pencerede birleşir (otomatik kayıt her tuşta kayıt açmasın).
 */
export function updateNote(db: Db, input: NoteUpdateInput, now = new Date()): NoteSummary {
  return db.transaction((tx) => {
    const before = liveNote(tx, input.id)
    if (!before) throw new Error('Not bulunamadı')
    const beforeTags = tagsByNote(tx, [input.id]).get(input.id) ?? []
    if (input.collectionId && !liveCollection(tx, input.collectionId))
      throw new Error('Koleksiyon bulunamadı')
    // Fikirler kendi bölümünde yaşar; koleksiyon sayıları ve listeler buna dayanır.
    if (input.collectionId && ideaOfNote(tx, input.id))
      throw new Error('Fikirler bir koleksiyona taşınamaz')

    const nextTags = input.tags ? normalizeTags(input.tags).sort(byName) : beforeTags
    const tagsChanged = nextTags.join('\n') !== beforeTags.join('\n')
    const contentChanged =
      (input.title !== undefined && input.title !== before.title) ||
      (input.bodyMd !== undefined && input.bodyMd !== before.bodyMd) ||
      tagsChanged
    const metaChanged =
      (input.collectionId !== undefined && input.collectionId !== before.collectionId) ||
      (input.pinned !== undefined && input.pinned !== before.pinned) ||
      (input.aiExcluded !== undefined && input.aiExcluded !== before.aiExcluded)
    const isIdea = !!ideaOfNote(tx, input.id)
    if (!contentChanged && !metaChanged) return toSummary(before, beforeTags, isIdea)

    if (tagsChanged) replaceTags(tx, input.id, nextTags)
    const after = tx
      .update(notes)
      .set({
        title: input.title,
        bodyMd: input.bodyMd,
        collectionId: input.collectionId,
        pinned: input.pinned,
        aiExcluded: input.aiExcluded,
        ...(contentChanged ? { updatedAt: now } : {}),
      })
      .where(eq(notes.id, input.id))
      .returning()
      .get()
    logUpdateMerged(
      tx,
      {
        actor: 'taha',
        targetTable: 'notes',
        targetId: input.id,
        before: { ...before, tags: beforeTags },
        after: { ...after, tags: nextTags },
      },
      NOTE_LOG_MERGE_MS,
      now,
    )
    return toSummary(after, nextTags, isIdea)
  })
}

export function deleteNote(db: Db, id: string): void {
  db.transaction((tx) => {
    const before = liveNote(tx, id)
    if (!before) return
    const after = tx
      .update(notes)
      .set({ deletedAt: new Date() })
      .where(eq(notes.id, id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'delete',
      targetTable: 'notes',
      targetId: id,
      before,
      after,
    })
  })
}

/** Çöp kutusundan geri alır; koleksiyonu bu arada silindiyse not koleksiyonsuz döner. */
export function restoreNote(db: Db, id: string): void {
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), isNotNull(notes.deletedAt)))
      .get()
    if (!before) return
    const orphaned = before.collectionId !== null && !liveCollection(tx, before.collectionId)
    const after = tx
      .update(notes)
      .set({ deletedAt: null, ...(orphaned ? { collectionId: null } : {}) })
      .where(eq(notes.id, id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'restore',
      targetTable: 'notes',
      targetId: id,
      before,
      after,
    })
  })
}

/** FTS5 arama; başlık eşleşmesi gövdeden 5 kat ağır. Snippet gövdeden, markdown'dan arındırılmış. */
export function searchNotes(db: Db, query: string): NoteSearchResult[] {
  const match = ftsQuery(query)
  if (!match) return []
  const rows = db.all<{ id: string; title: string; snippet: string; isIdea: number }>(sql`
    SELECT n.id AS id, n.title AS title,
      snippet(notes_fts, 1, ${SNIPPET_OPEN}, ${SNIPPET_CLOSE}, '…', 16) AS snippet,
      i.id IS NOT NULL AS isIdea
    FROM notes_fts JOIN notes n ON n.rowid = notes_fts.rowid
    LEFT JOIN ideas i ON i.note_id = n.id
    WHERE notes_fts MATCH ${match} AND n.deleted_at IS NULL
    ORDER BY bm25(notes_fts, 5.0, 1.0)
    LIMIT 50
  `)
  return rows.map((r) => {
    const { text, ranges } = parseSnippet(r.snippet)
    return { id: r.id, title: r.title, snippet: text, isIdea: r.isIdea === 1, ranges }
  })
}

export function listNoteTitles(db: Db): { id: string; title: string }[] {
  return db
    .select({ id: notes.id, title: notes.title })
    .from(notes)
    .where(isNull(notes.deletedAt))
    .orderBy(desc(notes.updatedAt))
    .all()
}
