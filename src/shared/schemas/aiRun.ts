import { z } from 'zod'

// "AI ile İşle" çalıştırmasının durumu (Döküm, üst çubuk). Ana süreç tutar; `ai:changed` olayıyla renderer yeniden sorar.

export const aiModelSchema = z.enum(['fast', 'deep'])

export const aiProcessInputSchema = z.object({ model: aiModelSchema })

export const aiRunSchema = z.object({
  /** Her "AI ile İşle" basışı yeni bir çalıştırma; toast bir kez gösterilsin diye kimlik. */
  runId: z.string(),
  /** İstenen model; ekli dökümler HIZLI'da da DERİN'e gider. */
  model: aiModelSchema,
  /** Çalıştırmaya giren döküm sayısı. */
  total: z.number(),
  /** İşi bitmiş (başarılı ya da değil) döküm sayısı. */
  done: z.number(),
  /** Şu anki işin modeli ve aşaması ("Qwen yazıyor"). */
  current: z
    .object({ model: aiModelSchema, message: z.string(), ratio: z.number().nullable() })
    .nullable(),
  cancelling: z.boolean(),
})

export const aiRunResultSchema = z.object({
  runId: z.string(),
  /** Unix ms. */
  finishedAt: z.number(),
  proposals: z.number(),
  /** Atlanan (AI'ın gerekçeyle bıraktığı) döküm. */
  skipped: z.number(),
  cancelled: z.boolean(),
  /** Başarısız işlerin hataları ("Yerel model indirilmemiş"...). */
  errors: z.array(z.string()),
})

export const aiStatusSchema = z.object({
  running: aiRunSchema.nullable(),
  /** Uygulama açıldığından beri son biten çalıştırma. */
  last: aiRunResultSchema.nullable(),
})

export type AiModel = z.infer<typeof aiModelSchema>
export type AiRun = z.infer<typeof aiRunSchema>
export type AiRunResult = z.infer<typeof aiRunResultSchema>
export type AiStatus = z.infer<typeof aiStatusSchema>
