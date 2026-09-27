import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { deletedAt, id, timestamps } from './columns'
import { media } from './media'

/** Döküm kuyruğundaki ham öğe. Bir döküm = bir gönderim (metin + sıfır ya da daha çok ek). */
export const dumpItems = sqliteTable(
  'dump_items',
  {
    id: id(),
    kind: text('kind', { enum: ['text', 'image', 'file'] }).notNull(),
    content: text('content').notNull().default(''),
    status: text('status', { enum: ['pending', 'processing', 'processed', 'skipped'] })
      .notNull()
      .default('pending'),
    // ai_jobs Aşama 4'te; foreign key o zaman eklenir.
    jobId: text('job_id'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('dump_items_queue_idx').on(t.status, t.deletedAt, t.createdAt)],
)

export const dumpAttachments = sqliteTable(
  'dump_attachments',
  {
    dumpId: text('dump_id')
      .notNull()
      .references(() => dumpItems.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id),
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.dumpId, t.mediaId] })],
)
