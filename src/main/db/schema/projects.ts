import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { deletedAt, id, timestamps } from './columns'

// Projeler (Aşama 5a): proje, bağlı klasör, oturum, park alanı. Ayrıntı docs/PROJELER.md.
// `tasks.project_id` / `reminders.project_id` / `ideas.project_id` için FK eklenmez (SQLite tabloyu
// yeniden kurmak ister); bütünlük sorgu katmanında.

export const projects = sqliteTable(
  'projects',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['unity', 'software', 'creative', 'general'] }).notNull(),
    /** Proje paleti rengi (`#RRGGBB`). */
    color: text('color').notNull(),
    status: text('status', { enum: ['active', 'paused', 'archived'] })
      .notNull()
      .default('active'),
    /** Sıradaki ilk somut adım; oturum kapanışı yazar. */
    nextStep: text('next_step').notNull().default(''),
    description: text('description').notNull().default(''),
    /** Yayın platformu (5c şablonu); null = seçilmedi. */
    releasePlatform: text('release_platform', { enum: ['steam', 'itch'] }),
    /** GDD sayım kuralları (5d): `[{label, glob}]`; null = hiç kural yok. */
    countRulesJson: text('count_rules_json'),
    /** Detay sayfası açıldı; sıralama ve geri dönüş brifingi için. Log'a yazılmaz. */
    lastOpenedAt: integer('last_opened_at', { mode: 'timestamp_ms' }),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('projects_name_live_idx')
      .on(t.name)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
)

export const projectFolders = sqliteTable(
  'project_folders',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    /** Mutlak yol, Windows biçiminde. */
    path: text('path').notNull(),
    /** Alan kuralları JSON; null = türün varsayılanı (5b). */
    areaRulesJson: text('area_rules_json'),
    bridgeEnabled: integer('bridge_enabled', { mode: 'boolean' })
      .notNull()
      .default(sql`0`),
    lastScanAt: integer('last_scan_at', { mode: 'timestamp_ms' }),
    /** Zaman makinesi görüntü klasörleri (5d): klasöre göre göreli yollar JSON dizisi; null = bağlı yok. */
    imageDirsJson: text('image_dirs_json'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('project_folders_path_idx').on(t.path),
    index('project_folders_project_idx').on(t.projectId),
  ],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    /** Oturum bir görevle başladıysa. */
    taskId: text('task_id'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    /** null = sürüyor. Aynı anda en fazla bir açık oturum (sorgu katmanı sağlar). */
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    leftOff: text('left_off').notNull().default(''),
    nextStep: text('next_step').notNull().default(''),
    source: text('source', { enum: ['taha', 'claude_code'] })
      .notNull()
      .default('taha'),
    /** Claude Code oturum id'si (5b). */
    externalId: text('external_id'),
    /** Değişen dosyalar + alan (5b). */
    filesJson: text('files_json'),
    /** Kapanışta yapıştırılan görüntü (5d, zaman makinesi). */
    shotMediaId: text('shot_media_id'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('sessions_project_idx').on(t.projectId, t.startedAt),
    uniqueIndex('sessions_external_idx').on(t.externalId),
  ],
)

export const parking = sqliteTable(
  'parking',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    text: text('text').notNull(),
    source: text('source', { enum: ['shortcut', 'app', 'dump', 'bridge'] })
      .notNull()
      .default('app'),
    status: text('status', { enum: ['waiting', 'converted', 'dismissed'] })
      .notNull()
      .default('waiting'),
    /** Göreve çevrildiyse görev id'si. */
    taskId: text('task_id'),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('parking_project_idx').on(t.projectId, t.status)],
)
