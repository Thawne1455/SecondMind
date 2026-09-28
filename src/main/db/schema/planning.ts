import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { deletedAt, id, timestamps } from './columns'

// Görevler, hatırlatmalar, rutinler (Aşama 3). Gün alanları yerel takvim günü: 'YYYY-MM-DD'.
// Proje ve ders tabloları Aşama 5/6'da; `project_id` / `course_id` için foreign key o zaman.

export const tasks = sqliteTable(
  'tasks',
  {
    id: id(),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    status: text('status', { enum: ['open', 'done'] })
      .notNull()
      .default('open'),
    /** 1 düşük, 2 normal, 3 yüksek. */
    priority: integer('priority').notNull().default(2),
    estimateMin: integer('estimate_min'),
    /** Son tarih (gün). */
    dueDate: text('due_date'),
    /** Yapılacağı gün. Bugün ya da geçmiş = "bugüne alınmış"; ileri tarih = o gün Bugün'e düşer. */
    plannedDate: text('planned_date'),
    postponeCount: integer('postpone_count').notNull().default(0),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    kind: text('kind', { enum: ['task', 'bug', 'research'] })
      .notNull()
      .default('task'),
    projectId: text('project_id'),
    courseId: text('course_id'),
    milestoneId: text('milestone_id'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('tasks_status_idx').on(t.status, t.plannedDate),
    index('tasks_completed_idx').on(t.completedAt),
  ],
)

export const reminders = sqliteTable(
  'reminders',
  {
    id: id(),
    title: text('title').notNull(),
    /** Sıradaki (bekleyen) çalma anı. Tekrarlayanda her çalıştan sonra ileri alınır. */
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
    /** Tekrar kuralı JSON (`reminderRuleSchema`); null = tek seferlik. */
    ruleJson: text('rule_json'),
    /** Son çalma (ya da kaçırılanın ele alınma) anı. Tek seferlikte dolu = bitti. */
    firedAt: integer('fired_at', { mode: 'timestamp_ms' }),
    /** Kaçırılan çalma anı; Taha ele alana (Bugüne al / Kapat) kadar dolu kalır. */
    missedAt: integer('missed_at', { mode: 'timestamp_ms' }),
    projectId: text('project_id'),
    courseId: text('course_id'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('reminders_at_idx').on(t.at)],
)

export const routines = sqliteTable('routines', {
  id: id(),
  title: text('title').notNull(),
  /** ISO hafta günleri JSON dizisi: 1 = Pazartesi … 7 = Pazar. */
  daysJson: text('days_json').notNull(),
  /** 'HH:mm' */
  startTime: text('start_time').notNull(),
  durationMin: integer('duration_min').notNull(),
  active: integer('active', { mode: 'boolean' })
    .notNull()
    .default(sql`1`),
  ...timestamps(),
  deletedAt: deletedAt(),
})
