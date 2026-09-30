import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { id, timestamps } from './columns'

// AI akışı (Aşama 4, MIMARI.md "AI akışı"): bir "AI ile İşle" bir iş; işin ürettiği her geçerli işlem bir öneri.
// AI veritabanına yazmaz: öneri onaylanınca uygulayıcı yazar, `activity_log`'a `group_id` ile düşer ve geri alınabilir.

export const aiJobs = sqliteTable(
  'ai_jobs',
  {
    id: id(),
    kind: text('kind', { enum: ['dump', 'weekly_review', 'schedule_import'] }).notNull(),
    /** HIZLI = yerel Qwen, DERİN = Claude Code (docs/YEREL-LLM.md). */
    model: text('model', { enum: ['fast', 'deep'] }).notNull(),
    status: text('status', { enum: ['running', 'done', 'failed', 'cancelled'] })
      .notNull()
      .default('running'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    /** "5 döküm · 2 resim" gibi kısa özet. */
    inputSummary: text('input_summary').notNull().default(''),
    /** Ham çıktının iş klasöründeki yolu (`ai/jobs/<id>/cikti.json`). */
    outputPath: text('output_path'),
    error: text('error'),
    /** Doğrulamada reddedilen işlemlerin gerekçeleri (JSON dizi). */
    rejectedJson: text('rejected_json'),
    ...timestamps(),
  },
  (t) => [index('ai_jobs_started_idx').on(t.startedAt)],
)

export const proposals = sqliteTable(
  'proposals',
  {
    id: id(),
    jobId: text('job_id')
      .notNull()
      .references(() => aiJobs.id),
    op: text('op').notNull(),
    /** Doğrulanmış işlem (changesSchema'nın bir elemanı); düzenlenince güncellenir. */
    payloadJson: text('payload_json').notNull(),
    sourceDumpIdsJson: text('source_dump_ids_json').notNull().default('[]'),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'edited'] })
      .notNull()
      .default('pending'),
    /** Uygulandığında `activity_log.group_id`: geri alma bu grupla yapılır. */
    groupId: text('group_id'),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
    /** Onaylanıp sonra geri alındı. */
    undoneAt: integer('undone_at', { mode: 'timestamp_ms' }),
    sort: integer('sort').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('proposals_job_idx').on(t.jobId, t.sort), index('proposals_status_idx').on(t.status)],
)
