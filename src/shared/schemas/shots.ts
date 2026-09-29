import { z } from 'zod'
import { dayKeySchema } from './planning'

// Zaman makinesi ve varlıklar (Aşama 5d-4, PROJELER.md > 6. Varlıklar). Sözleşme `ipc.ts`'te.

export const ASSET_BYTES_MAX = 100 * 1024 * 1024
export const ASSET_TITLE_MAX = 200

/** Proje klasöründeki dosyaları kopyalamadan gösteren salt okunur protokol. */
export const PROJECT_FILE_URL = 'sm-file://f/'

export const shotSchema = z.object({
  id: z.string(),
  url: z.string(),
  takenOn: dayKeySchema,
  takenAt: z.number(),
  source: z.enum(['editor', 'folder', 'session']),
  starred: z.boolean(),
  /** O günün en çok dosya değiştiren alanı (commit'lerden); yoksa null. */
  area: z.string().nullable(),
})

export const imageDirSchema = z.object({
  folderId: z.string(),
  /** Klasöre göre göreli, '/' ayraçlı. */
  path: z.string(),
  images: z.number(),
})

export const timeMachineSchema = z.object({
  /** En yeni önce. */
  shots: z.array(shotSchema),
  bound: z.array(imageDirSchema),
  suggestions: z.array(imageDirSchema),
  hasFolder: z.boolean(),
})

export const assetSchema = z.object({
  /** Klasör dosyasında `file:<yol>`. */
  id: z.string(),
  title: z.string(),
  kind: z.enum(['image', 'audio', 'pdf', 'other']),
  url: z.string(),
  /** Klasör taramasından gelen, kopyalanmamış dosya (salt okunur, silinmez). */
  external: z.boolean(),
  docId: z.string().nullable(),
  taskId: z.string().nullable(),
  createdAt: z.number(),
})

export const assetAddInputSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(260),
  mime: z.string().max(200),
  bytes: z
    .instanceof(Uint8Array)
    .refine((b) => b.byteLength > 0, 'Boş dosya')
    .refine((b) => b.byteLength <= ASSET_BYTES_MAX, 'Dosya 100 MB sınırını aşıyor'),
})

export const shotAddInputSchema = z.object({
  projectId: z.string(),
  /** Oturum kapanışında yapıştırıldıysa oturum. */
  sessionId: z.string().optional(),
  name: z.string().max(260),
  mime: z.string().refine((m) => m.startsWith('image/'), 'Sadece resim'),
  bytes: assetAddInputSchema.shape.bytes,
})

export type Shot = z.infer<typeof shotSchema>
export type ImageDir = z.infer<typeof imageDirSchema>
export type TimeMachine = z.infer<typeof timeMachineSchema>
export type Asset = z.infer<typeof assetSchema>
export type AssetAddInput = z.input<typeof assetAddInputSchema>
export type ShotAddInput = z.input<typeof shotAddInputSchema>
