// Komut paleti eşleşmesi: Türkçe büyük/küçük harf duyarsız, her kelime metinde geçmeli.

export type Range = readonly [start: number, end: number]

const lower = (s: string) => s.toLocaleLowerCase('tr-TR')

/**
 * Sorgunun her kelimesi metinde geçiyorsa vurgulanacak aralıkları döner, geçmiyorsa null.
 * Boş sorgu her şeyle eşleşir (aralıksız).
 */
export function matchText(text: string, query: string): Range[] | null {
  const words = lower(query).split(/\s+/).filter(Boolean)
  const haystack = lower(text)
  const ranges: Range[] = []
  for (const word of words) {
    let from = haystack.indexOf(word)
    if (from === -1) return null
    while (from !== -1) {
      ranges.push([from, from + word.length])
      from = haystack.indexOf(word, from + word.length)
    }
  }
  return mergeRanges(ranges)
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}
