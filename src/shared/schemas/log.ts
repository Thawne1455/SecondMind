import { z } from 'zod'
import { dayKeySchema, taskKindSchema } from './planning'

// Proje Günlüğü (Aşama 5d-3, PROJELER.md > 5. Günlük). Sözleşme `ipc.ts`'te.

export const LOG_NOTE_MAX = 20_000

export const logItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('commits'),
    /** Günün en son commit anı (ms). */
    at: z.number(),
    messages: z.array(z.string()),
    /** Alan → dosya sayısı, çoktan aza. */
    areas: z.array(z.tuple([z.string(), z.number()])),
  }),
  z.object({
    kind: z.literal('session'),
    id: z.string(),
    at: z.number(),
    minutes: z.number(),
    source: z.enum(['taha', 'claude_code']),
    leftOff: z.string(),
    nextStep: z.string(),
  }),
  z.object({
    kind: z.literal('task'),
    id: z.string(),
    at: z.number(),
    title: z.string(),
    taskKind: taskKindSchema,
  }),
  z.object({ kind: z.literal('milestone'), id: z.string(), at: z.number(), title: z.string() }),
  z.object({
    kind: z.literal('playtest'),
    at: z.number(),
    people: z.array(z.string()),
    points: z.number(),
  }),
  z.object({
    kind: z.literal('shot'),
    id: z.string(),
    at: z.number(),
    url: z.string(),
    starred: z.boolean(),
  }),
  z.object({
    kind: z.literal('report'),
    id: z.string(),
    at: z.number(),
    minutes: z.number().nullable(),
    nextStep: z.string(),
    done: z.array(z.string()),
    taskSuggestions: z.array(z.string()),
    later: z.array(z.string()),
    issues: z.array(z.string()),
    decisions: z.array(z.string()),
  }),
  z.object({
    kind: z.literal('note'),
    id: z.string(),
    at: z.number(),
    bodyMd: z.string(),
    devlog: z.boolean(),
  }),
])

export const logDaySchema = z.object({ day: dayKeySchema, items: z.array(logItemSchema) })

export const logPageSchema = z.object({
  /** En yeni gün önce. */
  days: z.array(logDaySchema),
  /** Daha eski kayıt varsa bir sonraki sayfanın `until` günü. */
  nextUntil: dayKeySchema.nullable(),
})

export const devlogDraftSchema = z.object({
  weekStart: dayKeySchema,
  week: z.number(),
  empty: z.boolean(),
  markdown: z.string(),
  bbcode: z.string(),
  /** Taslaktaki görsel adları ve kaynakları (klasöre çıkarılır). */
  images: z.array(z.object({ name: z.string(), url: z.string() })),
})

export type LogItem = z.infer<typeof logItemSchema>
export type LogDay = z.infer<typeof logDaySchema>
export type LogPage = z.infer<typeof logPageSchema>
export type DevlogDraft = z.infer<typeof devlogDraftSchema>
