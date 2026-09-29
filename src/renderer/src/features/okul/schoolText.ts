import type { CSSProperties } from 'react'
import type {
  AttendanceStatusOut,
  ComponentInput,
  ComponentKind,
  ExamCard,
  RequiredScoresOut,
  SlotInput,
} from '@shared/ipc'

// Okul panelinin metinleri ve serbest yazım ayrıştırıcıları (saf, test edilir).

export const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const
export const WEEKDAY_LONG = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const

export const LEVEL_LABELS = ['Bilmiyorum', 'Tanıdık', 'Anladım', 'Çözebiliyorum'] as const

export const COMPONENT_KIND_LABEL: Record<ComponentKind, string> = {
  midterm: 'Vize',
  final: 'Final',
  homework: 'Ödev',
  quiz: 'Quiz',
  project: 'Proje',
  other: 'Diğer',
}

export const clock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** 78 → "78", 78.5 → "78,5". */
export const formatScore = (n: number) =>
  n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })

const lower = (s: string) => s.toLocaleLowerCase('tr-TR')

/** "pzt", "pazartesi", "PAZARTESİ" → 1. */
export function parseWeekday(word: string): number | null {
  const w = lower(word.trim()).replace(/\.$/, '')
  if (!w) return null
  for (let i = 0; i < 7; i++) {
    const long = lower(WEEKDAY_LONG[i]!)
    if (w === lower(WEEKDAY_SHORT[i]!) || w === long) return i + 1
  }
  // Tek anlamlı önek ("perş", "cumar").
  const hits = WEEKDAY_LONG.map((d, i) => (w.length >= 3 && lower(d).startsWith(w) ? i + 1 : 0)).filter(Boolean)
  return hits.length === 1 ? hits[0]! : null
}

function parseClock(s: string): number | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2] ?? 0)
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export type SlotParse = { slots: SlotInput[]; errors: string[] }

/**
 * Ders programı serbest yazımı: "Pzt 09:00-10:50 D-201, Çar 13-14:50". Parçalar virgül, noktalı virgül
 * ya da satır sonuyla ayrılır; derslik isteğe bağlı. Hatalı parça atlanır ve hata listesine yazılır.
 */
export function parseSlots(text: string): SlotParse {
  const slots: SlotInput[] = []
  const errors: string[] = []
  for (const raw of text.split(/[,;\n]+/)) {
    const part = raw.trim()
    if (!part) continue
    const m = /^(\S+)\s+(\d{1,2}(?:[:.]\d{2})?)\s*[-–]\s*(\d{1,2}(?:[:.]\d{2})?)\s*(.*)$/.exec(part)
    const weekday = m ? parseWeekday(m[1]!) : null
    const start = m ? parseClock(m[2]!) : null
    const end = m ? parseClock(m[3]!) : null
    if (!m || weekday === null || start === null || end === null || end <= start) {
      errors.push(part)
      continue
    }
    slots.push({ weekday, startMin: start, endMin: end, room: m[4]!.trim() })
  }
  return { slots, errors }
}

export function formatSlots(slots: readonly Pick<SlotInput, 'weekday' | 'startMin' | 'endMin' | 'room'>[]): string {
  return [...slots]
    .sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin)
    .map((s) =>
      [`${WEEKDAY_SHORT[s.weekday - 1]} ${clock(s.startMin)}-${clock(s.endMin)}`, s.room?.trim()]
        .filter(Boolean)
        .join(' '),
    )
    .join(', ')
}

/** Tarihten dönem adı tahmini: Eylül–Ocak Güz, Şubat–Haziran Bahar, Temmuz–Ağustos Yaz. */
export function guessTermName(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (m >= 9) return `${y}-${y + 1} Güz`
  if (m === 1) return `${y - 1}-${y} Güz`
  if (m <= 6) return `${y - 1}-${y} Bahar`
  return `${y - 1}-${y} Yaz`
}

/** Sınav şeridinin geri sayımı: "BUGÜN", "YARIN", "12 GÜN". */
export function daysLeftText(n: number): string {
  if (n <= 0) return 'Bugün'
  if (n === 1) return 'Yarın'
  return `${n} gün`
}

/** "Finalde en az 82" / "Vize ve Final: en az 70" / garanti / imkânsız. */
export function requiredText(
  r: RequiredScoresOut,
  target: string,
  names: ReadonlyMap<string, string>,
): string {
  if (r.status === 'final') return r.reached ? `${target} tuttu` : `${target} tutmadı`
  const list = r.remaining.map((id) => names.get(id) ?? '?')
  const who =
    list.length === 1
      ? `${list[0]}'${suffix(list[0]!)}`
      : `${list.slice(0, -1).join(', ')} ve ${list[list.length - 1]}'${suffix(list[list.length - 1]!)}`
  if (r.status === 'secured') return `${target} garanti`
  if (r.status === 'impossible') return `${target} olmaz · en iyi ${r.bestLetter}`
  return `${who} en az ${r.min}`
}

/** Ünlü uyumuna uymayan alıntı sözcükler. */
const SUFFIX_EXCEPTIONS: Record<string, string> = { final: 'de', kontrol: 'de', lab: 'da' }

/** Bulunma eki (-de/-da/-te/-ta): son ünlü ve son ses. */
function suffix(word: string): string {
  const w = lower(word)
  const exception = SUFFIX_EXCEPTIONS[w.split(/\s+/).pop() ?? '']
  if (exception) return exception
  const vowels = [...w].filter((c) => 'aeıioöuü'.includes(c))
  const back = 'aıou'.includes(vowels[vowels.length - 1] ?? 'e')
  const hard = 'fstkçşhp'.includes(w[w.length - 1] ?? '')
  return `${hard ? 't' : 'd'}${back ? 'a' : 'e'}`
}

export function attendanceText(a: AttendanceStatusOut): string {
  return a.limit === null ? `${a.used} sa` : `${a.used} / ${a.limit}`
}

/** Harf tablosunun düzenlenebilir metni: "AA 90 4, BA 85 3.5, …". */
export function formatLetterTable(rows: readonly { letter: string; min: number; points: number }[]): string {
  return rows.map((r) => `${r.letter} ${r.min} ${r.points}`).join(', ')
}

export function parseLetterTable(text: string): { letter: string; min: number; points: number }[] | null {
  const rows = []
  // Virgül ondalık da olabilir ("3,5"); ayraç olarak sadece ardından boşluk gelen virgül sayılır.
  for (const part of text.split(/;|\n|,\s+/)) {
    const bits = part.trim().split(/\s+/)
    if (bits.length === 1 && !bits[0]) continue
    if (bits.length !== 3) return null
    const [letter, min, points] = bits as [string, string, string]
    const minN = Number(min.replace(',', '.'))
    const pts = Number(points.replace(',', '.'))
    if (!letter || Number.isNaN(minN) || Number.isNaN(pts) || minN < 0 || minN > 100) return null
    rows.push({ letter: letter.toLocaleUpperCase('tr-TR'), min: minN, points: pts })
  }
  return rows.length ? rows : null
}

/** Kurulumda ve yeni derste seçilen hazır değerlendirme şemaları. */
export const SCHEME_PRESETS: { id: string; label: string; components: ComponentInput[] }[] = [
  {
    id: 'vf',
    label: 'Vize %40 · Final %60',
    components: [
      { name: 'Vize', kind: 'midterm', weight: 40 },
      { name: 'Final', kind: 'final', weight: 60 },
    ],
  },
  {
    id: 'vof',
    label: 'Vize %30 · Ödevler %20 · Final %50',
    components: [
      { name: 'Vize', kind: 'midterm', weight: 30 },
      { name: 'Ödevler', kind: 'homework', weight: 20 },
      { name: 'Final', kind: 'final', weight: 50 },
    ],
  },
  { id: 'later', label: 'Sonra her derse ayrı gireceğim', components: [] },
]

/** Sınav çalışma bloğu: dersin tonunda çapraz çizgili (TASARIM.md "Sınav bloğu"). */
export const stripes = (tone: string): CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(135deg, ${tone} 0 7px, color-mix(in srgb, ${tone} 45%, #FFFFFF) 7px 14px)`,
})

/** 7 günden az kaldı ve hazırlık %50'nin altında: mercan. */
export const examUrgent = (e: Pick<ExamCard, 'daysLeft' | 'readiness'>) =>
  e.daysLeft < 7 && (e.readiness ?? 0) < 50
