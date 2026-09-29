import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router'
import { ChevronDown, ChevronRight, ListPlus, X } from 'lucide-react'
import type { KanbanStatus, Milestone, ParkingItem, ProjectSummary, Task } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatAgo } from '../../lib/format'
import { parseProjectEntry, PROJECT_ENTRY_HINT } from '../../lib/projectEntry'
import { useNow } from '../../lib/useNow'
import { Chip, cn, IconButton, Input, Kbd, Skeleton, useToast } from '../../ui'
import { useCreateTask } from '../bugun/usePlanning'
import {
  COLUMNS,
  columnOf,
  DONE_VISIBLE,
  groupTasks,
  KIND_ICON,
  KIND_LABEL,
  neighborColumn,
  TASK_DRAG_TYPE,
  type BoardFilter,
} from './board'
import { TaskCard } from './TaskCard'
import { TaskPanel } from './TaskPanel'
import { usePlaytest } from './usePlaytest'
import {
  useMilestones,
  useMoveTask,
  useParking,
  useProjectTasks,
  useResolveParking,
  useRestoreParking,
} from './useProjects'

// Görevler sekmesi (PROJELER.md "Görevler (kanban)"): üstte tek satır hızlı ekleme + taş / tür filtreleri,
// altta dört eşit kolon. Yapılacak'ın üstünde park alanının bekleyenleri ("Sonra: 4", kapalı gelir).
// Kart sürüklenir ya da odaktayken ← / → ile taşınır; tıklayınca / Enter sağda panel açılır, Esc kapatır.

export function TaskBoard({ project }: { project: ProjectSummary }) {
  const tasks = useProjectTasks(project.id)
  const milestoneData = useMilestones(project.id).data
  const milestones = useMemo(() => milestoneData ?? [], [milestoneData])
  const parking = useParking(project.id).data ?? []
  const move = useMoveTask(project.id)
  const { toast } = useToast()
  const [filter, setFilter] = useState<BoardFilter>({ milestoneId: null, kind: null })
  // Playtest'teki "Karta git": ?kart=<görev> paneli açık getirir.
  const [params] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get('kart'))
  const [dragId, setDragId] = useState<string | null>(null)
  const playtestData = usePlaytest(project.id).data
  const playtestPeople = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of playtestData?.clusters ?? [])
      if (c.task) m.set(c.task.id, (m.get(c.task.id) ?? 0) + c.people)
    return m
  }, [playtestData])

  const list = useMemo(() => tasks.data ?? [], [tasks.data])
  const columns = useMemo(() => groupTasks(list, filter), [list, filter])
  const milestoneTitle = useMemo(
    () => new Map(milestones.map((m) => [m.id, m.title])),
    [milestones],
  )
  const selected = list.find((t) => t.id === selectedId) ?? null

  /** Kolon değiştirir; kart yeni kolonunda odakta kalır. Bitti'ye geçişte "Geri al". */
  function moveTo(t: Task, to: KanbanStatus, keepFocus = false) {
    const from = columnOf(t)
    if (from === to) return
    move.mutate(
      { id: t.id, kanbanStatus: to },
      {
        onSuccess: () => {
          if (to !== 'done') return
          toast({
            variant: 'fill',
            domain: 'projects',
            message: `Bitti: ${t.title}`,
            action: {
              label: 'Geri al',
              onClick: () => move.mutate({ id: t.id, kanbanStatus: from }),
            },
          })
        },
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
    )
    if (keepFocus) refocus.current = t.id
  }

  // Klavyeyle taşınan kart yeni kolonunda yeniden kurulur; liste güncellenince odağı geri al.
  const refocus = useRef<string | null>(null)
  useEffect(() => {
    const el = refocus.current
      ? document.querySelector<HTMLElement>(`[data-task-card="${refocus.current}"]`)
      : null
    if (el && el !== document.activeElement) {
      el.focus()
      refocus.current = null
    }
  }, [list])

  const closePanel = useCallback(() => {
    const id = selectedId
    setSelectedId(null)
    if (id) document.querySelector<HTMLElement>(`[data-task-card="${id}"]`)?.focus()
  }, [selectedId])

  const empty = tasks.isSuccess && list.length === 0

  return (
    <section aria-label="Görevler" className="flex items-start gap-4">
      <div className="flex min-w-0 grow flex-col gap-4">
        <QuickAdd project={project} milestones={milestones} filter={filter} setFilter={setFilter} />

        {tasks.isPending ? (
          <div className="grid grid-cols-4 gap-3">
            {COLUMNS.map((c) => (
              <Skeleton key={c.id} shape="tile" className="h-[320px]" />
            ))}
          </div>
        ) : empty && !parking.length ? (
          <p className="m-0 rounded-tile bg-s2 px-6 py-8 text-[18px] font-extrabold">
            Henüz görev yok. Yukarıya yaz, Enter&apos;a bas.
          </p>
        ) : (
          <div className="grid grid-cols-4 items-start gap-3">
            {COLUMNS.map((c) => (
              <Column
                key={c.id}
                id={c.id}
                label={c.label}
                tasks={columns[c.id]}
                onDropTask={(id) => {
                  const t = list.find((x) => x.id === id)
                  if (t) moveTo(t, c.id)
                }}
              >
                {(visible) => (
                  <>
                    {c.id === 'todo' && parking.length > 0 && <ParkingRow items={parking} />}
                    {visible.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        milestone={
                          t.milestoneId ? (milestoneTitle.get(t.milestoneId) ?? null) : null
                        }
                        playtestPeople={playtestPeople.get(t.id)}
                        selected={t.id === selectedId}
                        dragging={t.id === dragId}
                        onOpen={() => setSelectedId(t.id)}
                        onMove={(dir) => {
                          const to = neighborColumn(columnOf(t), dir)
                          if (to) moveTo(t, to, true)
                        }}
                        onDragStart={() => setDragId(t.id)}
                        onDragEnd={() => setDragId(null)}
                      />
                    ))}
                  </>
                )}
              </Column>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <TaskPanel
          key={selected.id}
          task={selected}
          milestones={milestones}
          onClose={closePanel}
          className="sticky top-4 w-[360px] shrink-0"
        />
      )}
    </section>
  )
}

// ---------------------------------------------------------------- hızlı ekleme + filtreler

type QuickAddProps = {
  project: ProjectSummary
  milestones: Milestone[]
  filter: BoardFilter
  setFilter: (f: BoardFilter) => void
}

/** Ctrl G'nin proje bağlamlı hali: yeni görev Yapılacak'a düşer. */
function QuickAdd({ project, milestones, filter, setFilter }: QuickAddProps) {
  const create = useCreateTask()
  const { toast } = useToast()
  const [text, setText] = useState('')

  function add() {
    const q = parseProjectEntry(text, new Date(), milestones)
    if (!q.title || create.isPending) return
    create.mutate(
      {
        title: q.title,
        projectId: project.id,
        kind: q.kind,
        severity: q.severity,
        milestoneId: q.milestoneId,
        estimateMin: q.estimateMin,
        priority: q.priority ?? 2,
        plannedDate: q.date,
        dueDate: q.dueDate,
      },
      {
        onSuccess: () => setText(''),
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
    )
  }

  const toggle = (patch: Partial<BoardFilter>) => setFilter({ ...filter, ...patch })

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        value={text}
        placeholder={PROJECT_ENTRY_HINT}
        aria-label="Yapılacak'a görev ekle"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        className="max-w-[560px] min-w-[280px] grow basis-[360px]"
      />
      <div role="group" aria-label="Türe göre süz" className="flex flex-wrap gap-1.5">
        {(['task', 'bug', 'research'] as const).map((k) => {
          const Icon = KIND_ICON[k]
          return (
            <Chip
              key={k}
              selected={filter.kind === k}
              onClick={() => toggle({ kind: filter.kind === k ? null : k })}
            >
              <Icon size={15} strokeWidth={1.75} aria-hidden className="mr-1.5" />
              {KIND_LABEL[k]}
            </Chip>
          )
        })}
      </div>
      {milestones.length > 0 && (
        <div role="group" aria-label="Kilometre taşına göre süz" className="flex flex-wrap gap-1.5">
          {[...milestones, { id: 'none', title: 'Taşsız' }].map((m) => (
            <Chip
              key={m.id}
              selected={filter.milestoneId === m.id}
              onClick={() => toggle({ milestoneId: filter.milestoneId === m.id ? null : m.id })}
            >
              {m.title}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- kolon

type ColumnProps = {
  id: KanbanStatus
  label: string
  tasks: Task[]
  onDropTask: (taskId: string) => void
  /** Görünen kartları çizer (Bitti son 10'u gösterir). */
  children: (visible: Task[]) => ReactNode
}

function Column({ id, label, tasks, onDropTask, children }: ColumnProps) {
  const [over, setOver] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const hidden = id === 'done' && !showAll ? Math.max(0, tasks.length - DONE_VISIBLE) : 0
  const visible = hidden ? tasks.slice(0, DONE_VISIBLE) : tasks

  // Sadece kart sürüklenirken kabul et (dosya ya da metin bırakılmaz).
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(TASK_DRAG_TYPE)

  return (
    <div
      data-column={id}
      aria-label={`${label}, ${tasks.length} görev`}
      role="group"
      onDragOver={(e) => {
        if (!accepts(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        setOver(false)
        const taskId = e.dataTransfer.getData(TASK_DRAG_TYPE)
        if (!taskId) return
        e.preventDefault()
        onDropTask(taskId)
      }}
      className={cn(
        'flex min-h-[320px] min-w-0 flex-col gap-2 rounded-tile bg-s2 p-2.5 pb-3 transition-colors duration-150',
        over && 'bg-s3',
      )}
    >
      <h2 className="cx m-0 flex items-baseline gap-2 px-2 pt-1.5 pb-1">
        {label}
        <span className="x text-ink3 tabular-nums">{tasks.length}</span>
      </h2>
      {children(visible)}
      {id === 'done' && tasks.length > DONE_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="cursor-pointer self-start rounded-full px-2.5 py-1 text-[13px] font-bold text-ink2 hover:bg-hover focus-visible:outline-3 focus-visible:outline-indigo"
        >
          {showAll ? 'Daha az' : `${hidden} daha`}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Sonra (park alanı)

/** Bekleyen park öğeleri; kapalı gelir. Satır odaktayken Enter göreve çevirir, Del atar. */
function ParkingRow({ items }: { items: ParkingItem[] }) {
  const now = useNow(60_000)
  const resolve = useResolveParking()
  const restore = useRestoreParking()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const rows = useRef<(HTMLLIElement | null)[]>([])

  function act(item: ParkingItem, action: 'convert' | 'dismiss', index: number) {
    // Son öğe gidince satır gizlenir; toast yine de çıksın diye mutateAsync.
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

  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className="flex flex-col gap-1.5 rounded-[18px] bg-s3 p-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-1.5 rounded-[14px] px-2 py-1.5 text-left hover:bg-hover focus-visible:outline-3 focus-visible:outline-indigo"
      >
        <Chevron size={16} strokeWidth={1.75} aria-hidden />
        <span className="cx grow">Sonra: {items.length}</span>
        {open && (
          <span className="text-[13px] font-semibold text-ink3">
            <Kbd>Enter</Kbd> görev · <Kbd>Del</Kbd> at
          </span>
        )}
      </button>
      {open && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {items.map((item, i) => (
            <li
              key={item.id}
              ref={(el) => {
                rows.current[i] = el
              }}
              tabIndex={0}
              onKeyDown={(e) => onKeyDown(e, item, i)}
              className="flex items-center gap-1 rounded-[14px] bg-bg py-1 pr-1 pl-3 focus-visible:outline-3 focus-visible:outline-indigo"
            >
              <span className="min-w-0 grow">
                <span className="line-clamp-2 text-[14px] leading-[1.3] font-bold">
                  {item.text}
                </span>
                <span className="text-[13px] font-semibold text-ink3">
                  {formatAgo(item.createdAt, now)}
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
      )}
    </div>
  )
}
