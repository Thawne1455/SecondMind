import { z } from 'zod'

// Proje, oturum ve park alanı kanallarının şemaları (Aşama 5a). Sözleşme `ipc.ts`'te.

export const projectKindSchema = z.enum(['unity', 'software', 'creative', 'general'])
export const projectStatusSchema = z.enum(['active', 'paused', 'archived'])
export const projectColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Renk #RRGGBB olmalı')

/**
 * Proje paleti. İlk üçü tasarımdaki projeler (Runika yeşil, SecondMind turuncu, Albüm pembe);
 * hepsinin üstünde metin #131316. Okul'un göğü, Bugün'ün indigosu ve uyarı mercanı bilerek yok.
 */
export const PROJECT_COLORS = [
  '#3BE08F',
  '#FF8A3D',
  '#F59BE6',
  '#FFD23F',
  '#9BE15D',
  '#C9A2FF',
  '#FF9F9F',
  '#5FE3D0',
] as const

export const PROJECT_NAME_MAX = 60
export const NEXT_STEP_MAX = 200
export const LEFT_OFF_MAX = 4000
export const PARKING_TEXT_MAX = 500

export const sessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  taskId: z.string().nullable(),
  /** Unix ms. */
  startedAt: z.number(),
  /** null = sürüyor. */
  endedAt: z.number().nullable(),
  leftOff: z.string(),
  nextStep: z.string(),
  source: z.enum(['taha', 'claude_code']),
})

export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: projectKindSchema,
  color: projectColorSchema,
  status: projectStatusSchema,
  nextStep: z.string(),
  description: z.string(),
  /** İlk bağlı klasör (5a'da proje başına bir klasör). */
  folderPath: z.string().nullable(),
  createdAt: z.number(),
  lastOpenedAt: z.number().nullable(),
  /** Son oturum ya da oluşturma anı (5b'de commit ve dosya değişikliği de girer). */
  lastActivityAt: z.number(),
  /** Takvim günü; 0 = bugün. */
  silentDays: z.number(),
  activeSession: sessionSchema.nullable(),
  /** Son kapanmış oturum. */
  lastSession: sessionSchema.nullable(),
  parkingWaiting: z.number(),
  openTasks: z.number(),
  /** Son 14 günün oturum dakikaları, en eski önce (son eleman bugün). */
  rhythm: z.array(z.number()),
  /** Bu hafta (Pazartesi'den) çalışılan dakika ve oturum sayısı. */
  weekMinutes: z.number(),
  weekSessions: z.number(),
})

const projectName = z.string().trim().min(1, 'Ad boş').max(PROJECT_NAME_MAX)

export const projectCreateInputSchema = z.object({
  name: projectName,
  kind: projectKindSchema,
  color: projectColorSchema,
  /** null = klasörsüz proje. */
  folderPath: z.string().min(1).nullable(),
})

export const projectUpdateInputSchema = z.object({
  id: z.string(),
  name: projectName.optional(),
  kind: projectKindSchema.optional(),
  color: projectColorSchema.optional(),
  status: projectStatusSchema.optional(),
  nextStep: z.string().trim().max(NEXT_STEP_MAX).optional(),
  description: z.string().max(2000).optional(),
})

/** Klasör seçilince tahmin edilenler; oluşturma ekranını doldurur. */
export const folderInspectionSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  name: z.string(),
  kind: projectKindSchema,
  unityVersion: z.string().nullable(),
  git: z.boolean(),
  /** Klasör başka bir canlı projeye bağlıysa o projenin adı. */
  takenBy: z.string().nullable(),
  /** Önerilen renk (paletteki ilk boş). */
  color: projectColorSchema,
})

export const sessionStartInputSchema = z.object({
  projectId: z.string(),
  taskId: z.string().nullish(),
})

export const sessionCloseInputSchema = z.object({
  id: z.string(),
  leftOff: z.string().trim().max(LEFT_OFF_MAX),
  nextStep: z.string().trim().min(1, 'Sıradaki adımı yaz').max(NEXT_STEP_MAX),
  /** Uzun açık kalan oturumda gerçek süre (dk); verilmezse şimdi biter. */
  durationMin: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
})

export const parkingItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  text: z.string(),
  source: z.enum(['shortcut', 'app', 'dump', 'bridge']),
  status: z.enum(['waiting', 'converted', 'dismissed']),
  taskId: z.string().nullable(),
  createdAt: z.number(),
  /** Süren oturum sırasında park edildi. */
  inActiveSession: z.boolean(),
})

export const parkingAddInputSchema = z.object({
  projectId: z.string(),
  text: z.string().trim().min(1, 'Boş').max(PARKING_TEXT_MAX),
  source: z.enum(['shortcut', 'app']).default('app'),
})

export const parkingResolveInputSchema = z.object({
  id: z.string(),
  action: z.enum(['convert', 'dismiss']),
})

export type ProjectKind = z.infer<typeof projectKindSchema>
export type ProjectStatus = z.infer<typeof projectStatusSchema>
export type Session = z.infer<typeof sessionSchema>
export type ProjectSummary = z.infer<typeof projectSummarySchema>
export type ProjectCreateInput = z.infer<typeof projectCreateInputSchema>
export type ProjectUpdateInput = z.infer<typeof projectUpdateInputSchema>
export type FolderInspection = z.infer<typeof folderInspectionSchema>
export type SessionStartInput = z.input<typeof sessionStartInputSchema>
export type SessionCloseInput = z.infer<typeof sessionCloseInputSchema>
export type ParkingItem = z.infer<typeof parkingItemSchema>
export type ParkingAddInput = z.input<typeof parkingAddInputSchema>
