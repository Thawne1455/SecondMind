import type { ImportSlot } from '@shared/schemas/ai'
import { nextTone } from './term'

// Ders programından okul önerileri (4e-2). AI sadece programı okur (`import_term`, `import_course`); hangi döneme
// gideceği, dersin yeni mi mevcut mu olduğu ve neyin değiştiği burada algoritmayla bulunur (kural 2). Saf: veritabanı
// bilmez. Önizleme (Onay Kutusu) ve uygulayıcı aynı fonksiyonları kullanır ki gösterilen ile yazılan aynı olsun.

export type ImportTermRef = { id: string; name: string; active: boolean }
export type ImportSlotRef = {
  id: string
  weekday: number
  startMin: number
  endMin: number
  room: string
}
export type ImportCourseRef = {
  id: string
  name: string
  code: string
  credit: number
  tone: string
  instructorName: string | null
  slots: ImportSlotRef[]
}
export type PlainSlot = { weekday: number; startMin: number; endMin: number; room: string }

const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const

/** Büyük/küçük harf ve boşluk farkı yok sayılır (Türkçe kurallarıyla: "İ" → "i"). */
export const normalizeName = (s: string): string =>
  s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()

// Akademik unvanlar (uzundan kısaya: "Dr. Öğr. Üyesi" "Dr."den önce denensin).
const TITLES = [
  'dr. öğr. üyesi',
  'dr. öğretim üyesi',
  'öğr. gör. dr.',
  'arş. gör. dr.',
  'öğr. gör.',
  'öğretim görevlisi',
  'arş. gör.',
  'araştırma görevlisi',
  'prof. dr.',
  'doç. dr.',
  'yrd. doç. dr.',
  'prof.',
  'doç.',
  'dr.',
]

/** Hoca karşılaştırması: unvan yok sayılır ("Dr. Öğr. Üyesi Ayşe Kaya" = "Ayşe Kaya"). */
export function instructorKey(name: string): string {
  let s = normalizeName(name)
    .replace(/\s*\.\s*/g, '. ')
    .trim()
  for (let changed = true; changed;) {
    changed = false
    for (const t of TITLES)
      if (s.startsWith(`${t} `)) {
        s = s.slice(t.length + 1).trim()
        changed = true
      }
  }
  return s
}

/** Programdaki hoca adına denk gelen kayıtlı hoca (unvan farkı yok sayılır). */
export function matchInstructor<T extends { name: string }>(
  name: string,
  list: readonly T[],
): T | null {
  const key = instructorKey(name)
  return key ? (list.find((i) => instructorKey(i.name) === key) ?? null) : null
}

/** "BLM 201", "blm-201", "BLM201" aynı kod. */
export const normalizeCode = (s: string): string =>
  s.toLocaleUpperCase('tr-TR').replace(/[\s\-_.]/g, '')

export const clockToMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h * 60 + m
}

const clock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export type TermTarget = { kind: 'existing'; termId: string } | { kind: 'new' } | { kind: 'none' }

/**
 * Derslerin gideceği dönem. Program bir dönem adı verdiyse: aynı adlı dönem (arşivdeki de olur) ya da yeni dönem.
 * Vermediyse (ya da dönem önerisi reddedildiyse) aktif dönem; o da yoksa hiçbiri.
 */
export function resolveTerm(
  termName: string | null | undefined,
  terms: readonly ImportTermRef[],
): TermTarget {
  if (termName?.trim()) {
    const key = normalizeName(termName)
    const found = terms.find((t) => normalizeName(t.name) === key)
    return found ? { kind: 'existing', termId: found.id } : { kind: 'new' }
  }
  const active = terms.find((t) => t.active)
  return active ? { kind: 'existing', termId: active.id } : { kind: 'none' }
}

/** Dönemdeki aynı ders: önce kod (ikisinde de varsa), sonra ad. */
export function matchCourse<T extends { name: string; code: string }>(
  input: { name: string; code?: string | null },
  courses: readonly T[],
): T | null {
  const code = normalizeCode(input.code ?? '')
  if (code) {
    const byCode = courses.find((c) => c.code && normalizeCode(c.code) === code)
    if (byCode) return byCode
  }
  const name = normalizeName(input.name)
  return courses.find((c) => normalizeName(c.name) === name) ?? null
}

/**
 * Programdaki saatleri ders kaydının saatlerine çevirir: gün ve saat sırasıyla, aynı gün/başlangıç bir kez. Mevcut
 * dersteki aynı gün ve başlangıçlı saat kimliğini korur (yoklama geçmişi o saate bağlı kalır).
 */
export function importSlots(
  slots: readonly ImportSlot[],
  existing: readonly ImportSlotRef[] = [],
): (PlainSlot & { id?: string })[] {
  const out: (PlainSlot & { id?: string })[] = []
  const used = new Set<string>()
  const sorted = [...slots].sort(
    (a, b) => a.weekday - b.weekday || clockToMin(a.start) - clockToMin(b.start),
  )
  for (const s of sorted) {
    const startMin = clockToMin(s.start)
    if (out.some((o) => o.weekday === s.weekday && o.startMin === startMin)) continue
    const old = existing.find(
      (e) => e.weekday === s.weekday && e.startMin === startMin && !used.has(e.id),
    )
    if (old) used.add(old.id)
    out.push({
      ...(old && { id: old.id }),
      weekday: s.weekday,
      startMin,
      endMin: clockToMin(s.end),
      room: (s.room ?? '').trim(),
    })
  }
  return out
}

/** "Pzt 09:00-10:50 D-201". */
export function slotText(s: PlainSlot): string {
  const room = s.room.trim()
  return `${WEEKDAY_SHORT[s.weekday - 1]} ${clock(s.startMin)}-${clock(s.endMin)}${room ? ` ${room}` : ''}`
}

/** Saatler gün sırasıyla, virgülle; hiç yoksa "—". */
export function slotsText(slots: readonly PlainSlot[]): string {
  if (!slots.length) return '—'
  return [...slots]
    .sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin)
    .map(slotText)
    .join(', ')
}

const timeKey = (s: PlainSlot) => `${s.weekday}|${s.startMin}|${s.endMin}`
const slotKey = (s: PlainSlot) => `${timeKey(s)}|${normalizeName(s.room)}`

const sameKeys = (
  a: readonly PlainSlot[],
  b: readonly PlainSlot[],
  key: (s: PlainSlot) => string,
) => {
  const x = a.map(key).sort()
  const y = b.map(key).sort()
  return x.length === y.length && x.every((k, i) => k === y[i])
}

export function sameSlots(a: readonly PlainSlot[], b: readonly PlainSlot[]): boolean {
  return sameKeys(a, b, slotKey)
}

/** Gün ve saatler aynı (derslik farkı yok sayılır). */
export function sameTimes(a: readonly PlainSlot[], b: readonly PlainSlot[]): boolean {
  return sameKeys(a, b, timeKey)
}

/** Yeni programda olmayan eski saatler (önizlemede kesikli çerçeve; sadece derslik değiştiyse yok). */
export function movedSlots<T extends PlainSlot>(
  old: readonly T[],
  next: readonly PlainSlot[],
): T[] {
  const keep = new Set(next.map(timeKey))
  return old.filter((s) => !keep.has(timeKey(s)))
}

const roomsText = (slots: readonly PlainSlot[]) =>
  [...new Set(slots.map((s) => s.room.trim()).filter(Boolean))].join(', ') || '—'

export type CourseImportInput = {
  name: string
  code?: string | null
  credit?: number | null
  instructor?: string | null
  slots: readonly ImportSlot[]
}

export type CourseChange = { label: string; before: string; after: string }

/**
 * Mevcut derse uygulanınca neler değişir. Programda boş gelen alan değişiklik sayılmaz (mevcut değer korunur); boş
 * saat listesi de mevcut saatleri silmez.
 */
export function courseChanges(input: CourseImportInput, course: ImportCourseRef): CourseChange[] {
  const out: CourseChange[] = []
  if (normalizeName(input.name) !== normalizeName(course.name))
    out.push({ label: 'Ad', before: course.name, after: input.name.trim() })
  const code = input.code?.trim()
  if (code && normalizeCode(code) !== normalizeCode(course.code))
    out.push({ label: 'Kod', before: course.code || '—', after: code })
  if (input.credit != null && input.credit !== course.credit)
    out.push({ label: 'Kredi', before: String(course.credit), after: String(input.credit) })
  const instructor = input.instructor?.trim()
  if (instructor && instructorKey(instructor) !== instructorKey(course.instructorName ?? ''))
    out.push({ label: 'Hoca', before: course.instructorName || '—', after: instructor })
  if (input.slots.length) {
    const next = importSlots(input.slots, course.slots)
    if (!sameTimes(next, course.slots))
      out.push({ label: 'Saat', before: slotsText(course.slots), after: slotsText(next) })
    else if (!sameSlots(next, course.slots))
      out.push({ label: 'Derslik', before: roomsText(course.slots), after: roomsText(next) })
  }
  return out
}

/** Programın derslerine ton: eşleşen ders kendi tonunu korur, yeniler dönemde kullanılmayan tonları alır. */
export function previewTones(
  matches: readonly (ImportCourseRef | null)[],
  termCourses: readonly ImportCourseRef[],
): string[] {
  const used = termCourses.map((c) => c.tone)
  return matches.map((m) => {
    if (m) return m.tone
    const tone = nextTone(used)
    used.push(tone)
    return tone
  })
}

/** Yeni dersin varsayılan dersliği: saatlerin hepsi aynı derslikteyse o, değilse boş. */
export function defaultRoom(slots: readonly PlainSlot[]): string {
  const rooms = [...new Set(slots.map((s) => s.room.trim()))]
  return rooms.length === 1 ? rooms[0]! : ''
}
