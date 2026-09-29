import { format, subDays } from 'date-fns'
import type { DayKey } from '@shared/ipc'

// Playtest kutusu (PROJELER.md > Playtest kutusu): yapıştırılan test mesajlarını kişilere ve noktalara böler,
// benzer noktaları kök kümeleriyle gruplar ve "5 kişiden 3'ü" sayısını çıkarır. Tamamen algoritmik; AI yok.


export const SIMILARITY_JACCARD = 0.34
export const SIMILARITY_SHARED_CONTENT = 2
export const MIN_POINT_WORDS = 3
export const STEM_LENGTH = 5
export const TESTER_WINDOW_DAYS = 30

// ---------------------------------------------------------------------------
// Sohbet kopyası ayrıştırma

export type ChatEntry = { tester: string | null; receivedOn: DayKey; text: string }

const NAME = '([^:\\[\\]]{1,40}?)'
const DATE = '(\\d{1,2})[./](\\d{1,2})[./](\\d{2,4})'
const TIME = '\\d{1,2}[:.]\\d{2}(?:[:.]\\d{2})?'

/** "[12:03] Ali: ..." ya da "[29.09.2026 12:03] Ali: ..." (Discord, iOS WhatsApp). */
const BRACKET_LINE = new RegExp(`^\\[(?:${DATE},?\\s+)?${TIME}\\]\\s*${NAME}:\\s*(.*)$`)
/** "29.09.2026 12:03 - Ali: ..." (Android WhatsApp). */
const WHATSAPP_LINE = new RegExp(`^${DATE},?\\s+${TIME}\\s*[-–—]\\s*${NAME}:\\s*(.*)$`)
/** Discord başlığı: "Ali — Bugün 12:03", "Ali — Dün saat 12:03", "Ali — 29.09.2026 12:03". Mesaj alt satırlarda. */
const DISCORD_HEADER = new RegExp(
  `^(.{1,40}?)\\s+[—–-]\\s+(?:(bugün|dün|today|yesterday)|${DATE})\\s*(?:saat\\s+|at\\s+)?${TIME}$`,
  'iu'
)

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dayKeyFrom(d: string | undefined, m: string | undefined, y: string | undefined): DayKey | null {
  if (!d || !m || !y) return null
  const day = Number(d)
  const month = Number(m)
  let year = Number(y)
  if (y.length === 2) year += 2000
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

function previousDay(key: DayKey): DayKey {
  const [y = 0, m = 1, d = 1] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d - 1))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

type LineMatch = { tester: string; receivedOn: DayKey; text: string }

function matchLine(line: string, fallbackDate: DayKey): LineMatch | null {
  const bracket = BRACKET_LINE.exec(line)
  if (bracket) {
    const [, d, m, y, name = '', text = ''] = bracket
    const day = d ? dayKeyFrom(d, m, y) : fallbackDate
    return { tester: name.trim(), receivedOn: day ?? fallbackDate, text }
  }
  const whatsapp = WHATSAPP_LINE.exec(line)
  if (whatsapp) {
    const [, d, m, y, name = '', text = ''] = whatsapp
    return { tester: name.trim(), receivedOn: dayKeyFrom(d, m, y) ?? fallbackDate, text }
  }
  const discord = DISCORD_HEADER.exec(line)
  if (discord) {
    const [, name = '', relative, d, m, y] = discord
    let day: DayKey | null = fallbackDate
    if (relative) {
      const r = relative.toLocaleLowerCase('tr-TR')
      if (r === 'dün' || r === 'yesterday') day = previousDay(fallbackDate)
    } else {
      day = dayKeyFrom(d, m, y)
    }
    return { tester: name.trim(), receivedOn: day ?? fallbackDate, text: '' }
  }
  return null
}

/**
 * Discord/WhatsApp kopyasını kişi + gün + metin girdilerine ayırır. Aynı kişinin aynı gündeki ardışık satırları
 * tek girdide birleşir. Tanınan bir kalıp yoksa bütün metin tek girdi olur (kişi: null, gün: fallbackDate).
 */
export function parseChatLines(raw: string, fallbackDate: DayKey): ChatEntry[] {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const entries: ChatEntry[] = []
  let current: ChatEntry | null = null
  let matched = false

  const push = (tester: string | null, receivedOn: DayKey, text: string): void => {
    if (current && current.tester === tester && current.receivedOn === receivedOn) {
      if (text) current.text = current.text ? `${current.text}\n${text}` : text
      return
    }
    current = { tester, receivedOn, text }
    entries.push(current)
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const m = matchLine(line, fallbackDate)
    if (m) {
      matched = true
      push(m.tester, m.receivedOn, m.text.trim())
    } else if (current) {
      const c: ChatEntry = current
      c.text = c.text ? `${c.text}\n${line}` : line
    } else {
      push(null, fallbackDate, line)
    }
  }

  if (!matched) {
    const text = raw.trim()
    return text ? [{ tester: null, receivedOn: fallbackDate, text }] : []
  }
  return entries.filter((e) => e.text.length > 0)
}

// ---------------------------------------------------------------------------
// Noktalara bölme

const BULLET = /^\s*(?:[-*•–—·]|\d{1,2}[.)])\s+/
const SENTENCE_END = /(?<=[.!?…])\s+/u

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

/**
 * Metni satır, madde işareti ve cümle sonlarından noktalara böler. 3 kelimeden kısa parçalar öncekine eklenir;
 * önceki yoksa sonrakinin başına geçer; tek parçaysa olduğu gibi kalır.
 */
export function splitPoints(text: string): string[] {
  const fragments: string[] = []
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(BULLET, '').trim()
    if (!line) continue
    for (const part of line.split(SENTENCE_END)) {
      const p = part.trim()
      if (p && /[\p{L}\p{N}]/u.test(p)) fragments.push(p)
    }
  }

  const points: string[] = []
  let carry = ''
  for (const f of fragments) {
    const piece = carry ? `${carry} ${f}` : f
    carry = ''
    if (wordCount(f) >= MIN_POINT_WORDS) points.push(piece)
    else if (points.length) points[points.length - 1] = `${points[points.length - 1]} ${piece}`
    else carry = piece
  }
  if (carry) points.push(carry)
  return points
}

// ---------------------------------------------------------------------------
// Kökler ve benzerlik

/** Türkçe dolgu kelimeleri: anlam taşımaz, benzerliği şişirir. */
export const FILLER_WORDS: ReadonlySet<string> = new Set([
  've', 'veya', 'ya', 'yada', 'ama', 'fakat', 'ancak', 'lakin', 'çok', 'az', 'bir', 'biraz', 'bu', 'şu', 'o',
  'bunu', 'şunu', 'onu', 'bunda', 'orada', 'burada', 'şurada', 'da', 'de', 'ki', 'gibi', 'sonra', 'önce', 'için',
  'ile', 'en', 'daha', 'mi', 'mı', 'mu', 'mü', 'ben', 'sen', 'biz', 'siz', 'onlar', 'bana', 'beni', 'bence', 'var',
  'yok', 'hem', 'ne', 'neden', 'niye', 'çünkü', 'olarak', 'olan', 'oldu', 'olur', 'olmuş', 'bile', 'hep', 'her',
  'hiç', 'şey', 'şeyi', 'şeyler', 'gerçekten', 'baya', 'bayağı', 'tam', 'falan', 'filan', 'yani', 'işte', 'zaten',
  'sanki', 'belki', 'artık', 'hala', 'hâlâ', 'kadar', 'diye', 'dedi', 'bi', 'aslında', 'galiba', 'sadece',
  'tek', 'hani', 'evet', 'hayır', 'tamam', 'ok', 'abi', 'kanka', 'yine', 'gene', 'şimdi', 'the', 'a', 'an',
  'and', 'or', 'is', 'it', 'to', 'of',
])

/** tr-TR küçük harf, noktalama ve kesme işaretinden sonraki ek atılır, dolgu kelimeleri düşer, ilk 5 harf kök. */
export function stems(text: string): string[] {
  const words = text
    .normalize('NFC')
    .toLocaleLowerCase('tr-TR')
    .replace(/['’][\p{L}]*/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !FILLER_WORDS.has(w))
  const out: string[] = []
  const seen = new Set<string>()
  for (const w of words) {
    const s = Array.from(w).slice(0, STEM_LENGTH).join('')
    if (!seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size === 0 && sb.size === 0) return 0
  let inter = 0
  for (const s of sa) if (sb.has(s)) inter++
  return inter / (sa.size + sb.size - inter)
}

/** Jaccard ≥ 0,34 ya da en az 2 ortak içerik kökü (proje sözlüğü: görev başlıkları, GDD). */
export function similarity(
  a: readonly string[],
  b: readonly string[],
  contentStems: ReadonlySet<string>
): boolean {
  if (jaccard(a, b) >= SIMILARITY_JACCARD) return true
  const sb = new Set(b)
  let shared = 0
  for (const s of new Set(a)) if (sb.has(s) && contentStems.has(s)) shared++
  return shared >= SIMILARITY_SHARED_CONTENT
}

// ---------------------------------------------------------------------------
// Kümeleme

export type ClusterablePoint = {
  id: string
  stems: string[]
  clusterId: string | null
  /** Taha elle yerleştirdi: algoritma dokunmaz. */
  locked: boolean
}

/**
 * Tek bağlantılı kümeleme. Kümesi olan noktalar (kilitli ya da değil) yerinde kalır; algoritma yalnız kümesiz
 * noktaları yerleştirir. Yeni nokta, üyelerinden en az biriyle benzer olan kümeler içinde en yüksek Jaccard'lı
 * kümeye girer (eşitlikte önce oluşan küme); hiçbiri yoksa yeni küme açılır. Elle ayrılmış (kilitli, kümesiz)
 * nokta kendi kümesini alır. Sıra girdi sırasıdır, sonuç belirlenimcidir.
 */
export function clusterPoints(
  points: readonly ClusterablePoint[],
  contentStems: ReadonlySet<string>,
  newClusterId: () => string
): Map<string, string> {
  const result = new Map<string, string>()
  const clusters = new Map<string, ClusterablePoint[]>()
  const addTo = (clusterId: string, p: ClusterablePoint): void => {
    result.set(p.id, clusterId)
    const list = clusters.get(clusterId)
    if (list) list.push(p)
    else clusters.set(clusterId, [p])
  }

  for (const p of points) if (p.clusterId !== null) addTo(p.clusterId, p)

  for (const p of points) {
    if (p.clusterId !== null) continue
    if (p.locked) {
      addTo(newClusterId(), p)
      continue
    }
    let best: string | null = null
    let bestScore = -1
    for (const [clusterId, members] of clusters) {
      let score = -1
      for (const m of members) {
        if (similarity(p.stems, m.stems, contentStems)) score = Math.max(score, jaccard(p.stems, m.stems))
      }
      if (score > bestScore) {
        bestScore = score
        best = clusterId
      }
    }
    addTo(best ?? newClusterId(), p)
  }
  return result
}

// ---------------------------------------------------------------------------
// Sayım ve etiketler

function testerKey(name: string): string {
  return name.trim().toLocaleLowerCase('tr-TR')
}

/** Son `days` gündeki (bugün dahil) farklı test eden sayısı. Kişisiz girdiler sayılmaz. */
export function countDistinctTesters(
  entries: readonly { tester: string | null; receivedOn: DayKey }[],
  now: number | Date,
  days = TESTER_WINDOW_DAYS
): number {
  const today = format(now, 'yyyy-MM-dd')
  const cutoff = format(subDays(now, days - 1), 'yyyy-MM-dd')
  const set = new Set<string>()
  for (const e of entries) {
    if (!e.tester || !e.tester.trim()) continue
    if (e.receivedOn < cutoff || e.receivedOn > today) continue
    set.add(testerKey(e.tester))
  }
  return set.size
}

/**
 * Pay: kümedeki farklı kişi. Payda: son 30 günün farklı test edenleri (pay'dan küçük olamaz).
 * `recentTesters` son 30 günün kişi adlarıdır (tekrar olabilir).
 */
export function clusterCount(
  members: readonly { tester: string | null; receivedOn?: DayKey }[],
  recentTesters: readonly string[]
): { people: number; of: number } {
  const people = new Set(
    members.filter((m) => m.tester && m.tester.trim()).map((m) => testerKey(m.tester as string))
  ).size
  const of = new Set(recentTesters.filter((t) => t.trim()).map(testerKey)).size
  return { people, of: Math.max(of, people) }
}

const ONES_SUFFIX = ['ı', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'] // sıfır, bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz
const TENS_SUFFIX = ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'] // on, yirmi, otuz, kırk, elli, altmış, yetmiş, seksen, doksan

/** Sayının iyelik eki, kesme işaretiyle: 1'i, 2'si, 3'ü, 6'sı, 10'u, 40'ı, 100'ü, 1000'i. Okunuşun son kelimesine göre. */
export function numberSuffix(n: number): string {
  const v = Math.abs(Math.trunc(n))
  let suffix: string
  if (v % 10 !== 0 || v === 0) suffix = ONES_SUFFIX[v % 10] ?? ''
  else if (v % 100 !== 0) suffix = TENS_SUFFIX[(v % 100) / 10] ?? ''
  else if (v % 1000 !== 0) suffix = 'ü' // yüz
  else if (v % 1_000_000 !== 0) suffix = 'i' // bin
  else if (v % 1_000_000_000 !== 0) suffix = 'u' // milyon
  else suffix = 'ı' // milyar
  return `${v}'${suffix}`
}

/** "5 kişiden 3'ü" */
export function clusterCountLabel(count: { people: number; of: number }): string {
  return `${count.of} kişiden ${numberSuffix(count.people)}`
}

/** Küme başlığı: en kısa nokta (eşitlikte ilk). */
export function clusterTitle(points: readonly string[]): string {
  let best: string | null = null
  let bestLen = Infinity
  for (const p of points) {
    const t = p.trim()
    const len = Array.from(t).length
    if (t && len < bestLen) {
      best = t
      bestLen = len
    }
  }
  return best ?? ''
}
