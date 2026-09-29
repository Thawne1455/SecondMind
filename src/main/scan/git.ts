import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { GIT_LOG_FORMAT, parseGitLog, parsePorcelainZ, type ParsedCommit } from '../domain/scan'

// Git okuma (Aşama 5b). Sadece okur: log ve status. Türkçe dosya adları için core.quotepath kapalı.

const QUOTE_OFF = ['-c', 'core.quotepath=off']

/** Artımlı taramada son bilinen commit'ten bu kadar geriye bakılır (rebase / geç push edilenler için). */
const OVERLAP_DAYS = 14

/**
 * HEAD'den ulaşılan commit'ler. İlk taramada tüm geçmiş; sonra son bilinenin OVERLAP_DAYS öncesinden beri,
 * bilinen hash'ler çıkarılarak.
 */
export async function readCommits(
  path: string,
  known: { hashes: Set<string>; latest: Date | null },
): Promise<ParsedCommit[]> {
  const git = simpleGit(path)
  // Hiç commit'i olmayan depo: log hata verir.
  const head = await git
    .raw([...QUOTE_OFF, 'rev-parse', '--verify', '--quiet', 'HEAD'])
    .catch(() => '')
  if (!head.trim()) return []
  const args = [...QUOTE_OFF, 'log', '--numstat', `--format=${GIT_LOG_FORMAT}`]
  if (known.latest) {
    const since = new Date(known.latest.getTime() - OVERLAP_DAYS * 86_400_000)
    args.push(`--since=${since.toISOString()}`)
  }
  const raw = await git.raw(args)
  return parseGitLog(raw).filter((c) => !known.hashes.has(c.hash))
}

/** Commit'lenmemiş dosyalar ve her birinin mtime'ı (silinmişlerde null). */
export async function readUncommitted(
  path: string,
): Promise<{ path: string; mtime: number | null }[]> {
  const raw = await simpleGit(path).raw([...QUOTE_OFF, 'status', '--porcelain=v1', '-z'])
  const entries = parsePorcelainZ(raw)
  return Promise.all(
    entries.map(async (e) => {
      const s = await stat(join(path, e.path)).catch(() => null)
      return { path: e.path, mtime: s ? Math.round(s.mtimeMs) : null }
    }),
  )
}
