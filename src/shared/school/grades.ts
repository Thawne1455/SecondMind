// Not hesabı (OKUL.md "Algoritmalar"). Saf; hem ana süreç (pano, ders detayı) hem arayüzdeki
// "Finalden 60 alırsam?" kaydırıcısı ve GANO simülasyonu aynı fonksiyonları kullanır, bu yüzden `shared`'da.

export type LetterRow = { letter: string; min: number; points: number }

/** Varsayılan harf aralıkları (4'lük sistem). FF: 50'nin altı. */
export const DEFAULT_LETTER_TABLE: readonly LetterRow[] = [
  { letter: 'AA', min: 90, points: 4 },
  { letter: 'BA', min: 85, points: 3.5 },
  { letter: 'BB', min: 80, points: 3 },
  { letter: 'CB', min: 75, points: 2.5 },
  { letter: 'CC', min: 70, points: 2 },
  { letter: 'DC', min: 65, points: 1.5 },
  { letter: 'DD', min: 60, points: 1 },
  { letter: 'FD', min: 50, points: 0.5 },
  { letter: 'FF', min: 0, points: 0 },
]

export type GradeComponentInput = {
  id: string
  weight: number
  /** 0–100; null = henüz girilmedi. */
  score: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Büyükten küçüğe sıralı kopya; en küçük eşik 0'dan büyükse altı son harfe düşer. */
const sortedTable = (table: readonly LetterRow[]) => [...table].sort((a, b) => b.min - a.min)

/** Puanın harfi: eşiği puana eşit ya da altında olan en yüksek satır. */
export function letterFor(score: number, table: readonly LetterRow[] = DEFAULT_LETTER_TABLE): LetterRow {
  const rows = sortedTable(table)
  return rows.find((r) => score >= r.min) ?? rows[rows.length - 1]!
}

export function letterPoints(letter: string, table: readonly LetterRow[] = DEFAULT_LETTER_TABLE): number | null {
  return table.find((r) => r.letter === letter)?.points ?? null
}

export type WeightedScore = {
  /** Girilen notların toplam katkısı, 100 üzerinden (Σ ağırlık × puan / toplam ağırlık). */
  earned: number
  /** Notu girilmiş bileşenlerin ağırlık toplamı (%). */
  completedWeight: number
  /** Bütün bileşenlerin ağırlık toplamı (%); 100 değilse arayüz uyarır. */
  totalWeight: number
  /** Şu anki gidişat: girilen bileşenlerdeki ağırlıklı ortalama; hiç not yoksa null. */
  current: number | null
}

/** Şu anki ağırlıklı puan ve tamamlanan ağırlık. Ağırlıklar toplamı 100 değilse toplama göre ölçeklenir. */
export function weightedScore(components: readonly GradeComponentInput[]): WeightedScore {
  let totalWeight = 0
  let completedWeight = 0
  let sum = 0
  for (const c of components) {
    if (c.weight <= 0) continue
    totalWeight += c.weight
    if (c.score !== null) {
      completedWeight += c.weight
      sum += c.weight * c.score
    }
  }
  return {
    earned: totalWeight > 0 ? round1(sum / totalWeight) : 0,
    completedWeight: round1(completedWeight),
    totalWeight: round1(totalWeight),
    current: completedWeight > 0 ? round1(sum / completedWeight) : null,
  }
}

/** Kalan bileşenler de verilen puanlarla girilseydi dönem sonu puanı (senaryo kaydırıcısı). */
export function projectedScore(
  components: readonly GradeComponentInput[],
  assumed: Readonly<Record<string, number>>,
): number | null {
  const filled = components.map((c) => ({ ...c, score: c.score ?? assumed[c.id] ?? null }))
  const w = weightedScore(filled)
  return w.completedWeight > 0 ? w.earned : null
}

export type RequiredScores =
  /** Bütün bileşenler girildi; sonuç belli. */
  | { status: 'final'; score: number; letter: string; reached: boolean }
  /** Kalan her bileşende en az `min` gerekli. */
  | { status: 'needs'; min: number; remaining: string[] }
  /** Kalanlardan 0 alsa bile hedef tutuyor. */
  | { status: 'secured'; remaining: string[] }
  /** Kalanlardan 100 alsa bile yetmiyor; `best` = alınabilecek en yüksek puan. */
  | { status: 'impossible'; best: number; bestLetter: string; remaining: string[] }

/**
 * Hedef harf için kalan her bileşende gereken en düşük puan (hepsinde aynı puan varsayımıyla; tam sayıya
 * yukarı yuvarlanır). Hedef harf tabloda yoksa en yüksek harf alınır.
 */
export function requiredScores(
  components: readonly GradeComponentInput[],
  targetLetter: string,
  table: readonly LetterRow[] = DEFAULT_LETTER_TABLE,
): RequiredScores {
  const target = table.find((r) => r.letter === targetLetter) ?? sortedTable(table)[0]!
  const live = components.filter((c) => c.weight > 0)
  const w = weightedScore(live)
  const remaining = live.filter((c) => c.score === null)
  if (!remaining.length) {
    const letter = letterFor(w.earned, table)
    return { status: 'final', score: w.earned, letter: letter.letter, reached: w.earned >= target.min }
  }
  const ids = remaining.map((c) => c.id)
  const remainingWeight = remaining.reduce((n, c) => n + c.weight, 0)
  const doneSum = live.reduce((n, c) => n + (c.score === null ? 0 : c.weight * c.score), 0)
  // Σ(w·s) + x·Σw_kalan ≥ hedef × Σw
  const need = (target.min * w.totalWeight - doneSum) / remainingWeight
  // Kayan nokta: 60.0000001 → 61 olmasın.
  const min = Math.ceil(need - 1e-9)
  if (min <= 0) return { status: 'secured', remaining: ids }
  if (min > 100) {
    const best = round1((doneSum + 100 * remainingWeight) / w.totalWeight)
    return { status: 'impossible', best, bestLetter: letterFor(best, table).letter, remaining: ids }
  }
  return { status: 'needs', min, remaining: ids }
}

export type GpaCourse = {
  /** Tekrar alınan dersi tanımak için (ders kodu; yoksa ad). */
  key: string
  credit: number
  /** Harf tablosundaki katsayı; null = harfi yok (ortalamaya girmez). */
  points: number | null
  /** Dönem sırası (eski → yeni); tekrar alınan derste son not geçerli. */
  order: number
}

export type GpaResult = { gpa: number | null; credits: number }

/** Σ(kredi × katsayı) / Σ kredi. Aynı anahtarlı derslerden en son alınan sayılır. */
export function gpa(courses: readonly GpaCourse[]): GpaResult {
  const latest = new Map<string, GpaCourse>()
  for (const c of courses) {
    if (c.points === null || c.credit <= 0) continue
    const key = c.key.trim().toLocaleLowerCase('tr-TR')
    const prev = latest.get(key)
    if (!prev || c.order >= prev.order) latest.set(key, c)
  }
  let credits = 0
  let sum = 0
  for (const c of latest.values()) {
    credits += c.credit
    sum += c.credit * c.points!
  }
  return { gpa: credits > 0 ? Math.round((sum / credits) * 100) / 100 : null, credits }
}

/** Türkçe ondalık: 3,25 */
export const formatDecimal = (n: number, digits = 2) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
