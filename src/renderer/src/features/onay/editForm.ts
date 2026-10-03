import { operationSchema, type Operation } from '@shared/schemas/ai'

// Düzenle formu: önerinin alanları türüne göre (metin, tarih, bağlam seçici...). Form değerleri hep metin; gönderirken
// yüke çevrilir ve paylaşılan `operationSchema` ile doğrulanır (ana süreç de yeniden doğrular).

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'date'
  | 'time'
  | 'datetime'
  | 'number'
  | 'context'
  | 'project'
  | 'course'
  | 'taskKind'

export type FieldSpec = {
  key: string
  label: string
  kind: FieldKind
  optional?: boolean
  /** Kısa alanlar ızgarada yan yana; uzunlar tam satır. */
  wide?: boolean
}

export const FIELDS: Record<Operation['op'], FieldSpec[]> = {
  create_task: [
    { key: 'title', label: 'Başlık', kind: 'text', wide: true },
    { key: 'context', label: 'Nereye', kind: 'context' },
    { key: 'kind', label: 'Tür', kind: 'taskKind', optional: true },
    { key: 'dueDate', label: 'Tarih', kind: 'date', optional: true },
    { key: 'estimateMin', label: 'Süre (dk)', kind: 'number', optional: true },
  ],
  create_note: [
    { key: 'title', label: 'Başlık', kind: 'text', wide: true },
    { key: 'context', label: 'Nereye', kind: 'context' },
    { key: 'collection', label: 'Koleksiyon', kind: 'text', optional: true },
    { key: 'bodyMd', label: 'Metin', kind: 'textarea', wide: true },
  ],
  append_to_note: [{ key: 'appendMd', label: 'Eklenecek metin', kind: 'textarea', wide: true }],
  create_reminder: [
    { key: 'title', label: 'Başlık', kind: 'text', wide: true },
    { key: 'at', label: 'Zaman', kind: 'datetime' },
  ],
  create_idea: [
    { key: 'title', label: 'Başlık', kind: 'text', wide: true },
    { key: 'note', label: 'Not', kind: 'textarea', optional: true, wide: true },
  ],
  create_exam: [
    { key: 'courseId', label: 'Ders', kind: 'course' },
    { key: 'title', label: 'Sınav', kind: 'text' },
    { key: 'date', label: 'Tarih', kind: 'date' },
    { key: 'time', label: 'Saat', kind: 'time', optional: true },
    { key: 'weekFrom', label: 'İlk hafta', kind: 'number', optional: true },
    { key: 'weekTo', label: 'Son hafta', kind: 'number', optional: true },
  ],
  set_project_next_step: [
    { key: 'projectId', label: 'Proje', kind: 'project' },
    { key: 'text', label: 'Sıradaki adım', kind: 'text', wide: true },
  ],
  add_instructor_note: [
    { key: 'courseId', label: 'Ders', kind: 'course' },
    { key: 'text', label: 'Hoca notu', kind: 'textarea', wide: true },
  ],
}

export type FormValues = Record<string, string>

/** Bağlam seçicinin değeri: "" genel, "p:<id>" proje, "c:<id>" ders. */
export function contextValue(
  context: { projectId?: string | null; courseId?: string | null } | null | undefined,
): string {
  if (context?.projectId) return `p:${context.projectId}`
  if (context?.courseId) return `c:${context.courseId}`
  return ''
}

function contextFrom(value: string): { projectId: string } | { courseId: string } | null {
  if (value.startsWith('p:')) return { projectId: value.slice(2) }
  if (value.startsWith('c:')) return { courseId: value.slice(2) }
  return null
}

export function toForm(op: Operation): FormValues {
  const source = op as Record<string, unknown>
  const out: FormValues = {}
  for (const f of FIELDS[op.op]) {
    if (f.kind === 'context') out[f.key] = contextValue(source.context as never)
    else {
      const v = source[f.key]
      out[f.key] = v === null || v === undefined ? '' : String(v)
    }
  }
  return out
}

/** Form değerlerini yük alanlarına çevirir (boş isteğe bağlı alan → null). */
export function fromForm(op: Operation['op'], values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const projectContext = values.context?.startsWith('p:') ?? false
  for (const f of FIELDS[op]) {
    const raw = (values[f.key] ?? '').trim()
    switch (f.kind) {
      case 'context':
        out.context = contextFrom(raw)
        break
      case 'number':
        out[f.key] = raw === '' ? null : Number(raw)
        break
      case 'taskKind':
        // Tür sadece proje görevinde anlamlı.
        out[f.key] = projectContext && raw ? raw : null
        break
      case 'textarea':
        out[f.key] = f.optional && raw === '' ? null : (values[f.key] ?? '')
        break
      default:
        out[f.key] = f.optional && raw === '' ? null : raw
    }
  }
  return out
}

/** Önerinin üstüne yazılmış hali doğrular; hata varsa alan anahtarına göre ilk mesaj. */
export function validateEdit(
  op: Operation,
  edited: Record<string, unknown>,
): { ok: true } | { ok: false; errors: Record<string, string> } {
  const parsed = operationSchema.safeParse({
    ...op,
    ...edited,
    op: op.op,
    sourceDumpIds: op.sourceDumpIds,
  })
  if (parsed.success) return { ok: true }
  const errors: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'form')
    errors[key] ??= humanMessage(issue.message)
  }
  return { ok: false, errors }
}

function humanMessage(message: string): string {
  // zod'un İngilizce varsayılanları (sayı/tür hataları) yerine kısa Türkçe.
  if (/^(Invalid|Expected|Too small|Too big|Number must)/i.test(message)) return 'Geçersiz değer'
  return message
}
