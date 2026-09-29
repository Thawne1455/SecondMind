import { useEffect, useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import {
  Bot,
  CheckCircle2,
  Flag,
  GitCommitHorizontal,
  Image as ImageIcon,
  MessagesSquare,
  Newspaper,
  NotebookPen,
  Plus,
  Star,
  Timer,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { LOG_NOTE_MAX, type LogItem, type ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatMinutes } from '../../lib/format'
import { Button, Chip, cn, IconButton, Kbd, Skeleton, Textarea, useToast } from '../../ui'
import { DevlogDialog } from './DevlogDialog'
import { ReportItem } from './ReportItem'
import { KIND_LABEL as TASK_KIND_LABEL } from './board'
import { useAddLogNote, useDeleteLogNote, useProjectLog, useRestoreLogNote } from './useLog'

// Projeler > Günlük (PROJELER.md > 5. Günlük, 5d-3). "Bu projede ne oldu, ne zaman?" Zaman çizelgesi: gün gün,
// en yeni üstte; solda gün, sağda o günün öğeleri (commit grubu, oturum, biten görev, taş, playtest, kare, not).
// Kanbanın ve Notlar'ın kopyası değil: birim olay, eksen zaman. Üstte filtre, `+ Not`, `Bu hafta` (Ctrl D).

type Filter = 'all' | 'commits' | 'sessions' | 'notes'

const FILTERS: { id: Filter; label: string; kinds: LogItem['kind'][] | null }[] = [
  { id: 'all', label: 'Hepsi', kinds: null },
  { id: 'commits', label: "Commit'ler", kinds: ['commits'] },
  { id: 'sessions', label: 'Oturumlar', kinds: ['session', 'report'] },
  { id: 'notes', label: 'Notlar', kinds: ['note'] },
]

export function ProjectLog({ project }: { project: ProjectSummary }) {
  const log = useProjectLog(project.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [writing, setWriting] = useState(false)
  const [devlogOpen, setDevlogOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'd') return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      setDevlogOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const kinds = FILTERS.find((f) => f.id === filter)!.kinds
  const days = (log.data?.pages ?? [])
    .flatMap((p) => p.days)
    .map((d) => ({ ...d, items: kinds ? d.items.filter((i) => kinds.includes(i.kind)) : d.items }))
    .filter((d) => d.items.length)

  return (
    <section aria-label="Günlük" className="flex max-w-[1040px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
        <span className="grow" />
        <Button variant="secondary" icon={Plus} onClick={() => setWriting(true)}>
          Not
        </Button>
        <Button icon={Newspaper} onClick={() => setDevlogOpen(true)} title="Ctrl D">
          Bu hafta
          <Kbd tone="onFill" className="ml-2 bg-white/20 text-white">
            Ctrl D
          </Kbd>
        </Button>
      </div>

      {writing && <NoteComposer project={project} onDone={() => setWriting(false)} />}

      {log.isPending ? (
        <Skeleton className="h-[320px] rounded-tile" />
      ) : days.length === 0 ? (
        <p className="m-0 rounded-tile bg-s2 px-6 py-8 text-[18px] font-extrabold">
          {filter === 'all'
            ? 'Günlük boş. Bir oturum aç, commit at ya da + Not ile yaz; her şey burada gün gün birikir.'
            : 'Bu filtrede kayıt yok.'}
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-5 p-0">
          {days.map((d) => (
            <DayGroup key={d.day} project={project} day={d.day} items={d.items} />
          ))}
        </ol>
      )}

      {log.hasNextPage && (
        <Button
          variant="secondary"
          className="self-start"
          loading={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          Daha eski
        </Button>
      )}

      <DevlogDialog project={project} open={devlogOpen} onClose={() => setDevlogOpen(false)} />
    </section>
  )
}

function NoteComposer({ project, onDone }: { project: ProjectSummary; onDone: () => void }) {
  const add = useAddLogNote()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const save = () => {
    if (!text.trim()) return onDone()
    add.mutate(
      { projectId: project.id, bodyMd: text },
      {
        onSuccess: onDone,
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-tile bg-s2 p-4">
      <Textarea
        autoFocus
        rows={3}
        value={text}
        maxLength={LOG_NOTE_MAX}
        placeholder="Bugün projede ne oldu? Karar, gözlem, his…"
        aria-label="Günlük notu"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault()
            save()
          }
          if (e.key === 'Escape') onDone()
        }}
        className="bg-bg"
      />
      <div className="flex items-center gap-2">
        <span className="grow text-[13px] font-semibold text-ink3">
          <Kbd>Ctrl Enter</Kbd> kaydeder · <Kbd>Esc</Kbd> vazgeç
        </span>
        <Button size="sm" variant="secondary" className="[--btn-soft:var(--bg)]" onClick={onDone}>
          Vazgeç
        </Button>
        <Button size="sm" loading={add.isPending} onClick={save}>
          Kaydet
        </Button>
      </div>
    </div>
  )
}

function DayGroup({
  project,
  day,
  items,
}: {
  project: ProjectSummary
  day: string
  items: LogItem[]
}) {
  const date = parseISO(day)
  return (
    <li className="grid grid-cols-[112px_minmax(0,1fr)] gap-5">
      <div className="sticky top-4 flex flex-col self-start leading-none">
        <span className="x text-[40px] font-black tabular-nums">{format(date, 'd')}</span>
        <span className="cx pt-1.5 text-ink2">{format(date, 'MMM yyyy', { locale: tr })}</span>
        <span className="cx pt-1 text-ink3">{format(date, 'EEEE', { locale: tr })}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 border-l-3 border-s2 p-0 pl-5">
        {items.map((item, i) => (
          <LogRow
            key={`${item.kind}-${'id' in item ? item.id : i}`}
            project={project}
            item={item}
          />
        ))}
      </ul>
    </li>
  )
}

function Row({
  icon: Icon,
  tone,
  time,
  title,
  children,
  aside,
}: {
  icon: LucideIcon
  /** Simge dairesinin rengi. */
  tone: string
  time?: number
  title: ReactNode
  children?: ReactNode
  aside?: ReactNode
}) {
  return (
    <li className="relative flex gap-3 rounded-[18px] bg-s2 px-4 py-3">
      <span
        className="absolute top-3.5 -left-[33px] grid size-6 place-items-center rounded-full text-fill-ink ring-4 ring-bg"
        style={{ backgroundColor: tone }}
        aria-hidden
      >
        <Icon size={13} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 grow flex-col gap-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 text-[15px] leading-[1.35] font-bold break-words">{title}</span>
          {time !== undefined && (
            <span className="ml-auto shrink-0 text-[13px] font-semibold text-ink3 tabular-nums">
              {format(time, 'HH:mm')}
            </span>
          )}
        </span>
        {children}
      </div>
      {aside}
    </li>
  )
}

function LogRow({ project, item }: { project: ProjectSummary; item: LogItem }) {
  const remove = useDeleteLogNote()
  const restore = useRestoreLogNote()
  const { toast } = useToast()
  switch (item.kind) {
    case 'commits':
      return (
        <Row
          icon={GitCommitHorizontal}
          tone={project.color}
          time={item.at}
          title={`${item.messages.length} commit`}
        >
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[14px] text-ink2">
            {item.messages.slice(0, 6).map((m, i) => (
              <li key={i} className="truncate">
                {m}
              </li>
            ))}
            {item.messages.length > 6 && (
              <li className="text-ink3">+{item.messages.length - 6} daha</li>
            )}
          </ul>
          {item.areas.length > 0 && (
            <span className="text-[13px] font-semibold text-ink3">
              {item.areas
                .slice(0, 5)
                .map(([a, n]) => `${a} ${n}`)
                .join(' · ')}
            </span>
          )}
        </Row>
      )
    case 'session':
      return (
        <Row
          icon={item.source === 'claude_code' ? Bot : Timer}
          tone="#DAD5FF"
          time={item.at}
          title={`${item.source === 'claude_code' ? 'Claude Code oturumu' : 'Oturum'} · ${formatMinutes(item.minutes)}`}
        >
          {item.leftOff && (
            <span className="text-[14px] whitespace-pre-line text-ink2">{item.leftOff}</span>
          )}
          {item.nextStep && (
            <span className="text-[13px] font-semibold text-ink3">Sıradaki: {item.nextStep}</span>
          )}
        </Row>
      )
    case 'task':
      return (
        <Row icon={CheckCircle2} tone="#3BE08F" time={item.at} title={item.title}>
          <span className="text-[13px] font-semibold text-ink3">
            {TASK_KIND_LABEL[item.taskKind]} bitti
          </span>
        </Row>
      )
    case 'milestone':
      return (
        <Row
          icon={Flag}
          tone="#FFB21E"
          time={item.at}
          title={`Kilometre taşı tamam: ${item.title}`}
        />
      )
    case 'playtest':
      return (
        <Row
          icon={MessagesSquare}
          tone="#F59BE6"
          time={item.at}
          title={`Playtest · ${item.points} nokta`}
        >
          {item.people.length > 0 && (
            <span className="text-[14px] text-ink2">{item.people.join(', ')}</span>
          )}
        </Row>
      )
    case 'shot':
      return (
        <Row
          icon={ImageIcon}
          tone="#7CC4FF"
          time={item.at}
          title={
            <span className="flex items-center gap-1.5">
              Zaman makinesi
              {item.starred && <Star size={14} strokeWidth={2} className="fill-amber text-amber" />}
            </span>
          }
        >
          <img
            src={item.url}
            alt=""
            loading="lazy"
            className="mt-1 max-h-[180px] w-auto self-start rounded-[14px]"
          />
        </Row>
      )
    case 'report':
      return <ReportItem project={project} item={item} />
    case 'note':
      return (
        <Row
          icon={item.devlog ? Newspaper : NotebookPen}
          tone="#EAEAF0"
          time={item.at}
          title={item.devlog ? 'Devlog' : 'Not'}
          aside={
            <IconButton
              label="Notu sil"
              icon={Trash2}
              className="size-8 self-start"
              onClick={() =>
                remove.mutate(item.id, {
                  onSuccess: () =>
                    toast({
                      domain: 'projects',
                      message: 'Not çöp kutusunda.',
                      action: { label: 'Geri al', onClick: () => restore.mutate(item.id) },
                    }),
                })
              }
            />
          }
        >
          <span
            className={cn(
              'text-[15px] leading-[1.45] whitespace-pre-line',
              item.devlog && 'line-clamp-6 font-mono text-[13px]',
            )}
          >
            {item.bodyMd}
          </span>
        </Row>
      )
  }
}
