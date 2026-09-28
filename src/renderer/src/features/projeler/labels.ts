import type { ProjectKind, ProjectStatus, ProjectSummary } from '@shared/ipc'

// Projeler panelinin metinleri ve küçük biçimleyicileri.

export const KIND_LABEL: Record<ProjectKind, string> = {
  unity: 'Unity oyunu',
  software: 'Yazılım',
  creative: 'Yaratıcı',
  general: 'Genel',
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Aktif',
  paused: 'Durakladı',
  archived: 'Arşiv',
}

/** Şerit bu günden itibaren "N GÜN SESSİZ" (main `SILENT_AFTER_DAYS` ile aynı). */
export const SILENT_AFTER_DAYS = 14

/** Kapanışta gerçek süre sorulur (main `LONG_SESSION_MIN` ile aynı). */
export const LONG_SESSION_MIN = 4 * 60

/** Süren oturumun sayacı: 42 dk → "0:42", 125 dk → "2:05". */
export function formatTimer(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}

export const minutesBetween = (from: number, to: number): number =>
  Math.max(0, Math.floor((to - from) / 60_000))

/**
 * Park penceresinin varsayılan projesi: süren oturumun projesi, sonra verilen (açık sayfa),
 * sonra en son açılan aktif proje, sonra ilk aktif.
 */
export function defaultParkProject(
  projects: readonly ProjectSummary[],
  preferred?: string | null,
): ProjectSummary | undefined {
  const live = projects.filter((p) => p.status !== 'archived')
  return (
    live.find((p) => p.activeSession) ??
    live.find((p) => p.id === preferred) ??
    [...live]
      .filter((p) => p.lastOpenedAt !== null)
      .sort((a, b) => b.lastOpenedAt! - a.lastOpenedAt!)[0] ??
    live[0]
  )
}

/** "90", "90dk", "1:30", "1,5" (saat) → dakika; anlaşılmazsa null. */
export function parseActual(text: string): number | null {
  const t = text.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, '')
  let m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (m) return Number(m[1]) * 60 + Number(m[2]) || null
  m = /^(\d+)(dk)?$/.exec(t)
  if (m) return Number(m[1]) || null
  m = /^(\d+)[.,](\d+)(sa)?$/.exec(t)
  if (m) return Math.round(Number(`${m[1]}.${m[2]}`) * 60) || null
  m = /^(\d+)sa$/.exec(t)
  if (m) return Number(m[1]) * 60 || null
  return null
}
