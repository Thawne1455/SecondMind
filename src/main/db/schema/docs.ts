import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { deletedAt, id, timestamps } from './columns'
import { media } from './media'
import { projects } from './projects'

// Proje hafızası (Aşama 5d): dokümantasyon ağacı (sayfa / ADR / GDD, bağlı dosya), zaman makinesi görüntüleri,
// Günlük notları ve devlog taslakları, varlıklar. Ayrıntı docs/PROJELER.md > 4–6.

export const projectDocs = sqliteTable(
  'project_docs',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    /** Üst sayfa; null = kök. */
    parentId: text('parent_id'),
    sort: integer('sort').notNull().default(0),
    title: text('title').notNull(),
    bodyMd: text('body_md').notNull().default(''),
    /** Bağlı dosya (proje klasöründe markdown): diskten okunur, salt okunur. null = SecondMind'da yazılan sayfa. */
    sourcePath: text('source_path'),
    kind: text('kind', { enum: ['page', 'adr', 'gdd'] })
      .notNull()
      .default('page'),
    /** Claude Code'a açık (5e köprüsü dışa verir). */
    aiOpen: integer('ai_open', { mode: 'boolean' })
      .notNull()
      .default(sql`0`),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('project_docs_project_idx').on(t.projectId, t.parentId, t.sort)],
)

export const projectShots = sqliteTable(
  'project_shots',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id),
    /** Görüntünün günü 'YYYY-MM-DD' (dosya tarihi ya da yapıştırma günü). */
    takenOn: text('taken_on').notNull(),
    /** Tam an (ms); aynı gündeki sıralama. */
    takenAt: integer('taken_at', { mode: 'timestamp_ms' }).notNull(),
    source: text('source', { enum: ['editor', 'folder', 'session'] }).notNull(),
    /** Klasörden gelen görüntünün diskteki yolu. */
    sourcePath: text('source_path'),
    starred: integer('starred', { mode: 'boolean' })
      .notNull()
      .default(sql`0`),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('project_shots_media_idx').on(t.projectId, t.mediaId),
    index('project_shots_day_idx').on(t.projectId, t.takenOn),
  ],
)

export const projectLogNotes = sqliteTable(
  'project_log_notes',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    day: text('day').notNull(),
    /** report: Claude Code oturum raporu (5e, ham metin; Günlük ayrıştırarak gösterir). */
    kind: text('kind', { enum: ['note', 'devlog', 'report'] })
      .notNull()
      .default('note'),
    bodyMd: text('body_md').notNull(),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('project_log_notes_project_idx').on(t.projectId, t.day)],
)

export const assets = sqliteTable(
  'assets',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    /** SecondMind'a eklenen dosya; ya bu ya `external_path`. */
    mediaId: text('media_id').references(() => media.id),
    /** Klasör taramasından gelen, kopyalanmayan dosya. */
    externalPath: text('external_path'),
    kind: text('kind', { enum: ['image', 'audio', 'pdf', 'other'] }).notNull(),
    title: text('title').notNull(),
    docId: text('doc_id'),
    taskId: text('task_id'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('assets_project_idx').on(t.projectId)],
)
