import { differenceInCalendarDays } from 'date-fns'

// Geri dönüş brifingi (PROJELER.md > Geri dönüş brifingi): projeye son dokunuştan (açma, oturum, commit)
// bu yana 3 günden fazla geçtiyse Kokpit'in üstünde bant. Tamamen algoritmik; metinleri renderer yazar.

export const BRIEFING_AFTER_DAYS = 3
/** Commit'lenmemiş değişiklik bundan eskiyse uyarı (mercan). */
export const STALE_UNCOMMITTED_DAYS = 3

const DAY = 86_400_000

export type BriefingInput = {
  now: number
  /** Bu açılıştan önceki son açılış. */
  lastOpenedAt: number | null
  lastSession: { startedAt: number; endedAt: number; leftOff: string } | null
  /** Son açılıştan (yoksa son 14 günden) beri gelen commit'ler, yeni önce. */
  commits: {
    message: string
    committedAt: number
    files: string[]
    areas: Record<string, number>
  }[]
  /** Son iki kapanmış oturumun değişen dosyaları. */
  sessionFiles: string[][]
  uncommitted: { count: number; oldestAt: number | null } | null
  nextStep: string
  /** Son açılıştan beri park edilen öğe sayısı. */
  parkedSince: number
}

export type Briefing = {
  daysAway: number
  lastSession: { endedAt: number; minutes: number; leftOff: string } | null
  /** En fazla 5, yeni önce. */
  commits: { message: string; committedAt: number }[]
  commitCount: number
  /** Commit'lerdeki alan → dosya sayısı, kalabalık önce. */
  commitAreas: [string, number][]
  /** En çok değişen 5 dosya (oturumlar + commit'ler). */
  files: string[]
  uncommitted: { count: number; oldestAt: number | null; stale: boolean } | null
  nextStep: string | null
  parkedSince: number
}

/** Son dokunuş: açılış, oturum bitişi, en yeni commit. Hiçbiri yoksa null (yeni proje: brifing yok). */
export function lastTouch(input: BriefingInput): number | null {
  const times = [input.lastOpenedAt, input.lastSession?.endedAt, input.commits[0]?.committedAt]
  const known = times.filter((t): t is number => typeof t === 'number')
  return known.length ? Math.max(...known) : null
}

/** Dosyaları değişme sıklığına göre sıralar; eşitlikte önce görülen önce. */
export function topFiles(lists: readonly (readonly string[])[], limit = 5): string[] {
  const counts = new Map<string, number>()
  for (const list of lists) for (const f of new Set(list)) counts.set(f, (counts.get(f) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([f]) => f)
}

export function buildBriefing(input: BriefingInput): Briefing | null {
  const touched = lastTouch(input)
  if (touched === null) return null
  const away = input.now - touched
  if (away <= BRIEFING_AFTER_DAYS * DAY) return null

  const areas = new Map<string, number>()
  for (const c of input.commits)
    for (const [a, n] of Object.entries(c.areas)) areas.set(a, (areas.get(a) ?? 0) + n)

  const s = input.lastSession
  const u = input.uncommitted
  const briefing: Briefing = {
    // Şeritteki "N GÜN SESSİZ" ile aynı sayı: takvim günü.
    daysAway: differenceInCalendarDays(input.now, touched),
    lastSession: s
      ? {
          endedAt: s.endedAt,
          minutes: Math.max(0, Math.round((s.endedAt - s.startedAt) / 60_000)),
          leftOff: s.leftOff,
        }
      : null,
    commits: input.commits
      .slice(0, 5)
      .map((c) => ({ message: c.message, committedAt: c.committedAt })),
    commitCount: input.commits.length,
    commitAreas: [...areas.entries()].sort((a, b) => b[1] - a[1]),
    files: topFiles([...input.sessionFiles, ...input.commits.map((c) => c.files)]),
    uncommitted:
      u && u.count > 0
        ? {
            count: u.count,
            oldestAt: u.oldestAt,
            stale: u.oldestAt !== null && input.now - u.oldestAt > STALE_UNCOMMITTED_DAYS * DAY,
          }
        : null,
    nextStep: input.nextStep.trim() || null,
    parkedSince: input.parkedSince,
  }
  const empty =
    !briefing.lastSession &&
    !briefing.commits.length &&
    !briefing.uncommitted &&
    !briefing.nextStep &&
    !briefing.parkedSince
  return empty ? null : briefing
}
