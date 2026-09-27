// Bilgi notları için saf yardımcılar: etiket normalize, markdown'dan önizleme, FTS5 sorgusu, snippet vurgusu.

export const TAG_MAX = 40
export const PREVIEW_MAX = 200

/** "  #Unity  Shader " → "unity shader". Boşsa ''. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .slice(0, TAG_MAX)
    .trim()
}

/** Etiket listesini normalize eder; boşları ve tekrarları atar, sırayı korur. */
export function normalizeTags(raw: readonly string[]): string[] {
  return [...new Set(raw.map(normalizeTag).filter(Boolean))]
}

/** Markdown'ı düz metne indirger (önizleme ve arama snippet'i için). Satırlar tek boşlukla birleşir. */
export function stripMarkdown(md: string): string {
  return (
    md
      // Resimler tamamen düşer, bağlantılardan metin kalır.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      // Snippet resim sözdiziminin ortasından kesilebilir: açıkta kalan yerel medya adresi de düşer.
      .replace(/sm-media:\/\/[^\s)]*\)?/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Kod çiti satırları düşer, içerik kalır.
      .replace(/^\s*(```|~~~).*$/gm, ' ')
      // Satır başı işaretleri: başlık, alıntı, liste, onay kutusu.
      .replace(/^[ \t]*(>[ \t]?)+/gm, '')
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
      .replace(/^[ \t]*([-*+]|\d+[.)])[ \t]+(\[[ xX]\][ \t]+)?/gm, '')
      .replace(/^[ \t]*([-*_][ \t]*){3,}$/gm, ' ')
      // Satır içi vurgu ve kod.
      .replace(/(\*\*|__|~~)(?=\S)(.+?)(?<=\S)\1/g, '$2')
      .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, '$1')
      // snake_case_ad bozulmasın: alt çizgi vurgusu kelime sınırında.
      .replace(/(?<![\p{L}\p{N}])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}])/gu, '$1')
      .replace(/`+/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Not listesindeki iki satırlık önizleme. */
export function notePreview(md: string, max = PREVIEW_MAX): string {
  const text = stripMarkdown(md)
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** Gövdedeki ilk `prefix` ile başlayan resmin adresi (liste küçük görseli). */
export function firstImageUrl(md: string, prefix: string): string | null {
  for (const m of md.matchAll(/!\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) {
    if (m[1]?.startsWith(prefix)) return m[1]
  }
  return null
}

/**
 * Kullanıcı sorgusunu FTS5 MATCH ifadesine çevirir: her kelime tırnaklı (operatör enjeksiyonu yok),
 * son kelime önek eşleşmeli ("ses ef" → `"ses" "ef"*`). Kelime yoksa null.
 * Harf katlama tokenizer'a bırakılır: dizinle aynı kurallar (unicode61 remove_diacritics 2).
 */
export function ftsQuery(input: string): string | null {
  const words = input.match(/[\p{L}\p{N}_]+/gu)
  if (!words) return null
  return words.map((w, i) => `"${w}"${i === words.length - 1 ? '*' : ''}`).join(' ')
}

export const SNIPPET_OPEN = '\u0001'
export const SNIPPET_CLOSE = '\u0002'

export type Range = [start: number, end: number]

/**
 * `snippet()` çıktısını düz metne ve vurgu aralıklarına ayırır. İşaretçiler markdown sözdizimi
 * olmadığı için metin önce `stripMarkdown`'dan geçer; kesilmiş (eşsiz) işaretçiler tolere edilir.
 */
export function parseSnippet(raw: string): { text: string; ranges: Range[] } {
  const clean = stripMarkdown(raw)
  const ranges: Range[] = []
  let text = ''
  let open: number | null = null
  for (const ch of clean) {
    if (ch === SNIPPET_OPEN) {
      open ??= text.length
    } else if (ch === SNIPPET_CLOSE) {
      if (open !== null && text.length > open) ranges.push([open, text.length])
      open = null
    } else {
      text += ch
    }
  }
  if (open !== null && text.length > open) ranges.push([open, text.length])
  return { text, ranges }
}
