import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { id, timestamps } from './columns'
import { projectFolders, projects } from './projects'

// Klasör taraması (Aşama 5b): commit'ler, koddaki notlar, tarama anlık görüntüleri. Ayrıntı docs/PROJELER.md > Tarama.
// Tarama verisidir, Taha'nın verisi değil: soft delete yok, satır başına log yok (tarama başına tek özet satırı).

export const commits = sqliteTable(
  'commits',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    folderId: text('folder_id')
      .notNull()
      .references(() => projectFolders.id, { onDelete: 'cascade' }),
    hash: text('hash').notNull(),
    message: text('message').notNull(),
    author: text('author').notNull(),
    committedAt: integer('committed_at', { mode: 'timestamp_ms' }).notNull(),
    /** Alan → dosya sayısı JSON (`{"Kod":12,"Ses":3}`). */
    areasJson: text('areas_json').notNull(),
    /** `[{path, added, deleted}]` JSON. */
    filesJson: text('files_json').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('commits_folder_hash_idx').on(t.folderId, t.hash),
    index('commits_project_idx').on(t.projectId, t.committedAt),
  ],
)

export const codeTodos = sqliteTable(
  'code_todos',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    folderId: text('folder_id')
      .notNull()
      .references(() => projectFolders.id, { onDelete: 'cascade' }),
    /** Kimlik: yol + etiket + metin (`domain/scan.todoKeys`); satır numarası kod kaydıkça değişir. */
    key: text('key').notNull(),
    path: text('path').notNull(),
    line: integer('line').notNull(),
    tag: text('tag', { enum: ['TODO', 'FIXME', 'HACK'] }).notNull(),
    text: text('text').notNull(),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    /** Dolu = son taramada kayboldu (çözüldü). Yeniden görünürse boşalır. */
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    /** Göreve çevrildiyse (5c). */
    taskId: text('task_id'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('code_todos_folder_key_idx').on(t.folderId, t.key),
    index('code_todos_project_idx').on(t.projectId, t.resolvedAt),
  ],
)

export const scanSnapshots = sqliteTable(
  'scan_snapshots',
  {
    id: id(),
    folderId: text('folder_id')
      .notNull()
      .references(() => projectFolders.id, { onDelete: 'cascade' }),
    scannedAt: integer('scanned_at', { mode: 'timestamp_ms' }).notNull(),
    /** Commit'lenmemişler, Unity sürümü, sahneler, yapı sahneleri, script sayısı, sonuç sayıları. */
    summaryJson: text('summary_json').notNull(),
    /** Git'siz klasörde yol → {size, mtime, hash}; git'li klasörde null. */
    inventoryJson: text('inventory_json'),
    ...timestamps(),
  },
  (t) => [index('scan_snapshots_folder_idx').on(t.folderId, t.scannedAt)],
)
