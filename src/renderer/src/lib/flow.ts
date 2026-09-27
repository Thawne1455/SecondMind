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
