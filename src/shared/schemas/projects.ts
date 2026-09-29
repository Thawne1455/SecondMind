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
  /** Oturumda değişen dosyalar ve alanları (Claude Code kaydından, 5b). */
  files: z.array(z.object({ path: z.string(), area: z.string() })),
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
  /** Bağlı klasörlerin en son taranma anı (Unix ms); hiç taranmadıysa null. */
  lastScanAt: z.number().nullable(),
  /** Son 8 haftanın commit sayısı ve oturum dakikası, en eski önce (şerit aktivite çubukları). */
  weeks: z.array(z.object({ commits: z.number(), minutes: z.number() })),
  /** Sıradaki adım motorunun 1. adımı (şerit); yoksa null. */
  topStep: z
    .object({ title: z.string(), reason: z.string(), taskId: z.string().nullable() })
    .nullable(),
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
  /** Göreve çevirirken taşa bağla (Yol haritasının park sütunu). */
  milestoneId: z.string().nullish(),
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

/** Güncelle / Tara sonucu (Aşama 5b). Proje başına sayılar; bir klasör hata verirse errors'a düşer, tarama sürer. */
export const scanReportSchema = z.object({
  folders: z.number(),
  projects: z.array(
    z.object({
      projectId: z.string(),
      name: z.string(),
      firstScan: z.boolean(),
      newCommits: z.number(),
      uncommitted: z.number(),
      todosAdded: z.number(),
      todosResolved: z.number(),
      filesChanged: z.number(),
      claudeSessions: z.number(),
      errors: z.array(z.string()),
    }),
  ),
  /** Değişiklik yoksa null. */
  toast: z.string().nullable(),
})
export type ScanReport = z.infer<typeof scanReportSchema>

/** Geri dönüş brifingi (`project:opened` döner; 3 günden kısa aradaysa null). Metni renderer kurar. */
export const briefingSchema = z.object({
  daysAway: z.number(),
  lastSession: z
    .object({ endedAt: z.number(), minutes: z.number(), leftOff: z.string() })
    .nullable(),
  commits: z.array(z.object({ message: z.string(), committedAt: z.number() })),
  commitCount: z.number(),
  commitAreas: z.array(z.tuple([z.string(), z.number()])),
  files: z.array(z.string()),
  uncommitted: z
    .object({ count: z.number(), oldestAt: z.number().nullable(), stale: z.boolean() })
    .nullable(),
  nextStep: z.string().nullable(),
  parkedSince: z.number(),
})
export type Briefing = z.infer<typeof briefingSchema>

/** Kokpit'in tarama karoları: Bu hafta ve Koddaki notlar. Klasörsüz ya da hiç taranmamışsa null. */
export const projectScanInfoSchema = z.object({
  lastScanAt: z.number(),
  week: z.object({
    commits: z.number(),
    /** Bu haftanın commit'lerindeki alan → dosya sayısı, kalabalık önce. */
    areas: z.array(z.tuple([z.string(), z.number()])),
  }),
  /** Not taranmayan türde (yaratıcı, genel) null. */
  todos: z
    .object({
      open: z.number(),
      byTag: z.object({ TODO: z.number(), FIXME: z.number(), HACK: z.number() }),
      /** Son taramada eklenen / çözülen; ilk taramada null. */
      added: z.number().nullable(),
      resolved: z.number().nullable(),
      /** En yeni açık notlar (en fazla 5). */
      recent: z.array(
        z.object({ path: z.string(), line: z.number(), tag: z.string(), text: z.string() }),
      ),
    })
    .nullable(),
  uncommitted: z.object({ count: z.number(), oldestAt: z.number().nullable() }).nullable(),
})
export type ProjectScanInfo = z.infer<typeof projectScanInfoSchema>

/** Sıradaki adım motorunun bir adımı (`domain/nextSteps`). Kokpit ilk 3'ü gösterir. */
export const nextStepSchema = z.object({
  kind: z.enum(['task', 'criterion', 'session', 'parking', 'commit']),
  id: z.string(),
  title: z.string(),
  taskId: z.string().optional(),
  score: z.number(),
  reasons: z.array(z.string()),
  reason: z.string(),
  suggestSplit: z.boolean(),
})
export type NextStep = z.infer<typeof nextStepSchema>

export const MILESTONE_TITLE_MAX = 80
export const MILESTONE_DESCRIPTION_MAX = 2000
export const CRITERION_TEXT_MAX = 200
export const CRITERIA_MAX = 40

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gün YYYY-MM-DD olmalı')

export const criterionSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
  taskId: z.string().nullable(),
})

/** Kilometre taşı (5c). Kriter bir göreve bağlıysa görev bitince işaretli sayılır. */
export const milestoneSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  targetDate: z.string().nullable(),
  sort: z.number(),
  criteria: z.array(criterionSchema),
  doneAt: z.number().nullable(),
  /** Unix ms; zaman çizelgesinde tarihli ilk taşın başlangıcı. */
  createdAt: z.number(),
})
export type Milestone = z.infer<typeof milestoneSchema>
export type Criterion = z.infer<typeof criterionSchema>

const milestoneTitle = z.string().trim().min(1, 'Ad boş').max(MILESTONE_TITLE_MAX)

export const milestoneCreateInputSchema = z.object({
  projectId: z.string(),
  title: milestoneTitle,
  targetDate: dayKey.nullish(),
})

/**
 * Kısmi güncelleme. `criteria` verilirse listenin tamamının yerine geçer; id'siz kriter yeni sayılır.
 * `done` taşı tamamlar ya da yeniden açar.
 */
export const milestoneUpdateInputSchema = z.object({
  id: z.string(),
  title: milestoneTitle.optional(),
  description: z.string().max(MILESTONE_DESCRIPTION_MAX).optional(),
  targetDate: dayKey.nullable().optional(),
  done: z.boolean().optional(),
  criteria: z
    .array(
      z.object({
        id: z.string().optional(),
        text: z.string().trim().min(1, 'Kriter boş').max(CRITERION_TEXT_MAX),
        done: z.boolean(),
        taskId: z.string().nullable(),
      }),
    )
    .max(CRITERIA_MAX)
    .optional(),
})
export type MilestoneCreateInput = z.input<typeof milestoneCreateInputSchema>
export type MilestoneUpdateInput = z.input<typeof milestoneUpdateInputSchema>

export const releasePlatformSchema = z.enum(['itch', 'steam'])
export type ReleasePlatform = z.infer<typeof releasePlatformSchema>

/** Taşın kapsam ölçeri ve gerçekçi bitiş tahmini (`domain/scope`). */
export const milestoneScopeSchema = z.object({
  milestoneId: z.string(),
  /** Son 8 hafta, en eski önce. */
  weeks: z.array(
    z.object({
      weekStart: z.string(),
      added: z.number(),
      done: z.number(),
      remaining: z.number(),
    }),
  ),
  trend: z.object({
    added: z.number(),
    done: z.number(),
    state: z.enum(['growing', 'closing', 'balanced']),
  }),
  finish: z.object({
    remainingMin: z.number(),
    dailyPace: z.number(),
    finishOn: z.string().nullable(),
    notFinishing: z.boolean(),
    late: z.boolean(),
  }),
  openTasks: z.number(),
  doneTasks: z.number(),
})
export type MilestoneScope = z.infer<typeof milestoneScopeSchema>

/** Proje takviminin bir öğesi: taş hedefi, son tarihli görev ya da planlanmış blok. */
export const calendarEntrySchema = z.object({
  day: z.string(),
  kind: z.enum(['milestone', 'due', 'block']),
  id: z.string(),
  title: z.string(),
  /** Blokta başlangıç dakikası; diğerlerinde null. */
  startMin: z.number().nullable(),
  /** Taş tamamlandı / görev bitti. */
  done: z.boolean(),
})
export type CalendarEntry = z.infer<typeof calendarEntrySchema>
