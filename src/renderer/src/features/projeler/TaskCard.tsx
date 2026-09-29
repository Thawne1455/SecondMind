import type { DragEvent, KeyboardEvent } from 'react'
import type { Task } from '@shared/ipc'
import { formatMinutes } from '../../lib/format'
import { cn } from '../../ui'
import {
  KIND_ICON,
  KIND_LABEL,
  POSTPONE_BADGE_AT,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  TASK_DRAG_TYPE,
} from './board'

// Kanban kartı: başlık, tür ikonu, taş etiketi, süre, hata önemi, kaynak, playtest kişi sayısı ve erteleme rozeti.
// Sürüklenir (yerel HTML5); odaktayken ← / → kolon değiştirir, ↑ / ↓ kolonda gezer, Enter paneli açar.

const SMALL_PILL = 'inline-flex h-6 items-center rounded-full px-2.5 text-[13px] font-bold'

type TaskCardProps = {
  task: Task
  milestone: string | null
  /** Göreve bağlı playtest kümesini bildiren farklı kişi. */
  playtestPeople?: number
  selected: boolean
  dragging: boolean
  onOpen: () => void
  onMove: (dir: -1 | 1) => void
  onDragStart: () => void
  onDragEnd: () => void
}

export function TaskCard({
  task: t,
  milestone,
  playtestPeople = 0,
  selected,
  dragging,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const Icon = KIND_ICON[t.kind]
  const done = t.status === 'done'
  const critical = t.kind === 'bug' && t.severity === 'critical'
  const source = SOURCE_LABEL[t.source]
  const postponed = !done && t.postponeCount >= POSTPONE_BADGE_AT

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key === 'Enter' || e.key === ' ') onOpen()
    else if (e.key === 'ArrowLeft') onMove(-1)
    else if (e.key === 'ArrowRight') onMove(1)
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // Aynı kolondaki komşu karta geç.
      const cards = [
        ...(e.currentTarget
          .closest('[data-column]')
          ?.querySelectorAll<HTMLElement>('[data-task-card]') ?? []),
      ]
      cards[cards.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus()
    } else return
    e.preventDefault()
  }

  function dragStart(e: DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData(TASK_DRAG_TYPE, t.id)
    e.dataTransfer.effectAllowed = 'move'
    onDragStart()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      data-task-card={t.id}
      aria-label={`${KIND_LABEL[t.kind]}: ${t.title}`}
      aria-pressed={selected}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      onDragStart={dragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'flex cursor-grab flex-col gap-2 rounded-[18px] bg-bg px-3.5 py-3 select-none active:cursor-grabbing',
        'transition-[transform,opacity] duration-150 hover:-translate-y-0.5',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
        selected && 'outline-2 outline-ink',
        dragging && 'opacity-40',
      )}
    >
      <span className="flex items-start gap-2">
        <Icon
          size={17}
          strokeWidth={1.75}
          aria-hidden
          className={cn('mt-0.5 shrink-0', critical ? 'text-t-coral' : 'text-ink2')}
        />
        <span
          className={cn(
            'line-clamp-3 min-w-0 leading-[1.3] font-bold break-words',
            done && 'text-ink3 line-through',
          )}
        >
          {t.title}
        </span>
      </span>

      <span className="flex flex-wrap items-center gap-1.5 empty:hidden">
        {t.kind === 'bug' && t.severity && (
          <span
            className={cn(
              SMALL_PILL,
              critical ? 'bg-coral text-white' : t.severity === 'major' ? 'bg-s3' : 'bg-s2',
            )}
          >
            {SEVERITY_LABEL[t.severity]}
          </span>
        )}
        {postponed && (
          <span className={cn(SMALL_PILL, 'bg-coral text-white')} title="Böl · Sil · Bugün yap">
            {t.postponeCount}× ertelendi
          </span>
        )}
        {playtestPeople > 0 && !done && (
          <span className={cn(SMALL_PILL, 'bg-s3')} title="Playtest'te bildiren kişi">
            {playtestPeople} kişi
          </span>
        )}
        {milestone && (
          <span className={cn(SMALL_PILL, 'max-w-full bg-s2')}>
            <span className="truncate">{milestone}</span>
          </span>
        )}
        {(t.estimateMin || source || t.priority === 3) && (
          <span className="text-[13px] font-semibold text-ink3">
            {[
              t.priority === 3 && 'yüksek öncelik',
              t.estimateMin && formatMinutes(t.estimateMin),
              source,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </span>
    </div>
  )
}
