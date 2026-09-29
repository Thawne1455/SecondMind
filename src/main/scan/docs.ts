import { join } from 'node:path'
import fg from 'fast-glob'
import type { DocFileSuggestion } from '@shared/ipc'
import { looksLikeGdd } from '../domain/docTemplates'
import { IGNORE_GLOBS } from '../domain/scan'

// Bağlanabilir markdown dosyaları (5d-1): proje klasörlerindeki `.md` dosyaları. Sadece okur.

const SUGGEST_MAX = 100

/** Klasörlerdeki markdown dosyaları; bağlı olanlar (`linked`, küçük harf mutlak yol) hariç. GDD'ye benzeyen önce. */
export async function suggestDocFiles(
  folders: readonly string[],
  linked: ReadonlySet<string>,
): Promise<DocFileSuggestion[]> {
  const out: DocFileSuggestion[] = []
  for (const root of folders) {
    const files = await fg(['**/*.{md,markdown}'], {
      cwd: root,
      ignore: IGNORE_GLOBS,
      dot: false,
      onlyFiles: true,
      suppressErrors: true,
      followSymbolicLinks: false,
      caseSensitiveMatch: false,
    })
    for (const rel of files) {
      const path = join(root, rel)
      if (linked.has(path.toLocaleLowerCase('en'))) continue
      out.push({ path, relative: rel, gdd: looksLikeGdd(rel) })
    }
  }
  return out
    .sort(
      (a, b) =>
        Number(b.gdd) - Number(a.gdd) ||
        a.relative.split('/').length - b.relative.split('/').length ||
        a.relative.localeCompare(b.relative, 'tr'),
    )
    .slice(0, SUGGEST_MAX)
}
