import { addDays, differenceInCalendarDays, startOfDay, startOfWeek } from 'date-fns'
import { PROJECT_COLORS, type ProjectKind } from '@shared/ipc'

export { PROJECT_COLORS }

// Projelerin saf kuralları (Aşama 5a): renk seçimi, tür tahmini, oturum süreleri, ritim, sessizlik.

/** Kullanılmayan ilk palet rengi; hepsi kullanılıyorsa en az kullanılan (eşitlikte palet sırası). */
export function pickProjectColor(used: readonly string[]): string {
  const counts = new Map<string, number>(PROJECT_COLORS.map((c) => [c, 0]))
  for (const c of used) {
    const key = c.toUpperCase()
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1)
  }
  let best: string = PROJECT_COLORS[0]
  for (const c of PROJECT_COLORS) if (counts.get(c)! < counts.get(best)!) best = c
  return best
}

export type FolderSignals = {
  /** `ProjectSettings/ProjectVersion.txt` var. */
  unity: boolean
  /** `.git` var. */
  git: boolean
  /** Kök klasörde kod projesi işareti (package.json, *.sln, Cargo.toml, pyproject.toml, go.mod...). */
  code: boolean
}

/** Klasörden tür: Unity > yazılım (git ya da kod işareti) > yaratıcı. */
export function guessProjectKind(s: FolderSignals): ProjectKind {
  if (s.unity) return 'unity'
  if (s.git || s.code) return 'software'
  return 'creative'
}

/** `m_EditorVersion: 6000.3.18f1` satırından sürüm. */
export function parseUnityVersion(text: string): string | null {
  return /^m_EditorVersion:\s*(\S+)/m.exec(text)?.[1] ?? null
}

/** Klasör adından proje adı: son parça, `_`/`-` boşluk olur, ilk harf büyür. */
export function projectNameFromPath(path: string): string {
  const base =
    path
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? ''
  const name = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!name || /^[a-z]:$/i.test(name)) return ''
  return name.charAt(0).toLocaleUpperCase('tr-TR') + name.slice(1)
}

/** Windows yolları büyük/küçük harf duyarsız: karşılaştırma anahtarı. */
export const folderKey = (path: string): string =>
  path
    .replace(/[\\/]+$/, '')
    .replace(/\//g, '\\')
    .toLocaleLowerCase('en-US')

export type SessionSpan = { startedAt: Date; endedAt: Date | null }

/** Oturum süresi (dk, aşağı yuvarlanır); süren oturum `now`'a kadar sayılır. */
export const sessionMinutes = (s: SessionSpan, now: Date): number =>
  Math.max(0, Math.floor(((s.endedAt ?? now).getTime() - s.startedAt.getTime()) / 60_000))

/**
 * Son `days` günün her biri için çalışılan dakika (en eski önce, son eleman bugün).
 * Gece yarısını geçen oturum iki güne bölünür; süren oturum `now`'a kadar sayılır.
 */
export function dailyMinutes(spans: readonly SessionSpan[], now: Date, days: number): number[] {
  const out = new Array<number>(days).fill(0)
  const first = addDays(startOfDay(now), -(days - 1))
  for (const s of spans) {
    const end = s.endedAt ?? now
    let cursor = s.startedAt < first ? first : s.startedAt
    while (cursor < end) {
      const idx = differenceInCalendarDays(cursor, first)
      if (idx >= days) break
      const dayEnd = addDays(startOfDay(cursor), 1)
      const sliceEnd = end < dayEnd ? end : dayEnd
      out[idx]! += (sliceEnd.getTime() - cursor.getTime()) / 60_000
      cursor = sliceEnd
    }
  }
  return out.map(Math.round)
}

export type WeekActivity = { commits: number; minutes: number }

/**
 * Şeritteki aktivite çubukları: son `weeks` haftanın (Pazartesi başlangıçlı, son eleman bu hafta) commit sayısı
 * ve oturum dakikası. Hafta sınırını geçen oturum bölünür.
 */
export function weeklyActivity(
  commitTimes: readonly Date[],
  spans: readonly SessionSpan[],
  now: Date,
  weeks: number,
): WeekActivity[] {
  const out = Array.from({ length: weeks }, () => ({ commits: 0, minutes: 0 }))
  const first = addDays(startOfWeek(now, { weekStartsOn: 1 }), -7 * (weeks - 1))
  const index = (d: Date) => Math.floor(differenceInCalendarDays(d, first) / 7)
  for (const t of commitTimes) {
    const i = index(t)
    if (i >= 0 && i < weeks) out[i]!.commits++
  }
  // Günlük dakikaları haftalara topla: dailyMinutes gece yarısı bölmesini zaten yapar.
  const days = differenceInCalendarDays(now, first) + 1
  dailyMinutes(spans, now, days).forEach((m, d) => {
    out[Math.floor(d / 7)]!.minutes += m
  })
  return out
}

/** Son etkinlikten bugüne takvim günü (bugün = 0). */
export const silenceDays = (lastActivity: Date, now: Date): number =>
  Math.max(0, differenceInCalendarDays(now, lastActivity))

/** Şerit bu günden itibaren "N GÜN SESSİZ" rozetini alır; radar da aynı eşiği kullanır. */
export const SILENT_AFTER_DAYS = 14

/** Kapanışta süre sorulur: oturum bu kadar dakikadan uzun açık kaldıysa (uygulama açık unutulmuş olabilir). */
export const LONG_SESSION_MIN = 4 * 60

export type ProjectOrderFields = {
  status: 'active' | 'paused' | 'archived'
  sessionOpen: boolean
  lastActivityAt: number
  name: string
}

/** Liste sırası: aktif > duraklatılmış > arşiv; içinde oturumu süren önce, sonra son etkinlik (yeni önce). */
export function compareProjects(a: ProjectOrderFields, b: ProjectOrderFields): number {
  const rank = { active: 0, paused: 1, archived: 2 } as const
  return (
    rank[a.status] - rank[b.status] ||
    Number(b.sessionOpen) - Number(a.sessionOpen) ||
    b.lastActivityAt - a.lastActivityAt ||
    a.name.localeCompare(b.name, 'tr')
  )
}
