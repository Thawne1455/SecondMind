import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import { ListPlus, Pencil, Play, Square, X } from 'lucide-react'
import {
  NEXT_STEP_MAX,
  type Milestone,
  type MilestoneScope,
  type NextStep,
  type ParkingItem,
  type ProjectScanInfo,
  type ProjectSummary,
  type Session,
  type Task,
} from '@shared/ipc'
import { useShell } from '../../app/shell-context'
import { errorText } from '../../lib/errors'
import { formatAgo, formatMinutes } from '../../lib/format'
import { parseQuickEntry } from '../../lib/quickEntry'
import { tileSpans } from '../../lib/tiles'
import { useNow } from '../../lib/useNow'
import { Button, cn, IconButton, Input, Kbd, Tag, Tile, useToast } from '../../ui'
import { TaskRow } from '../bugun/TaskList'
import { useCreateTask, useTasks } from '../bugun/usePlanning'
import { formatTimer, minutesBetween } from './labels'
import { Rhythm } from './Rhythm'
import { activeMilestone, formatShortDay, lateLabel, trendText } from './roadmapText'
import {
  useMilestones,
  useMilestoneScopes,
  useParking,
  useResolveParking,
  useRestoreParking,
  useNextSteps,
  useScanInfo,
  useSessions,
  useUpdateProject,
} from './useProjects'

// Kokpit (PROJELER.md): projeyi açınca ilk görülen yer, her karo tek soru. Üstte vurgulu "Şimdi bunu yap"
// (ekrandaki tek poster başlık) ve "Son oturum"; altta içeriği olan karolar dengeli yayılır:
// Kilometre taşı (5c), Sonra (park alanı), Görevler, Ritim, Bu hafta ve Koddaki notlar (tarama, 5b). Vurgulu karo sıradaki adım
// motorunun (5c) ilk 3 adımını gerekçesiyle gösterir; oturum kapanışında yazılan adım motora +35 ile girer.

export function Cockpit({ project }: { project: ProjectSummary }) {
  const openTasks = (useTasks('open').data ?? []).filter((t) => t.projectId === project.id)
  const parking = useParking(project.id).data ?? []
  const sessions = useSessions(project.id, 5).data ?? []
  const closed = sessions.filter((s) => s.endedAt !== null)
  const scan = useScanInfo(project.id).data ?? null
  const now = useNow(60_000)
  const steps = useNextSteps(project).data ?? []
  const milestone = activeMilestone(useMilestones(project.id).data ?? [])
  const scope = useMilestoneScopes(project.id).data?.find((s) => s.milestoneId === milestone?.id)

  const lower: { key: string; node: ReactNode }[] = []
  if (milestone)
    lower.push({
      key: 'milestone',
      node: <MilestoneTile project={project} milestone={milestone} scope={scope} />,
    })
  if (parking.length) lower.push({ key: 'park', node: <ParkingTile items={parking} /> })
  lower.push({
    key: 'tasks',
    node: <TasksTile projectId={project.id} tasks={openTasks} />,
  })
  if (closed.length || project.activeSession)
    lower.push({ key: 'rhythm', node: <RhythmTile project={project} /> })
  if (scan && (scan.week.commits || scan.uncommitted?.count))
    lower.push({ key: 'week', node: <WeekTile info={scan} now={now} /> })
  if (scan?.todos && (scan.todos.open || scan.todos.resolved))
    lower.push({ key: 'todos', node: <TodosTile todos={scan.todos} /> })
  const spans = tileSpans(lower.length)

  return (
    <section aria-label="Kokpit" className="grid grid-cols-12 gap-4">
      <NowTile project={project} steps={steps} className="col-span-8" />
      <LastSessionTile
        project={project}
        last={project.lastSession}
        earlier={closed.filter((s) => s.id !== project.lastSession?.id)}
        className="col-span-4"
      />
      {lower.map((t, i) => (
        <div
          key={t.key}
          className="flex min-h-[260px] flex-col"
          style={{ gridColumn: `span ${spans[i]! * 2} / span ${spans[i]! * 2}` }}
        >
          {t.node}
        </div>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------- Şimdi bunu yap

type NowTileProps = {
  project: ProjectSummary
  steps: NextStep[]
  className?: string
}

function NowTile({ project: p, steps, className }: NowTileProps) {
  const now = useNow(15_000)
  const { startSession, closeSession, openPark } = useShell()
  const update = useUpdateProject()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const session = p.activeSession

  // Sıradaki adım motoru (domain/nextSteps): 1. adım poster başlık, gerekçesiyle; 2. ve 3. küçük satır.
  const first = steps[0]
  const title = first?.title ?? ''
  const reason = first ? `Neden: ${first.reason}` : ''
  const taskId = first?.taskId ?? null

  function startEdit() {
    setDraft(p.nextStep || title)
    setEditing(true)
  }
  function save() {
    const value = draft.trim()
    setEditing(false)
    if (value === p.nextStep) return
    update.mutate(
      { id: p.id, nextStep: value },
      { onError: (e) => toast({ message: errorText(e), domain: 'warning' }) },
    )
  }

  return (
    <Tile
      variant="featured"
      className={cn('min-h-[320px] justify-between', className)}
      eyebrow={
        session ? (
          <>
            <span
              className="size-2.5 animate-pulse rounded-full"
              style={{ backgroundColor: p.color }}
            />
            Oturumda · {formatTimer(now - session.startedAt)} · başladı{' '}
            {format(session.startedAt, 'HH:mm')}
          </>
        ) : (
          <>
            <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            Şimdi bunu yap
          </>
        )
      }
    >
      <div className="flex grow flex-col justify-end gap-3">
        {editing ? (
          <textarea
            autoFocus
            rows={2}
            value={draft}
            maxLength={NEXT_STEP_MAX}
            aria-label="Sıradaki adım"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                save()
              }
              if (e.key === 'Escape') {
                e.stopPropagation()
                setEditing(false)
              }
            }}
            className="x w-full resize-none rounded-field bg-s2 px-3 py-2 text-[48px] leading-[.98] font-black uppercase outline-none"
          />
        ) : title ? (
          <button
            type="button"
            title="Düzenle"
            onClick={startEdit}
            className="x m-0 cursor-text text-left leading-[.95] font-black break-words uppercase decoration-4 underline-offset-8 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo"
            style={{ fontSize: posterSize(title) }}
          >
            {title}
          </button>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="x m-0 cursor-text text-left text-[64px] leading-[.95] font-black text-ink3 uppercase focus-visible:outline-3 focus-visible:outline-indigo"
          >
            Sıradaki adımı yaz
          </button>
        )}
        {reason && !editing && (
          <span className="text-[15px] font-semibold text-ink2">
            {reason}
            {first?.suggestSplit && ' · Böl'}
          </span>
        )}
        {!editing && steps.length > 1 && (
          <ol className="flex flex-col gap-1 pt-1" aria-label="Sonraki adımlar">
            {steps.slice(1, 3).map((s, i) => (
              <li key={s.kind + s.id} className="flex items-baseline gap-2 text-[15px]">
                <span className="w-4 shrink-0 font-bold text-ink3">{i + 2}</span>
                <span className="font-semibold">{s.title}</span>
                <span className="truncate text-ink2">{s.reason}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="flex items-center gap-2.5 pt-2">
        {session ? (
          <Button size="lg" icon={Square} onClick={closeSession}>
            Oturumu kapat
          </Button>
        ) : (
          <Button
            size="lg"
            variant="action"
            icon={Play}
            onClick={() => startSession(p.id, { taskId })}
          >
            Başla
          </Button>
        )}
        {session ? (
          <Button variant="secondary" className="h-12" onClick={() => openPark(p.id)}>
            Park et
          </Button>
        ) : (
          <Button variant="secondary" icon={Pencil} className="h-12" onClick={startEdit}>
            Adımı değiştir
          </Button>
        )}
      </div>
    </Tile>
  )
}

// ---------------------------------------------------------------- Son oturum

function LastSessionTile({
  project,
  last,
  earlier,
  className,
}: {
  project: ProjectSummary
  last: Session | null
  /** Daha eski kapanmış oturumlar, yeni önce: "nerede bıraktın" izi. */
  earlier: Session[]
  className?: string
}) {
  const now = useNow(60_000)
  if (!last) {
    return (
      <Tile variant="standard" eyebrow="Son oturum" className={className} title="Henüz oturum yok">
        <span className="text-ink2">
          Başla'ya bas; SecondMind süreyi ve nerede bıraktığını tutar. Dönünce ilk bunu görürsün.
        </span>
      </Tile>
    )
  }
  const min = minutesBetween(last.startedAt, last.endedAt!)
  return (
    <Tile
      variant="standard"
      className={className}
      eyebrow={`Son oturum · ${formatAgo(last.endedAt!, now)}`}
    >
      <div className="flex items-end gap-2.5">
        <span className="x text-[56px] leading-[.9] font-black">{formatTimer(min * 60_000)}</span>
        <span className="cx pb-[5px] text-ink2">
          {format(last.startedAt, 'EEE HH:mm', { locale: tr })}
        </span>
      </div>
      {last.leftOff ? (
        <blockquote
          className="m-0 border-l-4 pl-3 text-[16px] leading-[1.4] font-semibold whitespace-pre-line"
          style={{ borderColor: project.color }}
        >
          <span className="line-clamp-5">{last.leftOff}</span>
        </blockquote>
      ) : last.source === 'claude_code' ? (
        <span className="text-[15px] text-ink3">
          Claude Code ile çalıştın; kayıtlardan kendiliğinden eklendi.
        </span>
      ) : (
        <span className="text-[15px] text-ink3">Nerede bıraktığını yazmamışsın.</span>
      )}
      {last.files.length > 0 && <SessionFiles files={last.files} />}
      {earlier.length > 0 && (
        <ol className="m-0 mt-auto flex list-none flex-col gap-2 border-t-2 border-line p-0 pt-3">
          {earlier.slice(0, 3).map((s) => (
            <li key={s.id} className="flex flex-col">
              <span className="cx text-ink3">
                {format(s.startedAt, 'EEE d MMM', { locale: tr })} ·{' '}
                {formatMinutes(minutesBetween(s.startedAt, s.endedAt!))}
              </span>
              <span className="line-clamp-1 text-[14px] font-semibold text-ink2">
                {s.leftOff || s.nextStep || sessionLabel(s)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Tile>
  )
}

/** Notsuz oturumun satırı: "Claude Code · 4 dosya" ya da "—". */
function sessionLabel(s: Session): string {
  if (s.source !== 'claude_code') return '—'
  return s.files.length ? `Claude Code · ${s.files.length} dosya` : 'Claude Code'
}

/** Oturumda değişen dosyalar: en fazla 4 dosya adı, fazlası sayıyla. Tam yol üzerine gelince. */
function SessionFiles({ files }: { files: Session['files'] }) {
  const shown = files.slice(0, 4)
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {shown.map((f) => (
        <li key={f.path} title={`${f.path} · ${f.area}`}>
          <Tag className="bg-bg">{f.path.split('/').pop()}</Tag>
        </li>
      ))}
      {files.length > shown.length && (
        <li>
          <Tag className="bg-bg">+{files.length - shown.length}</Tag>
        </li>
      )}
    </ul>
  )
}

// ---------------------------------------------------------------- Sonra (park alanı)

function ParkingTile({ items }: { items: ParkingItem[] }) {
  const now = useNow(60_000)
  const resolve = useResolveParking()
  const restore = useRestoreParking()
  const { toast } = useToast()
  const rows = useRef<(HTMLLIElement | null)[]>([])

  function act(item: ParkingItem, action: 'convert' | 'dismiss', index: number) {
    // Son öğe gidince karo gizlenir; toast yine de çıksın diye mutateAsync.
    resolve.mutateAsync({ id: item.id, action }).then(
      () => {
        rows.current[Math.min(index, items.length - 2)]?.focus()
        toast({
          message: action === 'convert' ? `Görev oldu: ${item.text}` : `Atıldı: ${item.text}`,
          domain: 'projects',
          action: { label: 'Geri al', onClick: () => restore.mutate(item.id) },
        })
      },
      (e: unknown) => toast({ message: errorText(e), domain: 'warning' }),
    )
  }

  function onKeyDown(e: KeyboardEvent<HTMLLIElement>, item: ParkingItem, i: number) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter') act(item, 'convert', i)
    else if (e.key === 'Delete' || e.key === 'Backspace') act(item, 'dismiss', i)
    else if (e.key === 'ArrowDown') rows.current[i + 1]?.focus()
    else if (e.key === 'ArrowUp') rows.current[i - 1]?.focus()
    else return
    e.preventDefault()
  }

  return (
    <Tile variant="standard" className="grow" eyebrow={<>Sonra · {items.length}</>}>
      <span className="-mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink3">
        Aklına gelip park ettiklerin. <Kbd>Enter</Kbd> görev · <Kbd>Del</Kbd> at
      </span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.slice(0, 8).map((item, i) => (
          <li
            key={item.id}
            ref={(el) => {
              rows.current[i] = el
            }}
            tabIndex={0}
            onKeyDown={(e) => onKeyDown(e, item, i)}
            className="group/row flex items-center gap-2 rounded-[18px] bg-bg py-1.5 pr-1.5 pl-4 focus-visible:outline-3 focus-visible:outline-indigo"
          >
            <span className="min-w-0 grow">
              <span className="line-clamp-2 text-[15px] font-bold">{item.text}</span>
              <span className="text-[13px] font-semibold text-ink3">
                {formatAgo(item.createdAt, now)}
                {item.inActiveSession && ' · bu oturumda'}
              </span>
            </span>
            <IconButton
              label="Göreve çevir"
              icon={ListPlus}
              onClick={() => act(item, 'convert', i)}
            />
            <IconButton label="At" icon={X} onClick={() => act(item, 'dismiss', i)} />
          </li>
        ))}
      </ul>
      {items.length > 8 && (
        <span className="text-[13px] font-semibold text-ink3">+{items.length - 8} daha</span>
      )}
    </Tile>
  )
}

// ---------------------------------------------------------------- Kilometre taşı

/**
 * Sonraki taş: kalan gün, görevlerden ilerleme, kapsam cümlesi. Hedef geçtiyse ya da gerçekçi tahmin hedefi
 * geçiyorsa mercan (uyarı karosu).
 */
function MilestoneTile({
  project,
  milestone: m,
  scope,
}: {
  project: ProjectSummary
  milestone: Milestone
  scope: MilestoneScope | undefined
}) {
  const navigate = useNavigate()
  const today = format(useNow(60_000), 'yyyy-MM-dd')
  const overdue = m.targetDate !== null && m.targetDate < today
  const late = overdue || !!scope?.finish.late
  const total = scope ? scope.openTasks + scope.doneTasks : 0
  const days = m.targetDate
    ? differenceInCalendarDays(parseISO(m.targetDate), parseISO(today))
    : null
  return (
    <Tile
      variant={late ? 'alert' : 'standard'}
      className="grow"
      eyebrow={
        m.targetDate ? `Kilometre taşı · hedef ${formatShortDay(m.targetDate)}` : 'Kilometre taşı'
      }
      metric={
        days === null
          ? undefined
          : days === 0
            ? { value: 'BUGÜN', label: 'hedef' }
            : { value: Math.abs(days), label: days > 0 ? 'gün kaldı' : 'gün geçti' }
      }
      title={m.title}
      actions={[
        <Button
          key="open"
          size="sm"
          variant={late ? 'onTile' : 'secondary'}
          className={late ? undefined : '[--btn-soft:var(--bg)]'}
          onClick={() => void navigate(`/projeler/${project.id}/yol-haritasi`)}
        >
          Yol haritası
        </Button>,
      ]}
    >
      {total > 0 && scope && (
        <div className="flex flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label="Taşın görevleri"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={scope.doneTasks}
            className={cn('h-2.5 overflow-hidden rounded-full', late ? 'bg-white/30' : 'bg-s3')}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${(scope.doneTasks / total) * 100}%`,
                background: late ? '#FFFFFF' : project.color,
              }}
            />
          </div>
          <span className="text-[13px] font-semibold opacity-80">
            {scope.doneTasks}/{total} görev
          </span>
        </div>
      )}
      <span
        className={cn(
          'text-[14px] font-semibold',
          !late && (scope?.trend.state === 'growing' ? 'text-t-coral' : 'text-ink2'),
        )}
      >
        {scope?.finish.late && m.targetDate
          ? lateLabel(m.targetDate, scope)
          : scope && total > 0
            ? trendText(scope.trend)
            : 'Taşa bağlı görev yok.'}
      </span>
    </Tile>
  )
}

// ---------------------------------------------------------------- Görevler

function TasksTile({ projectId, tasks }: { projectId: string; tasks: Task[] }) {
  const { openTask } = useShell()
  const create = useCreateTask()
  const { toast } = useToast()
  const [text, setText] = useState('')

  function add() {
    const q = parseQuickEntry(text, new Date())
    if (!q.title) return
    create.mutate(
      {
        title: q.title,
        projectId,
        plannedDate: q.date,
        dueDate: q.dueDate,
        estimateMin: q.estimateMin,
        priority: q.priority ?? 2,
      },
      {
        onSuccess: () => setText(''),
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
    )
  }

  return (
    <Tile variant="standard" className="grow" eyebrow={<>Görevler · {tasks.length}</>}>
      {tasks.length === 0 ? (
        <span className="text-ink2">Projenin açık görevi yok. Aşağıya yaz, Enter ekler.</span>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tasks.slice(0, 6).map((t) => (
            <TaskRow key={t.id} task={t} onEdit={() => openTask(t)} className="bg-bg" />
          ))}
          {tasks.length > 6 && (
            <span className="text-[13px] font-semibold text-ink3">+{tasks.length - 6} daha</span>
          )}
        </div>
      )}
      <Input
        value={text}
        placeholder="Görev ekle… (yarın, 45dk, !)"
        aria-label="Projeye görev ekle"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        className="mt-auto bg-bg"
      />
    </Tile>
  )
}

// ---------------------------------------------------------------- Ritim

function RhythmTile({ project: p }: { project: ProjectSummary }) {
  const days = p.rhythm.filter((m) => m > 0).length
  const total = p.rhythm.reduce((a, b) => a + b, 0)
  return (
    <Tile variant="standard" className="grow" eyebrow="Ritim · son 14 gün">
      <div className="flex items-end justify-between gap-3">
        <span className="flex items-end gap-2.5">
          <span className="x text-[56px] leading-[.9] font-black">
            {formatTimer(p.weekMinutes * 60_000)}
          </span>
          <span className="cx pb-[5px] text-ink2">Bu hafta · {p.weekSessions} oturum</span>
        </span>
      </div>
      <Rhythm days={p.rhythm} color={p.color} height={56} className="my-1" />
      <span className="mt-auto text-[13px] font-semibold text-ink3">
        {days > 0
          ? `Son 14 günde ${days} gün çalıştın · toplam ${formatMinutes(total)}`
          : 'Son 14 günde oturum yok.'}
      </span>
    </Tile>
  )
}

// ---------------------------------------------------------------- Bu hafta (tarama)

const STALE_DAYS = 3

/** Bu haftanın commit'leri, değişen alanlar ve commit'lenmemiş dosyalar. Dakika Ritim karosunda. */
function WeekTile({ info, now }: { info: ProjectScanInfo; now: number }) {
  const u = info.uncommitted
  const stale = u?.oldestAt != null && now - u.oldestAt > STALE_DAYS * 86_400_000
  return (
    <Tile
      variant="standard"
      className="grow"
      eyebrow="Bu hafta"
      metric={{ value: info.week.commits, label: 'commit' }}
    >
      {info.week.areas.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {info.week.areas.slice(0, 6).map(([area, n]) => (
            <li key={area}>
              <Tag className="bg-bg">
                {area} <span className="ml-1 opacity-60 tabular-nums">{n}</span>
              </Tag>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-[14px] text-ink3">Bu hafta commit yok.</span>
      )}
      {u && u.count > 0 && (
        <span
          className={cn('mt-auto text-[14px] font-semibold', stale ? 'text-coral' : 'text-ink2')}
        >
          {u.count} dosya commit'lenmemiş
          {u.oldestAt !== null && ` · en eskisi ${formatAgo(u.oldestAt, now)}`}
        </span>
      )}
      <span className={cn('text-[12px] font-semibold text-ink3', !(u && u.count > 0) && 'mt-auto')}>
        Tarandı: {formatAgo(info.lastScanAt, now)}
      </span>
    </Tile>
  )
}

// ---------------------------------------------------------------- Koddaki notlar (tarama)

function TodosTile({ todos }: { todos: NonNullable<ProjectScanInfo['todos']> }) {
  const diff =
    todos.added !== null && (todos.added || todos.resolved)
      ? `son taramada +${todos.added} / −${todos.resolved}`
      : null
  return (
    <Tile
      variant="standard"
      className="grow"
      eyebrow={diff ? `Koddaki notlar · ${diff}` : 'Koddaki notlar'}
      metric={{ value: todos.open, label: 'açık not' }}
    >
      <div className="flex gap-1.5">
        {(['FIXME', 'TODO', 'HACK'] as const)
          .filter((t) => todos.byTag[t] > 0)
          .map((t) => (
            <Tag key={t} className="bg-bg">
              {t} <span className="ml-1 opacity-60 tabular-nums">{todos.byTag[t]}</span>
            </Tag>
          ))}
      </div>
      <ul className="m-0 mt-auto flex list-none flex-col gap-1 p-0">
        {todos.recent.slice(0, 3).map((t) => (
          <li
            key={`${t.path}:${t.line}`}
            className="flex min-w-0 gap-2 text-[14px]"
            title={`${t.path}:${t.line}`}
          >
            <span className="shrink-0 font-mono text-[12px] leading-[1.6] text-ink3">
              {t.path.split('/').pop()}:{t.line}
            </span>
            <span className="truncate font-semibold">{t.text || t.tag}</span>
          </li>
        ))}
      </ul>
    </Tile>
  )
}

/** Poster başlık kırpılmaz: uzun adım küçülür (64 → 36). */
function posterSize(text: string): number {
  const n = text.length
  if (n <= 28) return 64
  if (n <= 52) return 54
  if (n <= 90) return 44
  return 36
}
