import type { ReactNode } from 'react'
import { ArrowRight, Check, Play, Plus, Square } from 'lucide-react'
import type { ScheduleBlock, ScheduleDay, Task } from '@shared/ipc'
import { useShell } from '../../app/shell-context'
import { errorText } from '../../lib/errors'
import { formatAtClock, formatDuration } from '../../lib/flow'
import { useNow } from '../../lib/useNow'
import { Button, useToast } from '../../ui'
import { formatTimer } from '../projeler/labels'
import { useActiveSession, useProjectMap } from '../projeler/useProjects'
import { useMoveBlock, useStartTask, useToggleDone } from './usePlanning'

// Şimdi (EKRANLAR.md Bugün): şu anki blok → yoksa sıradaki blok ("13:00'TE") → yoksa en öndeki açık görev.
// Proje görevinde etiket proje adını ve rengini taşır; "Başla" projede oturum açar ve bloğu şimdiye çeker.
// O projenin oturumu sürerken "Sonraya at" yerine "Oturumu kapat" gelir. Başka projede süren oturum
// etiketin altında tek satır olarak görünür.

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
  const { openTask, startSession, closeSession } = useShell()
  const projects = useProjectMap()
  const running = useActiveSession()
  const clock = useNow(15_000)
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
  const project = task?.projectId ? projects.get(task.projectId) : undefined
  const ownSession = !!project && running?.project.id === project.id
  const projectLabel = project ? ` · ${project.name}` : ''
  const begin = (t: Task) => {
    const pull = () => start.mutate(t.id, { onError })
    if (project) startSession(project.id, { taskId: t.id, after: pull })
    else pull()
  }

  let label: string
  let title: string
  if (focus.kind === 'current') {
    const rest = formatDuration(focus.block.end - nowMin)
    label = `Şimdi${focus.block.kind === 'routine' ? ' · Rutin' : projectLabel} · ${rest} kaldı`
    title = focus.block.title
  } else if (focus.kind === 'next') {
    const dur = formatDuration(focus.block.end - focus.block.start)
    label = `${formatAtClock(focus.block.start)}${focus.block.kind === 'routine' ? ' · Rutin' : projectLabel} · ${dur}`
    title = focus.block.title
  } else if (focus.kind === 'task') {
    label = `Sıradaki adım${projectLabel}`
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
  if (focus.kind === 'current' && task && ownSession) {
    actions = (
      <>
        {complete}
        <Button variant="secondary" icon={Square} className="h-12" onClick={closeSession}>
          Oturumu kapat
        </Button>
      </>
    )
  } else if (focus.kind === 'current' && task) {
    actions = (
      <>
        {complete}
        {project && (
          <Button
            variant="secondary"
            icon={Play}
            className="h-12"
            onClick={() => startSession(project.id, { taskId: task.id })}
          >
            Oturumu aç
          </Button>
        )}
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
          onClick={() => begin(task)}
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
          <span
            className="size-3 rounded-full bg-ink3"
            style={project ? { backgroundColor: project.color } : undefined}
          />
          {label}
        </span>
        {running && !ownSession && (
          <span className="flex items-center gap-2 text-[14px] font-semibold text-ink2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: running.project.color }}
            />
            {running.project.name} oturumu sürüyor ·{' '}
            {formatTimer(clock - running.session.startedAt)}
            <Button size="xs" variant="secondary" onClick={closeSession}>
              Kapat
            </Button>
          </span>
        )}
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
