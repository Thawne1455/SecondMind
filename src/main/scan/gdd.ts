import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import fg from 'fast-glob'
import type { GddComparison } from '@shared/ipc'
import {
  compareCounts,
  compareText,
  extractGddCounts,
  suggestRule,
  type BuiltinKind,
  type CountRule,
  type DirInfo,
} from '../domain/gddCompare'
import { IGNORE_GLOBS } from '../domain/scan'

// GDD ile gerçeklik (5d-2): klasörden sayımlar. Sadece okur; karşılaştırma açıldığında çalışır (Kokpit /
// Dokümanlar), arka planda değil.

const OPTIONS = {
  ignore: IGNORE_GLOBS,
  dot: false,
  suppressErrors: true,
  followSymbolicLinks: false,
  caseSensitiveMatch: false,
}
const DIRS_MAX = 3000

async function countGlob(folders: readonly string[], pattern: string): Promise<number> {
  let n = 0
  for (const cwd of folders) n += (await fg([pattern], { cwd, onlyFiles: true, ...OPTIONS })).length
  return n
}

async function builtinCounts(
  folders: readonly string[],
  unity: boolean,
): Promise<Record<BuiltinKind, number | null>> {
  if (!folders.length) return { scenes: null, audio: null, scripts: null }
  return {
    scenes: unity ? await countGlob(folders, 'Assets/**/*.unity') : null,
    audio: await countGlob(
      folders,
      unity ? 'Assets/**/*.{wav,mp3,ogg}' : '**/*.{wav,mp3,ogg,flac}',
    ),
    scripts: unity ? await countGlob(folders, 'Assets/**/*.cs') : null,
  }
}

/** Kural önerisi için klasörler ve doğrudan dosyaları (Unity'de Assets altı). */
async function listDirs(folders: readonly string[], unity: boolean): Promise<DirInfo[]> {
  const out: DirInfo[] = []
  for (const cwd of folders) {
    const dirs = await fg([unity ? 'Assets/**' : '**'], {
      cwd,
      onlyDirectories: true,
      deep: 6,
      ...OPTIONS,
    })
    for (const d of dirs.slice(0, DIRS_MAX)) {
      const entries = await readdir(join(cwd, d), { withFileTypes: true }).catch(() => [])
      out.push({
        path: d,
        files: entries.filter((e) => e.isFile() && !e.name.endsWith('.meta')).map((e) => e.name),
      })
    }
  }
  return out
}

/** GDD markdown'ı klasörle karşılaştırır; bilinmeyen satırlara kural önerisi (sayısıyla). */
export async function compareGdd(input: {
  docId: string
  markdown: string
  folders: readonly string[]
  unity: boolean
  rules: readonly CountRule[]
}): Promise<GddComparison> {
  const counts = extractGddCounts(input.markdown)
  const ruleCounts = new Map<string, number>()
  for (const r of input.rules)
    if (!ruleCounts.has(r.glob)) ruleCounts.set(r.glob, await countGlob(input.folders, r.glob))
  const rows = compareCounts(
    counts,
    input.rules,
    ruleCounts,
    await builtinCounts(input.folders, input.unity),
  )
  const unknown = rows.filter((r) => r.state === 'unknown')
  const suggestions: GddComparison['suggestions'] = []
  if (unknown.length && input.folders.length) {
    const dirs = await listDirs(input.folders, input.unity)
    for (const r of unknown) {
      const rule = suggestRule(r.label, dirs)
      if (rule) suggestions.push({ ...rule, count: await countGlob(input.folders, rule.glob) })
    }
  }
  return {
    docId: input.docId,
    hasFolder: input.folders.length > 0,
    rows: rows.map((r) => ({ ...r, text: compareText(r) })),
    suggestions,
  }
}
