// Claude Code oturum kayıtlarından otomatik oturumlar (Aşama 5b). Claude Code her konuşmayı
// `%USERPROFILE%\.claude\projects\<kodlanmış-klasör>\<oturum-id>.jsonl` altında tutar.
// Sadece üst veri alınır: zaman damgası, cwd, oturum id'si ve dosya düzenleyen araçların dosya yolu.
// Mesaj metni hiçbir yerde saklanmaz ve yorumlanmaz.

/** Olaylar arasında bundan uzun boşluk varsa yeni oturum başlar. */
export const SESSION_GAP_MIN = 30
/** Bundan kısa aralıklar (tek bir soru) oturum sayılmaz. */
export const SESSION_MIN_MIN = 5

/** Dosya yazan araçlar; `Read` gibi okuyanlar sayılmaz. */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export type ClaudeEvent = {
  at: number
  cwd: string
  sessionId: string
  /** Bu olayda düzenlenen dosyalar (mutlak yol). */
  edited: string[]
}

/**
 * Claude Code'un klasör adı: harf ve rakam dışındaki her karakter `-` olur
 * (`C:\ajanda\Runika` → `C--ajanda-Runika`, `Masaüstü` → `Masa-st-`).
 */
export function encodeClaudeDir(path: string): string {
  return path.replace(/[\\/]+$/, '').replace(/[^A-Za-z0-9]/g, '-')
}

/**
 * Proje klasörünü içerebilecek kayıt klasörleri: projenin kendisi, alt klasörleri ve üst klasörleri
 * (`C:\ajanda`'dan açılıp Runika'da çalışılan oturum). Kesin eşleşme cwd ile yapılır.
 */
export function candidateDirs(dirNames: readonly string[], projectPath: string): string[] {
  const own = encodeClaudeDir(projectPath).toLowerCase()
  return dirNames.filter((d) => {
    const name = d.toLowerCase()
    return own.startsWith(name) || name.startsWith(own)
  })
}

const norm = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLocaleLowerCase('en-US')

/** `path` klasörün kendisi ya da içinde mi (Windows: büyük/küçük harf duyarsız). */
export function isInside(path: string, folder: string): boolean {
  const p = norm(path)
  const f = norm(folder)
  return p === f || p.startsWith(`${f}\\`)
}

/** Klasöre göre göreli, ileri eğik çizgili yol; dışındaysa null. */
export function relativeTo(path: string, folder: string): string | null {
  if (!isInside(path, folder)) return null
  const rest = path.replace(/\//g, '\\').slice(folder.replace(/[\\/]+$/, '').length)
  const rel = rest.replace(/^\\+/, '').replace(/\\/g, '/')
  return rel || null
}

type RawLine = {
  timestamp?: unknown
  cwd?: unknown
  sessionId?: unknown
  isSidechain?: unknown
  message?: { content?: unknown }
}

/**
 * Tek jsonl satırından üst veri. Zaman damgası, cwd ve oturum id'si olmayan satırlar (özet, maliyet,
 * dosya geçmişi) ve yan ajan (sidechain) satırları atlanır.
 */
export function parseEventLine(line: string): ClaudeEvent | null {
  // Hızlı eleme: zaman damgası ve cwd'siz satırları ayrıştırmaya gerek yok.
  if (!line.includes('"timestamp"') || !line.includes('"cwd"')) return null
  let raw: RawLine
  try {
    raw = JSON.parse(line) as RawLine
  } catch {
    return null
  }
  if (typeof raw.timestamp !== 'string' || typeof raw.cwd !== 'string') return null
  if (typeof raw.sessionId !== 'string' || raw.isSidechain === true) return null
  const at = Date.parse(raw.timestamp)
  if (Number.isNaN(at)) return null
  const edited: string[] = []
  const content = raw.message?.content
  if (Array.isArray(content)) {
    for (const block of content as { type?: unknown; name?: unknown; input?: unknown }[]) {
      if (block?.type !== 'tool_use' || !EDIT_TOOLS.has(String(block.name))) continue
      const input = block.input as { file_path?: unknown; notebook_path?: unknown } | undefined
      const file = input?.file_path ?? input?.notebook_path
      if (typeof file === 'string') edited.push(file)
    }
  }
  return { at, cwd: raw.cwd, sessionId: raw.sessionId, edited }
}

export type ClaudeSpan = {
  /** `<oturum-id>:<başlangıç ms>`: dosya büyüdükçe son aralık uzar ama kimliği değişmez. */
  externalId: string
  sessionId: string
  start: number
  end: number
  /** Klasöre göre göreli, tekrarsız, sıralı. */
  files: string[]
}

/**
 * Proje klasörü içindeki olaylardan çalışma aralıkları: aynı oturumda aralarında `gapMin`'den uzun boşluk
 * olmayan olaylar tek aralık. `minMin`'den kısa aralıklar atılır.
 */
export function buildSpans(
  events: readonly ClaudeEvent[],
  folder: string,
  gapMin = SESSION_GAP_MIN,
  minMin = SESSION_MIN_MIN,
): ClaudeSpan[] {
  const bySession = new Map<string, ClaudeEvent[]>()
  for (const e of events) {
    if (!isInside(e.cwd, folder)) continue
    const list = bySession.get(e.sessionId) ?? []
    list.push(e)
    bySession.set(e.sessionId, list)
  }
  const spans: ClaudeSpan[] = []
  for (const [sessionId, list] of bySession) {
    list.sort((a, b) => a.at - b.at)
    let current: { start: number; end: number; files: Set<string> } | null = null
    const flush = () => {
      if (current && current.end - current.start >= minMin * 60_000)
        spans.push({
          externalId: `${sessionId}:${current.start}`,
          sessionId,
          start: current.start,
          end: current.end,
          files: [...current.files].sort(),
        })
    }
    for (const e of list) {
      if (!current || e.at - current.end > gapMin * 60_000) {
        flush()
        current = { start: e.at, end: e.at, files: new Set() }
      }
      current.end = e.at
      for (const f of e.edited) {
        const rel = relativeTo(f, folder)
        if (rel) current.files.add(rel)
      }
    }
    flush()
  }
  return spans.sort((a, b) => a.start - b.start)
}

/** İki zaman aralığı kesişiyor mu (açık oturumun bitişi `now`). */
export function overlaps(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}
