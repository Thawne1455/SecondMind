import type { ReactNode } from 'react'
import { ArrowRight, Check, Play, Plus } from 'lucide-react'
import type { ScheduleBlock, ScheduleDay, Task } from '@shared/ipc'
import { useShell } from '../../app/shell-context'
import { errorText } from '../../lib/errors'
import { formatAtClock, formatDuration } from '../../lib/flow'
import { Button, useToast } from '../../ui'
import { useMoveBlock, useStartTask, useToggleDone } from './usePlanning'

// Şimdi (EKRANLAR.md Bugün): şu anki blok → yoksa sıradaki blok ("13:00'TE") → yoksa en öndeki açık görev.
// Projeler Aşama 5'te: şimdilik genel görevler, renk noktası nötr. Oturum tablosu da Aşama 5'te;
// o zamana kadar "Başla" bloğu şimdiye çekip sabitler, "Oturumu kapat" yerine "Tamamla" var.

type Focus =
  | { kind: 'current'; block: ScheduleBlock }
  | { kind: 'next'; block: ScheduleBlock }
  | { kind: 'task'; task: Task }
  | { kind: 'empty' }

function pickFocus(day: ScheduleDay | undefined, nowMin: number, open: Task[]): Focus {
  const blocks = (day?.blocks ?? []).filter((b) => !b.done)
  const current = blocks.filter((b) => b.start <= nowMin && nowMin < b.end)
  const cur = current.find((b) => b.kind === 'task') ?? current[0]
  if (cur) return { kind: 'current', block: cur }
  const next = blocks.find((b) => b.start > nowMin)
  if (next) return { kind: 'next', block: next }
  const task = open[0]
  return task ? { kind: 'task', task } : { kind: 'empty' }
}

type Props = {
  day: ScheduleDay | undefined
  nowMin: number
  openTasks: Task[]
  /** Sağdaki sütun (Sıradaki adımlar). */
  aside: ReactNode
}

export function NowSection({ day, nowMin, openTasks, aside }: Props) {
  const { openTask } = useShell()
  const toggleDone = useToggleDone()
  const start = useStartTask()
  const move = useMoveBlock()
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })

  const focus = pickFocus(day, nowMin, openTasks)
  const taskId =
    focus.kind === 'task'
      ? focus.task.id
      : (focus.kind === 'current' || focus.kind === 'next') && focus.block.kind === 'task'
        ? focus.block.sourceId
        : null
  const task = taskId ? openTasks.find((t) => t.id === taskId) : undefined

  let label: string
  let title: string
  if (focus.kind === 'current') {
    const rest = formatDuration(focus.block.end - nowMin)
    label = `Şimdi${focus.block.kind === 'routine' ? ' · Rutin' : ''} · ${rest} kaldı`
    title = focus.block.title
  } else if (focus.kind === 'next') {
    const dur = formatDuration(focus.block.end - focus.block.start)
    label = `${formatAtClock(focus.block.start)}${focus.block.kind === 'routine' ? ' · Rutin' : ''} · ${dur}`
    title = focus.block.title
  } else if (focus.kind === 'task') {
    label = 'Sıradaki adım'
    title = focus.task.title
  } else {
    label = 'Şimdi'
    title = 'Bugün boş'
  }

  // "Sonraya at": süren bloğu, sığdığı ilk boşluğa taşır (o gün sabit).
  function later(block: ScheduleBlock) {
    const dur = block.end - block.start
    const gap = day?.freeGaps.find((g) => g.start >= block.end && g.end - g.start >= dur)
    if (!gap) return toast({ message: 'Bugün sığacak boşluk yok.', domain: 'warning' })
    move.mutate({ id: block.id, start: gap.start }, { onError })
  }

  const complete = task && (
    <Button
      key="done"
      size="lg"
      variant={focus.kind === 'current' ? 'action' : 'secondary'}
      icon={Check}
      className={focus.kind === 'current' ? undefined : 'h-12'}
      onClick={() => toggleDone(task)}
    >
      Tamamla
    </Button>
  )

  let actions: ReactNode = null
  if (focus.kind === 'current' && task) {
    actions = (
      <>
        {complete}
        <Button
          variant="secondary"
          icon={ArrowRight}
          className="h-12"
          loading={move.isPending}
          onClick={() => later(focus.block)}
        >
          Sonraya at
        </Button>
      </>
    )
  } else if (task) {
    actions = (
      <>
        <Button
          size="lg"
          variant="action"
          icon={Play}
          loading={start.isPending}
          onClick={() => start.mutate(task.id, { onError })}
        >
          Başla
        </Button>
        {complete}
      </>
    )
  } else if (focus.kind === 'empty') {
    actions = (
      <Button size="lg" variant="action" icon={Plus} onClick={() => openTask()}>
        Görev ekle
      </Button>
    )
  }

  return (
    <section className="flex items-end gap-10 px-1">
      <div className="flex min-w-0 grow flex-col gap-2.5">
        <span className="cx flex items-center gap-2.5 text-ink2">
          <span className="size-3 rounded-full bg-ink3" />
          {label}
        </span>
        {task ? (
          <button
            type="button"
            title="Görevi düzenle"
            onClick={() => openTask(task)}
            className="x m-0 line-clamp-2 max-w-[860px] cursor-pointer text-left text-[64px] leading-[.95] font-black uppercase hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo"
          >
            {title}
          </button>
        ) : (
          <h2 className="x m-0 line-clamp-2 max-w-[860px] text-[64px] leading-[.95] font-black uppercase">
            {title}
          </h2>
        )}
        {focus.kind === 'empty' && (
          <span className="text-[15px] text-ink2">
            Açık görev yok. Ctrl G ile ekle ya da sağdaki satıra yaz.
          </span>
        )}
        {actions && <div className="flex gap-2.5 pt-1.5">{actions}</div>}
      </div>

      {aside}
    </section>
  )
}
