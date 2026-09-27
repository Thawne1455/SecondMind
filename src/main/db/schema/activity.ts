import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { id, timestamps } from './columns'

/**
 * Her uygulanan değişikliğin kaydı; geri alma buradan yapılır.
 * `before_json` / `after_json`: satırın değişiklikten önceki ve sonraki hali (JSON).
 */
export const activityLog = sqliteTable(
  'activity_log',
  {
    id: id(),
    actor: text('actor', { enum: ['taha', 'ai', 'scan'] }).notNull(),
    action: text('action', { enum: ['create', 'update', 'delete', 'restore'] }).notNull(),
    targetTable: text('target_table').notNull(),
    targetId: text('target_id').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    // Birlikte uygulanan işlemler (Aşama 4: "tümünü onayla") aynı grubu paylaşır.
    groupId: text('group_id'),
    undoneAt: integer('undone_at', { mode: 'timestamp_ms' }),
    ...timestamps(),
  },
  (t) => [index('activity_log_target_idx').on(t.targetTable, t.targetId)],
)
