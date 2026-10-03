import { z } from 'zod'
import { dayKeySchema } from './planning'

// AI'ın tek çıktısı: `changes.json` (MIMARI.md "AI akışı", resources/ai-agent/CLAUDE.md).
// Yeni işlem türü eklemek = buraya şema + main/ai/apply.ts'e uygulayıcı + Onay Kutusu'na önizleme.
// Model çıktısı her zaman buradan doğrulanır; yerel modelin grammar'ı da bu şemadan türetilir.

const id = z.string().trim().min(1).max(64)
const sourceDumpIds = z.array(id).max(50).default([])
const text = (max: number) => z.string().trim().min(1, 'Boş olamaz').max(max)
/** Yerel saat, saniyesiz: "2026-10-02T09:00". */
export const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Zaman YYYY-MM-DDTHH:mm olmalı')

const contextSchema = z
  .object({ projectId: id.nullish(), courseId: id.nullish() })
  .refine((c) => !(c.projectId && c.courseId), 'Bağlam ya proje ya ders olur')
  .nullish()

export const createTaskOpSchema = z.object({
  op: z.literal('create_task'),
  sourceDumpIds,
  title: text(200),
  context: contextSchema,
  dueDate: dayKeySchema.nullish(),
  estimateMin: z.number().int().min(5).max(600).nullish(),
  /** Sadece proje görevinde anlamlı. */
  kind: z.enum(['task', 'bug', 'research']).nullish(),
})

export const createNoteOpSchema = z.object({
  op: z.literal('create_note'),
  sourceDumpIds,
  title: text(200),
  bodyMd: z.string().max(50_000),
  context: contextSchema,
  /** Koleksiyon adı ("Günlük", "Haftalık"); yoksa oluşturulur. */
  collection: z.string().trim().max(60).nullish(),
})

export const appendToNoteOpSchema = z.object({
  op: z.literal('append_to_note'),
  sourceDumpIds,
  noteId: id,
  appendMd: text(20_000),
})

export const createReminderOpSchema = z.object({
  op: z.literal('create_reminder'),
  sourceDumpIds,
  title: text(200),
  at: localDateTimeSchema,
})

export const createIdeaOpSchema = z.object({
  op: z.literal('create_idea'),
  sourceDumpIds,
  title: text(200),
  note: z.string().max(20_000).nullish(),
})

export const createExamOpSchema = z.object({
  op: z.literal('create_exam'),
  sourceDumpIds,
  courseId: id,
  /** "Vize", "Final", "Quiz 2". */
  title: text(120),
  date: dayKeySchema,
  /** "HH:mm" */
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullish(),
  weekFrom: z.number().int().min(1).max(30).nullish(),
  weekTo: z.number().int().min(1).max(30).nullish(),
})

export const setProjectNextStepOpSchema = z.object({
  op: z.literal('set_project_next_step'),
  sourceDumpIds,
  projectId: id,
  text: text(300),
})

export const addInstructorNoteOpSchema = z.object({
  op: z.literal('add_instructor_note'),
  sourceDumpIds,
  courseId: id,
  text: text(2000),
})

/** "HH:mm", 00:00–23:59. */
const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Saat SS:dd olmalı')

/** Ders programından bir saat: hafta günü (1 = Pzt), başlangıç, bitiş, derslik. */
export const importSlotSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    start: clockSchema,
    end: clockSchema,
    room: z.string().trim().max(60).nullish(),
  })
  .refine((s) => s.end > s.start, { message: 'Bitiş başlangıçtan sonra olmalı', path: ['end'] })

/**
 * Ders programındaki dönem. Uygulama adıyla mevcut dönemlere bakar: aynı adlı dönem varsa dersler ona eklenir (bu
 * işlem bir şey yazmaz), yoksa yeni dönem oluşur ve aktif olur (başlangıç tarihi şart).
 */
export const importTermOpSchema = z
  .object({
    op: z.literal('import_term'),
    sourceDumpIds,
    name: text(80),
    startDate: dayKeySchema.nullish(),
    endDate: dayKeySchema.nullish(),
    weekCount: z.number().int().min(1).max(30).nullish(),
  })
  .refine((t) => !t.startDate || !t.endDate || t.endDate >= t.startDate, {
    message: 'Bitiş başlangıçtan önce olamaz',
    path: ['endDate'],
  })

/**
 * Ders programındaki bir ders. Hangi döneme gideceği ve yeni mi yoksa mevcut dersin güncellemesi mi olduğu uygulamada
 * algoritmayla bulunur (kod, yoksa ad eşleşmesi; `domain/school/scheduleImport`). Boş bırakılan alan mevcut dersi bozmaz.
 */
export const importCourseOpSchema = z.object({
  op: z.literal('import_course'),
  sourceDumpIds,
  name: text(120),
  code: z.string().trim().max(30).nullish(),
  credit: z.number().min(0).max(60).nullish(),
  instructor: z.string().trim().max(120).nullish(),
  instructorEmail: z.string().trim().max(200).nullish(),
  instructorOfficeHours: z.string().trim().max(300).nullish(),
  slots: z.array(importSlotSchema).max(20),
})

export const operationSchema = z.discriminatedUnion('op', [
  createTaskOpSchema,
  createNoteOpSchema,
  appendToNoteOpSchema,
  createReminderOpSchema,
  createIdeaOpSchema,
  createExamOpSchema,
  setProjectNextStepOpSchema,
  addInstructorNoteOpSchema,
  importTermOpSchema,
  importCourseOpSchema,
])

export const OPERATION_KINDS = operationSchema.options.map((o) => o.shape.op.value)

export const unprocessedSchema = z.object({ dumpId: id, reason: z.string().trim().max(300) })

/**
 * Dış kabuk. İşlemler burada `unknown` kalır: her biri `operationSchema` ile **tek tek** doğrulanır,
 * böylece bir bozuk işlem diğerlerini düşürmez (MIMARI: geçersizler tek tek reddedilir).
 */
export const changesEnvelopeSchema = z.object({
  version: z.literal(1),
  operations: z.array(z.unknown()).max(100),
  unprocessed: z.array(unprocessedSchema).max(100).default([]),
})

export type Operation = z.infer<typeof operationSchema>
export type OperationKind = Operation['op']
export type Unprocessed = z.infer<typeof unprocessedSchema>
export type ImportSlot = z.infer<typeof importSlotSchema>
export type ImportCourseOp = z.infer<typeof importCourseOpSchema>
export type ImportTermOp = z.infer<typeof importTermOpSchema>
