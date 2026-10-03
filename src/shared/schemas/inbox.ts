import { z } from 'zod'
import { operationSchema } from './ai'

// Onay Kutusu (Aşama 4d): kaynağa göre gruplu öneriler ve İşlem günlüğü. Sözleşme `ipc.ts`'te.

export const proposalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'edited'])

/** Önerinin hedef alanı (etiket): proje rengiyle proje, ders tonuyla ders, Bilgi, Bugün. */
export const proposalTargetSchema = z.object({
  domain: z.enum(['today', 'projects', 'school', 'knowledge']),
  label: z.string(),
  /** Proje rengi ya da ders tonu (`#RRGGBB`); yoksa alan rengi. */
  fill: z.string().nullable(),
  /** Bağlamdaki id artık yok (silinmiş proje/ders/not). */
  missing: z.boolean(),
})

export const proposalSourceSchema = z.object({
  dumpId: z.string(),
  /** Döküm metninden kısa alıntı; metinsiz resimde boş. */
  excerpt: z.string(),
  attachments: z.number(),
  /** Unix ms. */
  createdAt: z.number(),
})

/** Not güncellemesi ve sıradaki adım için fark karosu. */
export const proposalDiffSchema = z.object({
  /** Not adı ya da proje adı. */
  title: z.string(),
  /** Değişmeyen bağlam satırları (notun son satırları). */
  context: z.array(z.string()),
  removed: z.array(z.string()),
  added: z.array(z.string()),
})

export const proposalViewSchema = z.object({
  id: z.string(),
  op: z.string(),
  payload: operationSchema,
  status: proposalStatusSchema,
  undone: z.boolean(),
  /** Unix ms. */
  decidedAt: z.number().nullable(),
  target: proposalTargetSchema,
  sources: z.array(proposalSourceSchema),
  diff: proposalDiffSchema.nullable(),
})

const previewSlotSchema = z.object({
  weekday: z.number(),
  startMin: z.number(),
  endMin: z.number(),
  room: z.string(),
})

/**
 * Ders programı önizlemesi (4e-2): hedef dönem şeridi ve haftalık ızgara. Eşleştirme ana süreçte, uygulayıcıyla aynı
 * algoritmayla (`domain/school/scheduleImport`).
 */
export const schedulePreviewSchema = z.object({
  term: z.object({
    /** Dönem önerisi (yoksa null). */
    proposalId: z.string().nullable(),
    /** new: onaylanınca oluşur (ya da bu önerilerle oluştu) · existing: dersler var olan döneme · none: dönem yok. */
    mode: z.enum(['new', 'existing', 'none']),
    name: z.string(),
    active: z.boolean(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    weekCount: z.number().nullable(),
  }),
  courses: z.array(
    z.object({
      proposalId: z.string(),
      /** Dönemde aynı ders var: öneri onu günceller. */
      update: z.boolean(),
      tone: z.string(),
      /** Onaylanınca yerine geçecek eski saatler (sadece saat değişiyorsa). */
      oldSlots: z.array(previewSlotSchema),
      changes: z.array(z.object({ label: z.string(), before: z.string(), after: z.string() })),
    }),
  ),
})

export const proposalGroupSchema = z.object({
  jobId: z.string(),
  kind: z.enum(['dump', 'weekly_review', 'schedule_import']),
  model: z.enum(['fast', 'deep']),
  /** Unix ms. */
  startedAt: z.number(),
  pending: z.number(),
  proposals: z.array(proposalViewSchema),
  /** İşte dönem/ders önerisi varsa. */
  schedule: schedulePreviewSchema.nullable(),
})

/** Düzenle formundaki seçiciler. */
export const proposalContextsSchema = z.object({
  projects: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })),
  courses: z.array(z.object({ id: z.string(), name: z.string(), tone: z.string() })),
})

export const inboxSchema = z.object({
  groups: z.array(proposalGroupSchema),
  contexts: proposalContextsSchema,
})

export const activityActorSchema = z.enum(['taha', 'ai', 'scan', 'system'])
export const activityFilterSchema = z.enum(['all', 'ai', 'taha', 'scan'])

export const activityEntrySchema = z.object({
  /** Grup kimliği ya da grupsuz kaydın kimliği. */
  key: z.string(),
  groupId: z.string().nullable(),
  actor: activityActorSchema,
  /** Unix ms. */
  at: z.number(),
  lines: z.array(z.string()),
  more: z.number(),
  undone: z.boolean(),
  /** Bir geri almanın kendisi. */
  isUndo: z.boolean(),
  undoable: z.boolean(),
})

export const activityListInputSchema = z.object({
  actor: activityFilterSchema,
  /** Son kaç gün (30, 60...). */
  days: z.number().int().min(1).max(3650),
})

export const activityListSchema = z.object({
  entries: z.array(activityEntrySchema),
  /** Daha eski kayıt var. */
  hasMore: z.boolean(),
})

export type ProposalTarget = z.infer<typeof proposalTargetSchema>
export type ProposalSource = z.infer<typeof proposalSourceSchema>
export type ProposalDiff = z.infer<typeof proposalDiffSchema>
export type ProposalView = z.infer<typeof proposalViewSchema>
export type ProposalGroup = z.infer<typeof proposalGroupSchema>
export type SchedulePreview = z.infer<typeof schedulePreviewSchema>
export type ProposalContexts = z.infer<typeof proposalContextsSchema>
export type Inbox = z.infer<typeof inboxSchema>
export type ActivityActorName = z.infer<typeof activityActorSchema>
export type ActivityFilter = z.infer<typeof activityFilterSchema>
export type ActivityEntry = z.infer<typeof activityEntrySchema>
export type ActivityList = z.infer<typeof activityListSchema>
