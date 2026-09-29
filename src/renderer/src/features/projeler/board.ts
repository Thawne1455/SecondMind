import { Bug, FlaskConical, ListTodo, type LucideIcon } from 'lucide-react'
import type { KanbanStatus, Task, TaskKind, TaskSeverity } from '@shared/ipc'

// Görevler sekmesinin (kanban) metinleri ve saf yardımcıları: kolon, filtre, kaynak.

export const COLUMNS: { id: KanbanStatus; label: string }[] = [
  { id: 'todo', label: 'Yapılacak' },
  { id: 'doing', label: 'Yapılıyor' },
  { id: 'testing', label: 'Test' },
  { id: 'done', label: 'Bitti' },
]

export const KIND_LABEL: Record<TaskKind, string> = {
  task: 'Görev',
  bug: 'Hata',
  research: 'Araştırma',
}

export const KIND_ICON: Record<TaskKind, LucideIcon> = {
  task: ListTodo,
  bug: Bug,
  research: FlaskConical,
}

/** Sürüklenen kartın id'si bu türle taşınır (dışarıdan gelen metin bırakılmasın diye). */
export const TASK_DRAG_TYPE = 'application/x-secondmind-task'

export const SEVERITY_LABEL: Record<TaskSeverity, string> = {
  critical: 'Kritik',
  major: 'Önemli',
  minor: 'Küçük',
}

/** Kaynak ipucu; Taha'nın kendi yazdığı görevde gösterilmez. */
export const SOURCE_LABEL: Record<Task['source'], string | null> = {
  taha: null,
  park: 'park',
  playtest: 'playtest',
  todo: 'TODO',
  claude_code: 'Claude Code',
}

/** Bitti kolonunda "N daha" öncesi görünen kart sayısı. */
export const DONE_VISIBLE = 10

/** Erteleme sayacı bu değerde mercan rozet olur (Bugün'deki erteleme sorusuyla aynı eşik). */
export const POSTPONE_BADGE_AT = 3

/** Kolon: kanban durumu; eski (5c öncesi) proje görevinde durumdan türetilir. */
export const columnOf = (t: Task): KanbanStatus =>
  t.kanbanStatus ?? (t.status === 'done' ? 'done' : 'todo')

/** ← / →: komşu kolon; kenarda null. */
export function neighborColumn(from: KanbanStatus, dir: -1 | 1): KanbanStatus | null {
  const i = COLUMNS.findIndex((c) => c.id === from)
  return COLUMNS[i + dir]?.id ?? null
}

export type BoardFilter = {
  /** null = hepsi; 'none' = taşa bağlı olmayanlar. */
  milestoneId: string | null
  kind: TaskKind | null
}

/** Filtreye uyan görevler kolonlarına ayrılır; kolon içi sıra sunucunun sırasıdır. */
export function groupTasks(tasks: readonly Task[], f: BoardFilter): Record<KanbanStatus, Task[]> {
  const out: Record<KanbanStatus, Task[]> = { todo: [], doing: [], testing: [], done: [] }
  for (const t of tasks) {
    if (f.kind && t.kind !== f.kind) continue
    if (
      f.milestoneId === 'none'
        ? t.milestoneId !== null
        : f.milestoneId && t.milestoneId !== f.milestoneId
    )
      continue
    out[columnOf(t)].push(t)
  }
  return out
}
