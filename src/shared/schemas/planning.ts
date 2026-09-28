import { z } from 'zod'

// Görev, hatırlatma ve rutin kanallarının şemaları. Sözleşme `ipc.ts`'te.

/** Yerel takvim günü. */
export const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gün YYYY-MM-DD olmalı')
/** 'HH:mm', 24 saat. */
export const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Saat SS:DD olmalı')
/** ISO hafta günü: 1 = Pazartesi … 7 = Pazar. */
export const isoDaySchema = z.number().int().min(1).max(7)
const isoDaysSchema = z
  .array(isoDaySchema)
  .min(1, 'En az bir gün seç')
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b))

export const TASK_TITLE_MAX = 300
export const taskPrioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)])
export const taskStatusSchema = z.enum(['open', 'done'])
const estimateSchema = z
  .number()
  .int()
  .min(5)
  .max(24 * 60)

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  estimateMin: z.number().nullable(),
  dueDate: dayKeySchema.nullable(),
  plannedDate: dayKeySchema.nullable(),
  postponeCount: z.number(),
  /** Unix ms. */
  completedAt: z.number().nullable(),
  createdAt: z.number(),
})

const taskFields = {
  title: z.string().trim().min(1, 'Başlık boş').max(TASK_TITLE_MAX),
  notes: z.string().max(20_000),
  priority: taskPrioritySchema,
  estimateMin: estimateSchema.nullable(),
  dueDate: dayKeySchema.nullable(),
  plannedDate: dayKeySchema.nullable(),
}

export const taskCreateInputSchema = z.object({
  ...taskFields,
  notes: taskFields.notes.optional(),
  priority: taskFields.priority.optional(),
  estimateMin: taskFields.estimateMin.optional(),
  dueDate: taskFields.dueDate.optional(),
  plannedDate: taskFields.plannedDate.optional(),
})

export const taskUpdateInputSchema = z
  .object({ id: z.string() })
  .extend(z.object(taskFields).partial().shape)

export const taskListInputSchema = z.object({ status: taskStatusSchema })

/** Tekrar kuralı. Haftalık (her gün = 7 gün), aylık (gün yoksa ayın son günü), yıllık (29 Şubat → 28). */
export const reminderRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('weekly'), days: isoDaysSchema, time: clockSchema }),
  z.object({ kind: z.literal('monthly'), day: z.number().int().min(1).max(31), time: clockSchema }),
  z.object({
    kind: z.literal('yearly'),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    time: clockSchema,
  }),
])

export const REMINDER_TITLE_MAX = 300

export const reminderSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Sıradaki çalma, unix ms. */
  at: z.number(),
  rule: reminderRuleSchema.nullable(),
  firedAt: z.number().nullable(),
  /** Doluysa kaçırıldı ve henüz ele alınmadı. */
  missedAt: z.number().nullable(),
})

const reminderTitle = z.string().trim().min(1, 'Başlık boş').max(REMINDER_TITLE_MAX)

/** Tek seferlik: `at`. Tekrarlayan: `rule` (ilk çalma kuraldan hesaplanır). */
export const reminderCreateInputSchema = z
  .object({ title: reminderTitle, at: z.number().optional(), rule: reminderRuleSchema.nullish() })
  .refine((r) => r.rule || r.at !== undefined, 'Zaman ya da tekrar gerekli')

export const reminderUpdateInputSchema = z.object({
  id: z.string(),
  title: reminderTitle.optional(),
  at: z.number().optional(),
  rule: reminderRuleSchema.nullish(),
})

export const reminderResolveInputSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  /** 'today': her biri bugün yapılacak göreve dönüşür. 'dismiss': sadece kapatılır. */
  action: z.enum(['today', 'dismiss']),
})

export const routineSchema = z.object({
  id: z.string(),
  title: z.string(),
  days: z.array(isoDaySchema),
  startTime: clockSchema,
  durationMin: z.number(),
  active: z.boolean(),
})

const routineFields = {
  title: z.string().trim().min(1, 'Ad boş').max(120),
  days: isoDaysSchema,
  startTime: clockSchema,
  durationMin: z
    .number()
    .int()
    .min(5)
    .max(12 * 60),
  active: z.boolean(),
}

export const routineCreateInputSchema = z.object({
  ...routineFields,
  active: routineFields.active.optional(),
})

export const routineUpdateInputSchema = z
  .object({ id: z.string() })
  .extend(z.object(routineFields).partial().shape)

export type DayKey = z.infer<typeof dayKeySchema>
export type TaskPriority = z.infer<typeof taskPrioritySchema>
export type TaskStatus = z.infer<typeof taskStatusSchema>
export type Task = z.infer<typeof taskSchema>
export type TaskCreateInput = z.input<typeof taskCreateInputSchema>
export type TaskUpdateInput = z.input<typeof taskUpdateInputSchema>
export type ReminderRule = z.infer<typeof reminderRuleSchema>
export type Reminder = z.infer<typeof reminderSchema>
export type ReminderCreateInput = z.input<typeof reminderCreateInputSchema>
export type ReminderUpdateInput = z.input<typeof reminderUpdateInputSchema>
export type ReminderResolveInput = z.input<typeof reminderResolveInputSchema>
export type Routine = z.infer<typeof routineSchema>
export type RoutineCreateInput = z.input<typeof routineCreateInputSchema>
export type RoutineUpdateInput = z.input<typeof routineUpdateInputSchema>
