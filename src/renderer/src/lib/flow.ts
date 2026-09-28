// Akış bandı zaman hesabı. Bant 08:00–24:00 arasını tek satırda gösterir.

export const DAY_START = 8 * 60
export const DAY_END = 24 * 60

/** "13:40" → günün 820. dakikası. */
export function parseTime(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!match) throw new Error(`Geçersiz saat: ${hhmm}`)
  return Number(match[1]) * 60 + Number(match[2])
}

/** Dakikayı bant üzerindeki yüzdeye çevirir; bant dışını kenara yapıştırır. */
export function timeToPercent(minutes: number): number {
  const clamped = Math.min(DAY_END, Math.max(DAY_START, minutes))
  return ((clamped - DAY_START) / (DAY_END - DAY_START)) * 100
}

/** 260 → "4 sa 20 dk", 120 → "2 sa", 50 → "50 dk". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} dk`
  if (m === 0) return `${h} sa`
  return `${h} sa ${m} dk`
}

export type BlockTiming = 'past' | 'current' | 'future'

export function blockTiming(start: number, end: number, now: number): BlockTiming {
  if (end <= now) return 'past'
  if (start <= now) return 'current'
  return 'future'
}

/** Bandın üstündeki saat etiketleri: 08, 10, … 24. */
export function hourTicks(step = 2): number[] {
  const ticks: number[] = []
  for (let h = DAY_START / 60; h <= DAY_END / 60; h += step) ticks.push(h)
  return ticks
}

/** Günün dakikası → "13:40". */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Sayının okunuşunun son kelimesine göre bulunma eki: "bir"→'de, "üç"→'te, "altı"→'da, "kırk"→'ta.
const ONES = ['', 'de', 'de', 'te', 'te', 'te', 'da', 'de', 'de', 'da']
const TENS = ['da', 'da', 'de', 'da', 'ta', 'de']

/** "13:00" → "13:00'te", "09:00" → "09:00'da", "14:30" → "14:30'da". */
export function formatAtClock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const n = m === 0 ? h : m
  const suffix = n % 10 ? ONES[n % 10] : TENS[Math.floor(n / 10) % 6]
  return `${formatClock(minutes)}'${suffix}`
}
