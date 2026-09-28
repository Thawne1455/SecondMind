// Nasılsın? karosundaki uyku alanı: "7", "7:15", "7.5", "7,5", "7s 15dk" gibi yazımlar.

const SLEEP_MAX_MIN = 16 * 60

/** Yazılanı dakikaya çevirir. Boş → null (alanı boşalt), anlaşılmayan ya da 16 saati aşan → undefined. */
export function parseSleep(text: string): number | null | undefined {
  const t = text.trim().toLocaleLowerCase('tr-TR')
  if (!t) return null
  let min: number | undefined
  const clock = /^(\d{1,2})[:.](\d{2})$/.exec(t)
  const decimal = /^(\d{1,2})(?:[.,](\d))?$/.exec(t)
  const words = /^(\d{1,2})\s*(?:s|sa|saat)\s*(?:(\d{1,2})\s*(?:d|dk|dakika)?)?$/.exec(t)
  if (clock) {
    const m = Number(clock[2])
    if (m < 60) min = Number(clock[1]) * 60 + m
  } else if (decimal) {
    min = Number(decimal[1]) * 60 + Number(decimal[2] ?? 0) * 6
  } else if (words) {
    const m = Number(words[2] ?? 0)
    if (m < 60) min = Number(words[1]) * 60 + m
  }
  return min !== undefined && min <= SLEEP_MAX_MIN ? min : undefined
}

/** 435 → "7:15" */
export const formatSleep = (min: number) =>
  `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
