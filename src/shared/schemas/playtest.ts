import { z } from 'zod'
import { dayKeySchema, taskKindSchema, kanbanStatusSchema } from './planning'

// Playtest kutusu (Aşama 5c-4, PROJELER.md > Playtest kutusu). Sözleşme `ipc.ts`'te.

export const PLAYTEST_TEXT_MAX = 50_000
export const TESTER_NAME_MAX = 40

export const playtestPointSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** Boş = kişisi bilinmiyor. */
  tester: z.string(),
  receivedOn: dayKeySchema,
  /** Taha elle yerleştirdi: algoritma dokunmaz. */
  locked: z.boolean(),
})

export const playtestClusterSchema = z.object({
  id: z.string(),
  /** Kümenin en kısa noktası. */
  title: z.string(),
  /** Kümedeki farklı kişi. */
  people: z.number(),
  /** Son 30 günün farklı test edenleri (payda). */
  of: z.number(),
  /** "5 kişiden 3'ü" */
  countLabel: z.string(),
  /** Hataya / göreve çevrildiyse görev. */
  task: z
    .object({
      id: z.string(),
      title: z.string(),
      kind: taskKindSchema,
      kanbanStatus: kanbanStatusSchema.nullable(),
    })
    .nullable(),
  /** En yeni önce. */
  points: z.array(playtestPointSchema),
  /** Son noktanın günü. */
  lastOn: dayKeySchema,
})

/** Kümeler kişi sayısına, sonra nokta sayısına, sonra yeniliğe göre sıralı. */
export const playtestOverviewSchema = z.object({
  /** Son 30 günün farklı test edenleri, en yeni önce. */
  testers: z.array(z.string()),
  clusters: z.array(playtestClusterSchema),
})

export const playtestPasteInputSchema = z.object({
  projectId: z.string(),
  text: z.string().trim().min(1, 'Metin boş').max(PLAYTEST_TEXT_MAX),
  /** Sohbet kalıbı tanınmayan satırların kişisi. */
  tester: z.string().trim().max(TESTER_NAME_MAX).default(''),
  receivedOn: dayKeySchema,
})

export const playtestPreviewSchema = z.object({
  /** Metinden tanınan kişiler, geliş sırasıyla. */
  testers: z.array(z.string()),
  points: z.number(),
  /** Sohbet kalıbı tanınmayan (Kim alanını kullanacak) girdi var mı. */
  needsTester: z.boolean(),
})

/** Her yazım tek grupla loglanır; `playtest:undo` bu grubu geri alır. */
export const playtestWriteSchema = z.object({ groupId: z.string() })

export type PlaytestPoint = z.infer<typeof playtestPointSchema>
export type PlaytestCluster = z.infer<typeof playtestClusterSchema>
export type PlaytestOverview = z.infer<typeof playtestOverviewSchema>
export type PlaytestPasteInput = z.input<typeof playtestPasteInputSchema>
export type PlaytestPreview = z.infer<typeof playtestPreviewSchema>
