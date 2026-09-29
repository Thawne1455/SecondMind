import { z } from 'zod'

// Proje dokümantasyonu (Aşama 5d-1, PROJELER.md > 4. Dokümantasyon). Sözleşme `ipc.ts`'te.

export const DOC_TITLE_MAX = 200
export const DOC_BODY_MAX = 500_000

export const docKindSchema = z.enum(['page', 'adr', 'gdd'])

export const docSummarySchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  sort: z.number(),
  title: z.string(),
  kind: docKindSchema,
  /** Bağlı dosya: klasöre göre göreli yol (gösterim). null = SecondMind sayfası. */
  linkedPath: z.string().nullable(),
  aiOpen: z.boolean(),
  updatedAt: z.number(),
})

export const docSchema = docSummarySchema.extend({
  bodyMd: z.string(),
  /** Bağlı dosya salt okunur. */
  readOnly: z.boolean(),
  /** Bağlı dosya diskte yok (taşınmış / silinmiş). */
  missing: z.boolean(),
})

export const docCreateInputSchema = z.object({
  projectId: z.string(),
  /** Verilmezse kök (ADR'de "Kararlar" sayfası). */
  parentId: z.string().nullish(),
  title: z.string().trim().max(DOC_TITLE_MAX).default(''),
  kind: z.enum(['page', 'adr']).default('page'),
})

/** Kısmi güncelleme. `kind: 'gdd'` projenin önceki GDD işaretini kaldırır. Bağlı dosyada gövde yazılmaz. */
export const docUpdateInputSchema = z.object({
  id: z.string(),
  title: z.string().max(DOC_TITLE_MAX).optional(),
  bodyMd: z.string().max(DOC_BODY_MAX).optional(),
  kind: docKindSchema.optional(),
  aiOpen: z.boolean().optional(),
})

/** Ağaçta taşı: yeni üst ve kardeşler arasındaki sıra. */
export const docMoveInputSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  index: z.number().int().min(0),
})

export const docFileSuggestionSchema = z.object({
  /** Mutlak yol. */
  path: z.string(),
  /** Klasöre göre göreli. */
  relative: z.string(),
  gdd: z.boolean(),
})

export const docSearchResultSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  snippet: z.string(),
  ranges: z.array(z.tuple([z.number(), z.number()])),
})

export type DocKind = z.infer<typeof docKindSchema>
export type DocSummary = z.infer<typeof docSummarySchema>
export type Doc = z.infer<typeof docSchema>
export type DocCreateInput = z.input<typeof docCreateInputSchema>
export type DocUpdateInput = z.input<typeof docUpdateInputSchema>
export type DocMoveInput = z.infer<typeof docMoveInputSchema>
export type DocFileSuggestion = z.infer<typeof docFileSuggestionSchema>
export type DocSearchResult = z.infer<typeof docSearchResultSchema>

// ---------------------------------------------------------------- GDD ile gerçeklik (5d-2)

export const countRuleSchema = z.object({
  label: z.string().trim().min(1).max(80),
  /** Proje klasörüne göre glob ("Assets/Data/Weapons/*.asset"). */
  glob: z.string().trim().min(1).max(300),
})

export const gddComparisonSchema = z.object({
  docId: z.string(),
  hasFolder: z.boolean(),
  /** Eksik önce, sonra fazla, bilinmeyen, eşit. */
  rows: z.array(
    z.object({
      label: z.string(),
      gdd: z.number(),
      folder: z.number().nullable(),
      via: z
        .discriminatedUnion('kind', [
          z.object({ kind: z.literal('builtin'), builtin: z.enum(['scenes', 'audio', 'scripts']) }),
          z.object({ kind: z.literal('rule'), glob: z.string() }),
        ])
        .nullable(),
      state: z.enum(['missing', 'extra', 'equal', 'unknown']),
      /** "GDD'de 12 parça, klasörde 7" */
      text: z.string(),
    }),
  ),
  /** Bilinmeyen satırlar için klasör adından kural önerisi ve o globun sayısı. */
  suggestions: z.array(countRuleSchema.extend({ count: z.number() })),
})

export type CountRule = z.infer<typeof countRuleSchema>
export type GddComparison = z.infer<typeof gddComparisonSchema>
