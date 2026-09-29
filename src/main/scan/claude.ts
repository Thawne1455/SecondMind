import { createReadStream, existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import {
  buildSpans,
  candidateDirs,
  parseEventLine,
  type ClaudeEvent,
  type ClaudeSpan,
} from '../domain/claudeSessions'

// Claude Code oturum kayıtlarını okur (Aşama 5b). Sadece okur; her satırdan üst veri alınır, metin saklanmaz.

export const defaultClaudeRoot = (): string => join(homedir(), '.claude', 'projects')

async function readEvents(file: string): Promise<ClaudeEvent[]> {
  const events: ClaudeEvent[] = []
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of lines) {
    const e = parseEventLine(line)
    if (e) events.push(e)
  }
  return events
}

/**
 * Proje klasöründe geçen Claude Code çalışma aralıkları. `since` verilirse o andan beri değişmemiş kayıt dosyaları
 * atlanır (aralıkları zaten kayıtlı). Kayıt klasörü yoksa (Claude Code kurulu değil) null.
 */
export async function readClaudeSpans(
  folder: string,
  since: Date | null,
  root = defaultClaudeRoot(),
): Promise<ClaudeSpan[] | null> {
  if (!existsSync(root)) return null
  const dirs = candidateDirs(
    (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name),
    folder,
  )
  const events: ClaudeEvent[] = []
  for (const dir of dirs) {
    // Alt klasörler yan ajan kayıtları: ana oturumun zaman aralığında kalır, okunmaz.
    const files = (await readdir(join(root, dir), { withFileTypes: true }))
      .filter((f) => f.isFile() && f.name.endsWith('.jsonl'))
      .map((f) => join(root, dir, f.name))
    for (const file of files) {
      if (since) {
        const s = await stat(file).catch(() => null)
        if (!s || s.mtimeMs < since.getTime()) continue
      }
      events.push(...(await readEvents(file)))
    }
  }
  return buildSpans(events, folder)
}
