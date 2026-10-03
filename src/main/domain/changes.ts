import {
  changesEnvelopeSchema,
  operationSchema,
  type Operation,
  type Unprocessed,
} from '@shared/schemas/ai'

// AI çıktısının doğrulanması (MIMARI.md "AI akışı" 3. adım). Saf: veritabanı bilmez, bilinen id'ler dışarıdan gelir.
// Geçersiz işlemler tek tek reddedilir; biri bozuk diye diğerleri düşmez. Girdide olmayan id (uydurma proje, ders,
// not ya da döküm) geçersizdir. Hiçbir işlemde ve `unprocessed`'ta geçmeyen döküm "atlandı" sayılır.

export type KnownIds = {
  dumpIds: ReadonlySet<string>
  projectIds: ReadonlySet<string>
  courseIds: ReadonlySet<string>
  noteIds: ReadonlySet<string>
}

export type RejectedOp = { index: number; op: string | null; reason: string }

/** `auto`: AI bu dökümden hiç bahsetmedi; gerekçeyi doğrulama yazdı. */
export type SkippedDump = Unprocessed & { auto?: true }

export type ValidatedChanges = {
  operations: Operation[]
  rejected: RejectedOp[]
  unprocessed: SkippedDump[]
}

/**
 * İş başarılı mı: en az bir geçerli işlem ya da AI'ın kendi gerekçesiyle atladığı bir döküm var. İkisi de yoksa çıktı
 * işe yaramadı; iş başarısız sayılır ve dökümler bekliyor'a döner.
 */
export const jobSucceeded = (v: ValidatedChanges): boolean =>
  v.operations.length > 0 || v.unprocessed.some((u) => !u.auto)

export class ChangesParseError extends Error {}

/** Model çıktısından JSON nesnesini çıkarır: kod bloğu çitleri ve ön/son söz atlanır. */
export function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw)
  const body = fenced ? fenced[1]! : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new ChangesParseError('Çıktıda JSON nesnesi yok')
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    throw new ChangesParseError('Çıktıdaki JSON bozuk')
  }
}

function unknownRef(op: Operation, known: KnownIds): string | null {
  for (const d of op.sourceDumpIds) if (!known.dumpIds.has(d)) return `Bilinmeyen döküm: ${d}`
  const check = (set: ReadonlySet<string>, value: string | null | undefined, label: string) =>
    value && !set.has(value) ? `Bilinmeyen ${label}: ${value}` : null
  switch (op.op) {
    case 'create_task':
    case 'create_note':
      return (
        check(known.projectIds, op.context?.projectId, 'proje') ??
        check(known.courseIds, op.context?.courseId, 'ders')
      )
    case 'append_to_note':
      return check(known.noteIds, op.noteId, 'not')
    case 'create_exam':
    case 'add_instructor_note':
      return check(known.courseIds, op.courseId, 'ders')
    case 'set_project_next_step':
      return check(known.projectIds, op.projectId, 'proje')
    default:
      return null
  }
}

export function validateChanges(raw: string | unknown, known: KnownIds): ValidatedChanges {
  const data = typeof raw === 'string' ? extractJson(raw) : raw
  const envelope = changesEnvelopeSchema.safeParse(data)
  if (!envelope.success)
    throw new ChangesParseError(`Çıktı biçimi geçersiz: ${envelope.error.issues[0]?.message ?? ''}`)

  const operations: Operation[] = []
  const rejected: RejectedOp[] = []
  envelope.data.operations.forEach((item, index) => {
    const opName =
      item && typeof item === 'object' && typeof (item as { op?: unknown }).op === 'string'
        ? (item as { op: string }).op
        : null
    const parsed = operationSchema.safeParse(item)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
      rejected.push({ index, op: opName, reason: `${where}${issue?.message ?? 'geçersiz'}` })
      return
    }
    const bad = unknownRef(parsed.data, known)
    if (bad) rejected.push({ index, op: opName, reason: bad })
    else operations.push(parsed.data)
  })

  // Öneriye dönüşen döküm atlanmış sayılmaz; aynı döküm iki kez atlanmaz.
  const used = new Set(operations.flatMap((o) => o.sourceDumpIds))
  const unprocessed: SkippedDump[] = []
  for (const u of envelope.data.unprocessed)
    if (
      known.dumpIds.has(u.dumpId) &&
      !used.has(u.dumpId) &&
      !unprocessed.some((x) => x.dumpId === u.dumpId)
    )
      unprocessed.push(u)
  const covered = new Set([...used, ...unprocessed.map((u) => u.dumpId)])
  for (const d of known.dumpIds)
    if (!covered.has(d))
      unprocessed.push({ dumpId: d, reason: 'AI bu öğe için öneri üretmedi', auto: true })

  return { operations, rejected, unprocessed }
}
