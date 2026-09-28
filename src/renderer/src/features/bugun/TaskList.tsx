import { useState } from 'react'
import { format } from 'date-fns'
import { Check } from 'lucide-react'
import type { Task } from '@shared/ipc'
import { formatDayName, formatMinutes } from '../../lib/format'
import { Button, Chip, cn, EmptyState, ModalPanel, Skeleton, useToast } from '../../ui'
import { useSetTaskDone, useTasks, useUpdateTask } from './usePlanning'

// Görev satırı (Bugün'deki Sıradaki adımlar ve Görevler listesi) ve görev çalışma alanının sol karosu.

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')
const fromKey = (k: string) => new Date(`${k}T00:00`)

/** Bugün yapılacak mı: planlanan günü bugün ya da geçmiş (main/domain/tasks.isForToday ile aynı). */
const isForToday = (t: Task, today: string) => t.plannedDate !== null && t.plannedDate <= today

function meta(t: Task, now: Date): { text: string; warn?: boolean }[] {
  const today = dayKey(now)
  const parts: { text: string; warn?: boolean }[] = []
  if (t.status === 'done' && t.completedAt)
    parts.push({ text: `${formatDayName(new Date(t.completedAt), now)} bitti` })
  else if (t.plannedDate && t.plannedDate > today)
    parts.push({ text: formatDayName(fromKey(t.plannedDate), now) })
  if (t.estimateMin) parts.push({ text: formatMinutes(t.estimateMin) })
  if (t.dueDate && t.status === 'open')
    parts.push({
      text:
        t.dueDate < today
          ? `son tarih geçti (${formatDayName(fromKey(t.dueDate), now)})`
          : `son ${formatDayName(fromKey(t.dueDate), now)}`,
      warn: t.dueDate <= today,
    })
  if (t.priority === 3) parts.push({ text: 'yüksek öncelik', warn: true })
  if (t.postponeCount > 0) parts.push({ text: `${t.postponeCount} kez ertelendi` })
  return parts
}

/** Tamamla / geri aç; tamamlanınca "Geri al" toast'u. */
function useToggleDone() {
  const setDone = useSetTaskDone()
  const { toast } = useToast()
  return (task: Task) => {
    const done = task.status !== 'done'
    setDone.mutate(
      { id: task.id, done },
      {
        onSuccess: () => {
          if (!done) return
          toast({
            variant: 'fill',
            domain: 'projects',
            message: `Bitti: ${task.title}`,
            action: {
              label: 'Geri al',
              onClick: () => setDone.mutate({ id: task.id, done: false }),
            },
          })
        },
      },
    )
  }
}

type TaskRowProps = {
  task: Task
  onEdit: (task: Task) => void
  className?: string
}

export function TaskRow({ task, onEdit, className }: TaskRowProps) {
  const now = new Date()
  const today = dayKey(now)
  const toggle = useToggleDone()
  const update = useUpdateTask()
  const done = task.status === 'done'
  const parts = meta(task, now)

  return (
    <div
      className={cn('flex items-center gap-2.5 rounded-[18px] bg-s2 py-2 pr-2.5 pl-2.5', className)}
    >
      <button
        type="button"
        aria-label={done ? 'Geri aç' : 'Tamamla'}
        onClick={() => toggle(task)}
        className={cn(
          'group flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-ink transition-colors',
          done ? 'bg-ink text-bg' : 'hover:bg-green',
          'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
        )}
      >
        <Check
          size={15}
          strokeWidth={3}
          aria-hidden
          className={done ? '' : 'opacity-0 group-hover:opacity-100'}
        />
      </button>
      <button
        type="button"
        onClick={() => onEdit(task)}
        className="flex min-w-0 grow cursor-pointer flex-col text-left leading-[1.3] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo"
      >
        <span className={cn('truncate font-bold', done && 'text-ink3 line-through')}>
          {task.title}
        </span>
        {parts.length > 0 && (
          <span className="truncate text-[13px] font-semibold text-ink3">
            {parts.map((p, i) => (
              <span key={p.text} className={p.warn ? 'text-t-coral' : undefined}>
                {i > 0 && ' · '}
                {p.text}
              </span>
            ))}
          </span>
        )}
      </button>
      {!done && !isForToday(task, today) && (
        <Button
          size="sm"
          variant="secondary"
          className="[--btn-soft:var(--bg)]"
          loading={update.isPending}
          onClick={() => update.mutate({ id: task.id, plannedDate: today })}
        >
          Bugüne al
        </Button>
      )}
    </div>
  )
}

type TaskListPanelProps = {
  /** Sağdaki formda açık olan görev; satırı işaretlenir. */
  selectedId: string | null
  onEdit: (task: Task) => void
  className?: string
}

/** Görev çalışma alanının sol karosu: açıklar (bugünkü önce, sonra) ve son bitenler. */
export function TaskListPanel({ selectedId, onEdit, className }: TaskListPanelProps) {
  const [tab, setTab] = useState<'open' | 'done'>('open')
  const tasks = useTasks(tab)
  const today = dayKey(new Date())
  const list = tasks.data ?? []
  const todayCount = tab === 'open' ? list.filter((t) => isForToday(t, today)).length : 0

  return (
    <ModalPanel
      title="Görevler"
      domain="today"
      className={className}
      headerClassName="min-h-[68px]"
      footerClassName="min-h-[76px]"
      headerExtra={
        <div className="flex gap-1.5">
          <Chip selected={tab === 'open'} onClick={() => setTab('open')}>
            Açık
          </Chip>
          <Chip selected={tab === 'done'} onClick={() => setTab('done')}>
            Biten
          </Chip>
        </div>
      }
      hints={
        tab === 'open'
          ? `${list.length} açık görev · ${todayCount} tanesi bugün`
          : 'Son biten 100 görev'
      }
      bodyClassName="h-[62vh] gap-1.5 overflow-y-auto"
    >
      {tasks.isPending && <Skeleton lines={4} />}
      {tasks.data && !list.length && (
        <EmptyState
          title={tab === 'open' ? 'Açık görev yok' : 'Henüz biten görev yok'}
          message={tab === 'open' ? 'Sağdaki karodan ekleyebilirsin.' : undefined}
        />
      )}
      {list.map((t, i) => {
        const header =
          tab === 'open' && (i === 0 || isForToday(list[i - 1]!, today) !== isForToday(t, today))
        return (
          <div key={t.id} className="flex flex-col gap-1.5">
            {header && (
              <span className={cn('cx text-ink2', i > 0 && 'pt-3')}>
                {isForToday(t, today) ? 'Bugün' : 'Sonra'}
              </span>
            )}
            <TaskRow
              task={t}
              onEdit={onEdit}
              className={t.id === selectedId ? 'outline-2 outline-ink' : undefined}
            />
          </div>
        )
      })}
    </ModalPanel>
  )
}
