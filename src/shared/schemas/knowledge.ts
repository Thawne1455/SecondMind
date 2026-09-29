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

// ---------------------------------------------------------------- fikirler

/** Saklanan durum. 'project' Aşama 5'te "Projeye çevir" ile gelir. */
export const ideaStatusSchema = z.enum(['incubating', 'active', 'project', 'archived'])
/** Görünen aşama: saklanan durum + zaman ('due' = kuluçka doldu, karar bekliyor). */
export const ideaStageSchema = z.enum(['incubating', 'due', 'active', 'project', 'archived'])

export const ideaStateSchema = z.object({
  status: ideaStatusSchema,
  stage: ideaStageSchema,
  /** Kuluçkanın bitmesine kalan takvim günü (kuluçkada değilse 0). */
  daysLeft: z.number(),
  /** Unix ms. */
  incubateUntil: z.number(),
  decidedAt: z.number().nullable(),
  lastOpenedAt: z.number().nullable(),
})

/** Taha'nın verebileceği durumlar. 'incubating' sadece geri alma içindir. */
export const ideaSetStatusInputSchema = z.object({
  noteId: z.string(),
  status: z.enum(['incubating', 'active', 'archived']),
})

export const ideaCardSchema = z.object({
  noteId: z.string(),
  title: z.string(),
  /** Karta göre: kuluçka dolalı / dolmasına kalan / sessiz geçen gün. */
  days: z.number(),
})

/** Bugün'deki kuluçka ve radar karolarının verisi. */
export const ideaTodaySchema = z.object({
  due: ideaCardSchema.nullable(),
  dueCount: z.number(),
  next: ideaCardSchema.nullable(),
  radar: ideaCardSchema.nullable(),
})

// ---------------------------------------------------------------- notlar

export const noteListInputSchema = z.object({
  /** Koleksiyon id'si ya da 'none' (koleksiyonsuz). Verilmezse tümü. */
  collectionId: z.string().optional(),
  tagId: z.string().optional(),
  pinned: z.boolean().optional(),
  /** Proje notları (Projeler > Notlar sekmesi). */
  projectId: z.string().optional(),
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
  isIdea: z.boolean(),
  /** Unix ms. */
  updatedAt: z.number(),
})

/** Fikirler listesinin satırı. */
export const ideaSummarySchema = noteSummarySchema.extend({ idea: ideaStateSchema })

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
  /** Not bir fikirse kuluçka durumu. */
  idea: ideaStateSchema.nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const noteCreateInputSchema = z.object({
  collectionId: z.string().nullable().optional(),
  /** Projeler > Notlar'dan açılan not projeye bağlanır. */
  projectId: z.string().nullable().optional(),
})

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
  isIdea: z.boolean(),
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
export type IdeaStatus = z.infer<typeof ideaStatusSchema>
export type IdeaStage = z.infer<typeof ideaStageSchema>
export type IdeaState = z.infer<typeof ideaStateSchema>
export type IdeaSummary = z.infer<typeof ideaSummarySchema>
export type IdeaSetStatusInput = z.infer<typeof ideaSetStatusInputSchema>
export type IdeaCard = z.infer<typeof ideaCardSchema>
export type IdeaToday = z.infer<typeof ideaTodaySchema>
export type NoteSearchResult = z.infer<typeof noteSearchResultSchema>
