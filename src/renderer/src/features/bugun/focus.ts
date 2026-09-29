import type { ProjectSummary, ScheduleBlock, ScheduleDay, Task } from '@shared/ipc'

// Şimdi'nin odağı (EKRANLAR.md Bugün, PROJELER.md "Sıradaki adım motoru"):
// şu anki blok → yoksa sıradaki blok → yoksa en öndeki açık görev. Son durumda proje görevleri arasında
// motor karar verir: bir proje oturumu sürüyorsa o projenin 1. adımı; değilse en öndeki görev bir proje
// görevi ise yerine o projenin 1. adımının görevi (açık görevler arasındaysa).

export type Focus =
  | { kind: 'current'; block: ScheduleBlock }
  | { kind: 'next'; block: ScheduleBlock }
  | { kind: 'task'; task: Task }
  | { kind: 'empty' }

type ProjectInfo = Pick<ProjectSummary, 'topStep'>

export function pickFocus(
  day: ScheduleDay | undefined,
  nowMin: number,
  open: Task[],
  projects: ReadonlyMap<string, ProjectInfo>,
  runningProjectId: string | null,
): Focus {
  const blocks = (day?.blocks ?? []).filter((b) => !b.done)
  const current = blocks.filter((b) => b.start <= nowMin && nowMin < b.end)
  const cur = current.find((b) => b.kind === 'task') ?? current[0]
  if (cur) return { kind: 'current', block: cur }
  const next = blocks.find((b) => b.start > nowMin)
  if (next) return { kind: 'next', block: next }

  const topTask = (projectId: string | null | undefined) => {
    const id = projectId ? projects.get(projectId)?.topStep?.taskId : null
    return id ? open.find((t) => t.id === id) : undefined
  }
  const task = topTask(runningProjectId) ?? topTask(open[0]?.projectId) ?? open[0]
  return task ? { kind: 'task', task } : { kind: 'empty' }
}
