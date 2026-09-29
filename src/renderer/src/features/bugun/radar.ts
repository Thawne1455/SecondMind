import type { IdeaToday, ProjectSummary } from '@shared/ipc'
import { SILENT_AFTER_DAYS } from '../projeler/labels'

// Bugün'deki Radar karosu tek öğe gösterir: 30 gündür açılmamış fikir ya da 14 gündür dokunulmamış aktif proje.
// İkisi de varsa en uzun süredir sessiz olan; eşitlikte proje (üzerinde çalışılan iş, fikirden önce gelir).

export type RadarPick =
  | { kind: 'idea'; idea: NonNullable<IdeaToday['radar']>; days: number }
  | { kind: 'project'; project: ProjectSummary; days: number }

export function pickRadar(
  idea: IdeaToday['radar'] | undefined,
  projects: readonly ProjectSummary[],
): RadarPick | null {
  const silent = projects
    .filter((p) => p.status === 'active' && !p.activeSession && p.silentDays >= SILENT_AFTER_DAYS)
    .sort((a, b) => b.silentDays - a.silentDays)[0]
  if (silent && (!idea || silent.silentDays >= idea.days))
    return { kind: 'project', project: silent, days: silent.silentDays }
  return idea ? { kind: 'idea', idea, days: idea.days } : null
}
