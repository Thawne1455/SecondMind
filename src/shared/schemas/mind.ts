import { z } from 'zod'
import { dayKeySchema } from './planning'

// Zihin kanallarının şemaları (Aşama 3c: günlük kayıt ve haftanın başarıları). Sözleşme `ipc.ts`'te.

export const scaleSchema = z.number().int().min(1).max(5)
/** Uyku en fazla 16 saat. */
export const SLEEP_MAX_MIN = 16 * 60
export const CHECKIN_NOTE_MAX = 300

export const checkinSchema = z.object({
  day: dayKeySchema,
  mood: scaleSchema.nullable(),
  energy: scaleSchema.nullable(),
  /** Uyku süresi (dk). */
  sleepMin: z.number().nullable(),
  note: z.string(),
})

/** Bugünün kaydı; verilen alanlar yazılır, null alanı boşaltır. */
export const checkinSetInputSchema = z
  .object({
    mood: scaleSchema.nullable(),
    energy: scaleSchema.nullable(),
    sleepMin: z.number().int().min(0).max(SLEEP_MAX_MIN).nullable(),
    note: z.string().trim().max(CHECKIN_NOTE_MAX),
  })
  .partial()
  .refine((c) => Object.keys(c).length > 0, 'Kayıt boş')

/** Bu hafta (Pazartesi'den) ve bugün tamamlananlar. Commit Aşama 5'te, quiz Aşama 6'da eklenir. */
export const weekAchievementsSchema = z.object({
  tasksWeek: z.number(),
  tasksToday: z.number(),
})

export type Checkin = z.infer<typeof checkinSchema>
export type CheckinSetInput = z.input<typeof checkinSetInputSchema>
export type WeekAchievements = z.infer<typeof weekAchievementsSchema>
