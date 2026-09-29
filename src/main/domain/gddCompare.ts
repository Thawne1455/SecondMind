// GDD ile gerçeklik karşılaştırması (PROJELER.md > 4. Dokümantasyon, 5d-2). Tamamen algoritmik:
// GDD markdown'ından sayılar (tablo satırları ve "ses listesi / sahneler / bölümler" bölümlerinin boyu),
// klasörden sayılar (sahne, ses, script ve sayım kuralı globları), ikisinin farkı ve kural önerisi.

export type GddCount = {
  label: string
  count: number
  /** table: tablo satırındaki sayı; section: bölümdeki satır/madde sayısı. */
  source: 'table' | 'section'
}

export type CountRule = { label: string; glob: string }

/** Klasörden hazır sayımlar (kural gerekmez). */
export type BuiltinKind = 'scenes' | 'audio' | 'scripts'

export type CompareRow = {
  label: string
  gdd: number
  /** null = klasörde karşılığı yok (kural önerisi beklenir). */
  folder: number | null
  /** Sayımın nereden geldiği: hazır sayım ya da kural globu. */
  via: { kind: 'builtin'; builtin: BuiltinKind } | { kind: 'rule'; glob: string } | null
  state: 'missing' | 'extra' | 'equal' | 'unknown'
}

const SECTION_WORDS = ['ses listesi', 'sahneler', 'bölümler']

const lower = (s: string) => s.normalize('NFC').toLocaleLowerCase('tr-TR')

/** Hücre metni: markdown vurgusu, kod ve bağlantı işaretleri atılır. */
function cellText(cell: string): string {
  return cell
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

function splitRow(line: string): string[] | null {
  const t = line.trim()
  if (!t.startsWith('|')) return null
  const inner = t.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split(/(?<!\\)\|/).map((c) => c.trim())
}

const isSeparator = (cells: string[]) =>
  cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')))

/** Hücredeki ilk tam sayı ("8 (tip başına 2)" → 8, "1:20" → 1). */
export function firstInteger(cell: string): number | null {
  const m = /(?<![\d.,])\d{1,6}(?![.,]\d)/.exec(cell)
  return m ? Number(m[0]) : null
}

/** Etiket bir sayı değil, en az bir harf içeriyor. */
const isLabel = (s: string) => /\p{L}/u.test(s) && firstInteger(s) === null

type Heading = { level: number; text: string; line: number }

function headings(lines: readonly string[]): Heading[] {
  const out: Heading[] = []
  let fence = false
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) fence = !fence
    if (fence) return
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l)
    if (m) out.push({ level: m[1]!.length, text: m[2]!, line: i })
  })
  return out
}

/** Bölüm başlığından etiket: numara ("12.", "4.1") ve vurgu atılır. */
function headingLabel(text: string): string {
  return cellText(text.replace(/^\s*\d+(\.\d+)*\.?\s+/, ''))
}

/**
 * GDD'deki sayılar: (1) tablo satırları — ilk hücre etiket, sonraki hücrelerden birindeki ilk tam sayı;
 * (2) başlığında "ses listesi", "sahneler" ya da "bölümler" geçen bölümün tablo satırı ya da madde sayısı.
 * Aynı etiketin ilk görüleni kalır (büyük/küçük harf duyarsız).
 */
export function extractGddCounts(markdown: string): GddCount[] {
  const all = markdown.replace(/\r\n?/g, '\n').split('\n')
  // Kod bloğu satırları boşaltılır: içindeki tablo ya da madde sayılmaz, satır numaraları korunur.
  let fence = false
  const lines = all.map((l) => {
    if (/^\s*```/.test(l)) {
      fence = !fence
      return ''
    }
    return fence ? '' : l
  })
  const out: GddCount[] = []
  const seen = new Set<string>()
  const push = (c: GddCount) => {
    const key = lower(c.label)
    if (!c.label || seen.has(key)) return
    seen.add(key)
    out.push(c)
  }

  // Bölüm sayıları önce; bu bölümlerin tabloları liste sayılır, satırlarından ayrıca sayı okunmaz.
  const listed = new Set<number>()
  const hs = headings(lines)
  hs.forEach((h, idx) => {
    const text = lower(h.text)
    if (!SECTION_WORDS.some((w) => text.includes(w))) return
    const next = hs.slice(idx + 1).find((x) => x.level <= h.level)
    const from = h.line + 1
    const to = next ? next.line : lines.length
    let rows = 0
    let tableSeen = false
    let header = true
    for (let i = from; i < to; i++) {
      listed.add(i)
      const cells = splitRow(lines[i]!)
      if (!cells) {
        header = true
        continue
      }
      tableSeen = true
      if (isSeparator(cells)) continue
      if (header) {
        header = false
        continue
      }
      if (cells.some((c) => cellText(c))) rows++
    }
    const items = tableSeen
      ? rows
      : lines.slice(from, to).filter((l) => /^(?:[-*+]|\d+[.)])\s+\S/.test(l)).length
    if (items > 0) push({ label: headingLabel(h.text), count: items, source: 'section' })
  })

  let inTable = false
  lines.forEach((l, i) => {
    const cells = listed.has(i) ? null : splitRow(l)
    if (!cells) {
      inTable = false
      return
    }
    if (!inTable) {
      inTable = true // başlık satırı
      return
    }
    if (isSeparator(cells) || cells.length < 2) return
    const label = cellText(cells[0]!)
    if (!isLabel(label)) return
    for (const c of cells.slice(1)) {
      const n = firstInteger(cellText(c))
      if (n !== null) {
        push({ label, count: n, source: 'table' })
        break
      }
    }
  })
  return out
}

// ---------------------------------------------------------------------------
// Klasör eşleştirme

/** Etiket kelimesinin İngilizce karşılıkları (klasör adları çoğu zaman İngilizce). İlk 5 harf kökle aranır. */
const SYNONYMS: Record<string, string[]> = {
  silah: ['weapon'],
  düşma: ['enemy', 'enemies', 'dusman'],
  bölüm: ['level', 'chapter', 'bolum'],
  sahne: ['scene'],
  müzik: ['music', 'muzik'],
  parça: ['track', 'music', 'song'],
  ses: ['audio', 'sound', 'sfx'],
  karak: ['character', 'hero'],
  eşya: ['item', 'esya'],
  relic: ['relic'],
  tur: ['round', 'wave'],
  aile: ['family', 'families'],
  harit: ['map'],
  görev: ['quest', 'mission'],
  yeten: ['skill', 'ability'],
  büyü: ['spell', 'magic'],
}

const STEM = 5

function stem(word: string): string {
  return Array.from(lower(word)).slice(0, STEM).join('')
}

/** Etiketin aranacak kökleri: kelimelerin kökleri ve İngilizce karşılıkları. */
export function labelStems(label: string): string[] {
  const words = lower(label)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length >= 3)
  const out = new Set<string>()
  for (const w of words) {
    const s = stem(w)
    out.add(s)
    for (const [k, list] of Object.entries(SYNONYMS))
      if (s.startsWith(k) || k.startsWith(s)) for (const e of list) out.add(stem(e))
  }
  return [...out]
}

/** Etiketin hazır sayımı: sahne, ses ya da script. */
export function builtinFor(label: string): BuiltinKind | null {
  const l = lower(label)
  if (/sahne|scene|bölümler/.test(l)) return 'scenes'
  if (/ses listesi|müzik|parça|ses efekt|sound|music|audio/.test(l)) return 'audio'
  if (/script|betik/.test(l)) return 'scripts'
  return null
}

export type DirInfo = {
  /** Klasöre göre göreli, '/' ayraçlı. */
  path: string
  /** Doğrudan içindeki dosyaların adları (.meta hariç). */
  files: string[]
}

/**
 * Etiketle eşleşen klasörden kural önerisi. Klasörün son adı etiketin bir köküyle başlıyorsa aday; veri
 * klasörleri (`.asset` içeren) önce, sonra daha çok dosyalı, sonra kısa yol. Glob: `.asset` varsa
 * `<klasör>/*.asset`, yoksa `<klasör>/*`.
 */
export function suggestRule(label: string, dirs: readonly DirInfo[]): CountRule | null {
  const stems = labelStems(label)
  if (!stems.length) return null
  const candidates = dirs.filter((d) => {
    const name = stem(d.path.split('/').pop() ?? '')
    return (
      d.files.length > 0 &&
      stems.some((s) => name.startsWith(s) || (name.length >= 4 && s.startsWith(name)))
    )
  })
  if (!candidates.length) return null
  const score = (d: DirInfo) => {
    const assets = d.files.filter((f) => /\.asset$/i.test(f)).length
    return [assets > 0 ? 1 : 0, assets || d.files.length, -d.path.length] as const
  }
  candidates.sort((a, b) => {
    const [a1, a2, a3] = score(a)
    const [b1, b2, b3] = score(b)
    return b1 - a1 || b2 - a2 || b3 - a3 || a.path.localeCompare(b.path)
  })
  const best = candidates[0]!
  const hasAssets = best.files.some((f) => /\.asset$/i.test(f))
  return { label, glob: `${best.path}/${hasAssets ? '*.asset' : '*'}` }
}

// ---------------------------------------------------------------------------
// Karşılaştırma

/**
 * GDD sayılarını klasörle karşılaştırır. Kural (etiket eşleşmesi büyük/küçük harf duyarsız) varsa onun sayısı,
 * yoksa hazır sayım; ikisi de yoksa `unknown`. Eksik (klasör < GDD) önce, sonra fazla, bilinmeyen, eşit.
 */
export function compareCounts(
  gdd: readonly GddCount[],
  rules: readonly CountRule[],
  ruleCounts: ReadonlyMap<string, number>,
  builtins: Readonly<Record<BuiltinKind, number | null>>,
): CompareRow[] {
  const byLabel = new Map(rules.map((r) => [lower(r.label), r]))
  const rows = gdd.map((g): CompareRow => {
    const rule = byLabel.get(lower(g.label))
    if (rule) {
      const folder = ruleCounts.get(rule.glob) ?? 0
      return {
        label: g.label,
        gdd: g.count,
        folder,
        via: { kind: 'rule', glob: rule.glob },
        state: stateOf(g.count, folder),
      }
    }
    const b = builtinFor(g.label)
    const folder = b ? builtins[b] : null
    if (b && folder !== null)
      return {
        label: g.label,
        gdd: g.count,
        folder,
        via: { kind: 'builtin', builtin: b },
        state: stateOf(g.count, folder),
      }
    return { label: g.label, gdd: g.count, folder: null, via: null, state: 'unknown' }
  })
  const order = { missing: 0, extra: 1, unknown: 2, equal: 3 }
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => order[a.r.state] - order[b.r.state] || a.i - b.i)
    .map((x) => x.r)
}

function stateOf(gdd: number, folder: number): CompareRow['state'] {
  if (folder < gdd) return 'missing'
  if (folder > gdd) return 'extra'
  return 'equal'
}

/** "GDD'de 12 parça, klasörde 7" */
export function compareText(row: CompareRow): string {
  const label = lower(row.label)
  if (row.folder === null) return `GDD'de ${row.gdd} ${label}`
  return `GDD'de ${row.gdd} ${label}, klasörde ${row.folder}`
}
