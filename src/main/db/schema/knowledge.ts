import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { deletedAt, id, timestamps } from './columns'

/** Bilgi koleksiyonları. Ad canlı koleksiyonlar arasında benzersiz; çöp kutusundakiler adı tutmaz. */
export const collections = sqliteTable(
  'collections',
  {
    id: id(),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('collections_name_live_idx')
      .on(t.name)
      .where(sql`deleted_at IS NULL`),
  ],
)

/** Not: gövde markdown. Arama `notes_fts` (FTS5, trigger'larla senkron; migration'da elle yazılır). */
export const notes = sqliteTable(
  'notes',
  {
    id: id(),
    title: text('title').notNull().default(''),
    bodyMd: text('body_md').notNull().default(''),
    collectionId: text('collection_id').references(() => collections.id),
    // Bağlam alanları; projects / courses / weeks tabloları Aşama 5-6'da, foreign key o zaman.
    projectId: text('project_id'),
    courseId: text('course_id'),
    weekId: text('week_id'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    aiExcluded: integer('ai_excluded', { mode: 'boolean' }).notNull().default(false),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('notes_list_idx').on(t.deletedAt, t.pinned, t.updatedAt),
    index('notes_collection_idx').on(t.collectionId),
  ],
)

/**
 * Fikir: bir notun (başlık + gövde notta) kuluçka ve karar durumu. Not başına en fazla bir fikir.
 * Soft delete notla birlikte: not çöpteyse fikir de görünmez.
 * 'due' (kuluçka doldu) saklanmaz; `incubate_until` ile hesaplanır (domain/incubation).
 */
export const ideas = sqliteTable(
  'ideas',
  {
    id: id(),
    noteId: text('note_id')
      .notNull()
      .unique()
      .references(() => notes.id),
    status: text('status', { enum: ['incubating', 'active', 'project', 'archived'] })
      .notNull()
      .default('incubating'),
    incubateUntil: integer('incubate_until', { mode: 'timestamp_ms' }).notNull(),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
    // Radar sinyali; açılma activity_log'a yazılmaz.
    lastOpenedAt: integer('last_opened_at', { mode: 'timestamp_ms' }),
    // projects tablosu Aşama 5'te; foreign key o zaman.
    projectId: text('project_id'),
    ...timestamps(),
  },
  (t) => [index('ideas_status_idx').on(t.status, t.incubateUntil)],
)

/** Etiket adı `toLocaleLowerCase('tr-TR')` ile normalize edilmiş halde saklanır. */
export const tags = sqliteTable('tags', {
  id: id(),
  name: text('name').notNull().unique(),
  ...timestamps(),
})

export const noteTags = sqliteTable(
  'note_tags',
  {
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tagId] }), index('note_tags_tag_idx').on(t.tagId)],
)
