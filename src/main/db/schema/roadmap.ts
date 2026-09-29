import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { deletedAt, id, timestamps } from './columns'
import { projects } from './projects'

// Proje planlaması (Aşama 5c): kilometre taşları ve playtest kutusu. Görev ekleri `planning.ts` > tasks.

export const milestones = sqliteTable(
  'milestones',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    /** Hedef gün 'YYYY-MM-DD'; null = tarihsiz. */
    targetDate: text('target_date'),
    sort: integer('sort').notNull().default(0),
    /** Çıkış kriterleri JSON: `[{id, text, done, taskId}]`. */
    criteriaJson: text('criteria_json').notNull().default('[]'),
    doneAt: integer('done_at', { mode: 'timestamp_ms' }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('milestones_project_idx').on(t.projectId, t.sort)],
)

export const playtestFeedback = sqliteTable(
  'playtest_feedback',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    tester: text('tester').notNull(),
    /** Gün 'YYYY-MM-DD'. */
    receivedOn: text('received_on').notNull(),
    rawText: text('raw_text').notNull(),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('playtest_feedback_project_idx').on(t.projectId, t.receivedOn)],
)

export const playtestClusters = sqliteTable(
  'playtest_clusters',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    label: text('label').notNull().default(''),
    /** Hataya/göreve çevrildiyse görev id'si. */
    taskId: text('task_id'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('playtest_clusters_project_idx').on(t.projectId)],
)

export const playtestPoints = sqliteTable(
  'playtest_points',
  {
    id: id(),
    feedbackId: text('feedback_id')
      .notNull()
      .references(() => playtestFeedback.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    /** Hesaplanmış kök kümesi, boşlukla ayrılmış. */
    stems: text('stems').notNull(),
    clusterId: text('cluster_id'),
    /** Taha elle yerleştirdi: algoritma bir daha dokunmaz. */
    locked: integer('locked', { mode: 'boolean' })
      .notNull()
      .default(sql`0`),
    ...timestamps(),
  },
  (t) => [
    index('playtest_points_feedback_idx').on(t.feedbackId),
    index('playtest_points_cluster_idx').on(t.clusterId),
  ],
)
