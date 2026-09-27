import { z } from 'zod'
import { attachmentInputSchema } from './dump'

// Bilgi kanallarının şemaları: koleksiyon, etiket, not, arama.

export const COLLECTION_NAME_MAX = 60
export const NOTE_TITLE_MAX = 300
export const NOTE_BODY_MAX = 1_000_000
export const NOTE_TAGS_MAX = 30

const collectionName = z.string().trim().min(1, 'Ad boş olamaz').max(COLLECTION_NAME_MAX)

export const collectionSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  noteCount: z.number(),
})

export const collectionCreateInputSchema = z.object({ name: collectionName })
export const collectionRenameInputSchema = z.object({ id: z.string(), name: collectionName })

/** keepNotes: notlar koleksiyonsuz kalır. withNotes: notlar da çöp kutusuna gider. */
export const collectionDeleteModeSchema = z.enum(['keepNotes', 'withNotes'])
export const collectionDeleteInputSchema = z.object({
  id: z.string(),
  mode: collectionDeleteModeSchema,
})

export const tagSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  noteCount: z.number(),
})

export const noteListInputSchema = z.object({
  /** Koleksiyon id'si ya da 'none' (koleksiyonsuz). Verilmezse tümü. */
  collectionId: z.string().optional(),
  tagId: z.string().optional(),
  pinned: z.boolean().optional(),
})

export const noteSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Markdown'dan arındırılmış kısa metin. */
  preview: z.string(),
  /** Gövdedeki ilk resim. */
  coverUrl: z.string().nullable(),
  tags: z.array(z.string()),
  pinned: z.boolean(),
  /** Unix ms. */
  updatedAt: z.number(),
})

export const noteSchema = z.object({
  id: z.string(),
  title: z.string(),
  bodyMd: z.string(),
  collectionId: z.string().nullable(),
  projectId: z.string().nullable(),
  courseId: z.string().nullable(),
  weekId: z.string().nullable(),
  pinned: z.boolean(),
  aiExcluded: z.boolean(),
  tags: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const noteCreateInputSchema = z.object({ collectionId: z.string().nullable().optional() })

export const noteUpdateInputSchema = z.object({
  id: z.string(),
  title: z.string().max(NOTE_TITLE_MAX).optional(),
  bodyMd: z.string().max(NOTE_BODY_MAX).optional(),
  collectionId: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  aiExcluded: z.boolean().optional(),
  tags: z.array(z.string().max(100)).max(NOTE_TAGS_MAX).optional(),
})

export const noteSearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  snippet: z.string(),
  /** `snippet` içinde vurgulanacak [başlangıç, bitiş) aralıkları. */
  ranges: z.array(z.tuple([z.number(), z.number()])),
})

export const mediaStoreInputSchema = attachmentInputSchema.refine(
  (a) => a.mime.startsWith('image/'),
  'Sadece resim',
)

export type CollectionSummary = z.infer<typeof collectionSummarySchema>
export type CollectionDeleteMode = z.infer<typeof collectionDeleteModeSchema>
export type TagSummary = z.infer<typeof tagSummarySchema>
export type NoteListInput = z.infer<typeof noteListInputSchema>
export type NoteSummary = z.infer<typeof noteSummarySchema>
export type Note = z.infer<typeof noteSchema>
export type NoteUpdateInput = z.input<typeof noteUpdateInputSchema>
export type NoteSearchResult = z.infer<typeof noteSearchResultSchema>
