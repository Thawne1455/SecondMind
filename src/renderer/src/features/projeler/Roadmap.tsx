import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { format } from 'date-fns'
import { Check, Link2, ListPlus, MoreHorizontal, Plus, Sparkles, X } from 'lucide-react'
import {
  CRITERION_TEXT_MAX,
  MILESTONE_DESCRIPTION_MAX,
  MILESTONE_TITLE_MAX,
  type Criterion,
  type Milestone,
  type MilestoneScope,
  type MilestoneUpdateInput,
  type ParkingItem,
  type ProjectSummary,
  type Task,
} from '@shared/ipc'
import { useShell } from '../../app/shell-context'
import { errorText } from '../../lib/errors'
import { formatAgo } from '../../lib/format'
import { useNow } from '../../lib/useNow'
import {
  Button,
  Chip,
  cn,
  Field,
  IconButton,
  Input,
  Kbd,
  Menu,
  Skeleton,
  Textarea,
  useToast,
} from '../../ui'
import { TaskRow } from '../bugun/TaskList'
import { useCreateTask } from '../bugun/usePlanning'
import { ProjectCalendar } from './ProjectCalendar'
import { RoadmapTimeline } from './RoadmapTimeline'
import { activeMilestone, daysLeftText, finishText, formatShortDay, trendText } from './roadmapText'
import { ScopeChart } from './ScopeChart'
import { layoutTimeline } from './timeline'
import {
  useApplyMilestoneTemplate,
  useCreateMilestone,
  useDeleteMilestone,
  useMilestones,
  useMilestoneScopes,
  useParking,
  useProjectTasks,
  useResolveParking,
  useRestoreMilestone,
  useRestoreParking,
  useUpdateMilestone,
} from './useProjects'

// Projeler > Yol haritası (PROJELER.md, 5c-3). "Proje nereye gidiyor?": üstte taşların zaman çizelgesi (siyah
// bant), altında seçili taşın detayı (çıkış kriterleri, bağlı görevler, kapsam ölçer) ve dar park sütunu.
// "Çizelge / Takvim" geçişiyle aynı sekmede proje takvimi. Kanbanın kopyası değildir: birim görev değil taş.

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')

export function Roadmap({ project }: { project: ProjectSummary }) {
  const { data: milestones, isPending } = useMilestones(project.id)
  const scopeList = useMilestoneScopes(project.id).data
  const tasks = useProjectTasks(project.id).data ?? []
  const parking = useParking(project.id).data ?? []
  const [view, setView] = useState<'timeline' | 'calendar'>('timeline')
  const [picked, setPicked] = useState<string | null>(null)
  const today = dayKey(new Date(useNow(60_000)))

  const scopes = useMemo(
    () => new Map((scopeList ?? []).map((s) => [s.milestoneId, s])),
    [scopeList],
  )
  const list = useMemo(() => milestones ?? [], [milestones])
  const selected = list.find((m) => m.id === picked) ?? activeMilestone(list) ?? list[0] ?? null

  const timeline = useMemo(
    () =>
      layoutTimeline(
        list.map((m) => ({
          id: m.id,
          title: m.title,
          targetDate: m.targetDate,
          createdAt: m.createdAt,
          done: m.doneAt !== null,
          finishOn: scopes.get(m.id)?.finish.finishOn ?? null,
          late: scopes.get(m.id)?.finish.late ?? false,
        })),
        today,
      ),
    [list, scopes, today],
  )

  if (isPending)
    return (
      <>
        <Skeleton className="h-[168px] rounded-tile" />
        <Skeleton className="h-[420px] rounded-tile" />
      </>
    )

  return (
    <>
      <div className="flex items-center gap-2">
        <Chip selected={view === 'timeline'} onClick={() => setView('timeline')}>
          Çizelge
        </Chip>
        <Chip selected={view === 'calendar'} onClick={() => setView('calendar')}>
          Takvim
        </Chip>
        <span className="grow" />
        {list.length > 0 && <AddMilestone project={project} onCreated={setPicked} />}
      </div>

      {view === 'calendar' ? (
        <ProjectCalendar
          project={project}
          onPickMilestone={(id) => {
            setPicked(id)
            setView('timeline')
          }}
        />
      ) : list.length === 0 ? (
        <EmptyRoadmap project={project} onCreated={setPicked} />
      ) : (
        <>
          <RoadmapTimeline
            timeline={timeline}
            color={project.color}
            scopes={scopes}
            selectedId={selected?.id ?? null}
            onSelect={setPicked}
          />
          <div className="grid grid-cols-12 items-start gap-4">
            {selected && (
              <MilestoneDetail
                key={selected.id}
                project={project}
                milestone={selected}
                scope={scopes.get(selected.id)}
                tasks={tasks}
                today={today}
                className="col-span-8"
              />
            )}
            <ParkColumn items={parking} milestone={selected} className="col-span-4" />
          </div>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- taş ekleme ve şablon

function AddMilestone({
  project,
  onCreated,
  className,
}: {
  project: ProjectSummary
  onCreated: (id: string) => void
  className?: string
}) {
  const create = useCreateMilestone()
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  function add() {
    const value = title.trim()
    if (!value) return
    create.mutate(
      { projectId: project.id, title: value },
      {
        onSuccess: (m) => {
          setTitle('')
          onCreated(m.id)
        },
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
    )
  }
  return (
    <Input
      value={title}
      maxLength={MILESTONE_TITLE_MAX}
      placeholder="Yeni taş… (Enter)"
      aria-label="Yeni kilometre taşı"
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          add()
        }
      }}
      className={cn('w-[280px]', className)}
    />
  )
}

// Menü etiketi büyük harfe çevrilir; marka adı Türkçe "İ" almasın diye lang="en".
const TEMPLATE_ITEMS = [
  {
    id: 'itch',
    label: <span lang="en">itch.io</span>,
    description: 'Kapak 630×500, Windows ve WebGL yapıları',
  },
  { id: 'steam', label: 'Steam', description: 'Kapsül görseller, fragman, çıkış tarihi' },
]

function EmptyRoadmap({
  project,
  onCreated,
}: {
  project: ProjectSummary
  onCreated: (id: string) => void
}) {
  const apply = useApplyMilestoneTemplate()
  const { toast } = useToast()
  return (
    <section className="flex flex-col items-start gap-3 rounded-tile bg-s2 px-8 py-8">
      <h2 className="m-0 text-[20px] font-extrabold">Henüz kilometre taşı yok</h2>
      <span className="max-w-[640px] text-ink2">
        {project.kind === 'unity'
          ? 'Oyun şablonuyla başla (Prototip → Dikey kesit → Mağaza sayfası → Demo → Beta → Çıkış) ya da ilk taşı kendin yaz.'
          : 'İlk taşı yaz; hedef tarih koyunca çizelgede görünür.'}
      </span>
      <div className="flex items-center gap-3 pt-2">
        {project.kind === 'unity' && (
          <Menu
            items={TEMPLATE_ITEMS}
            label="Yayın platformu"
            onSelect={(platform) =>
              apply.mutate(
                { projectId: project.id, platform: platform as 'itch' | 'steam' },
                {
                  onSuccess: (list) => {
                    onCreated(list[0]!.id)
                    toast({
                      message: `${list.length} taş eklendi. Hedef tarihleri koy, çizelgede görünsünler.`,
                      domain: 'projects',
                    })
                  },
                  onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
                },
              )
            }
            trigger={(props) => (
              <Button {...props} variant="primary" icon={Sparkles} loading={apply.isPending}>
                Şablonla başla
              </Button>
            )}
          />
        )}
        <AddMilestone project={project} onCreated={onCreated} className="bg-bg" />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- taş detayı

type DetailProps = {
  project: ProjectSummary
  milestone: Milestone
  scope: MilestoneScope | undefined
  tasks: Task[]
  today: string
  className?: string
}

function MilestoneDetail({ project, milestone: m, scope, tasks, today, className }: DetailProps) {
  const update = useUpdateMilestone()
  const remove = useDeleteMilestone()
  const restore = useRestoreMilestone()
  const { toast } = useToast()
  const [title, setTitle] = useState(m.title)
  const [description, setDescription] = useState(m.description)
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const save = (patch: Omit<MilestoneUpdateInput, 'id'>) =>
    update.mutate({ id: m.id, ...patch }, { onError })

  const bound = tasks.filter((t) => t.milestoneId === m.id)
  const done = m.doneAt !== null
  const late = !done && (scope?.finish.late || (m.targetDate !== null && m.targetDate < today))

  function saveTitle() {
    const value = title.trim()
    if (value && value !== m.title) save({ title: value })
    else setTitle(m.title)
  }

  function onMenu(id: string) {
    if (id === 'done') save({ done: true })
    else if (id === 'reopen') save({ done: false })
    else if (id === 'delete')
      remove.mutate(m.id, {
        onSuccess: () =>
          toast({
            message: `Silindi: ${m.title}`,
            domain: 'projects',
            action: { label: 'Geri al', onClick: () => restore.mutate(m.id, { onError }) },
          }),
        onError,
      })
  }

  return (
    <section
      aria-label={`Kilometre taşı: ${m.title}`}
      className={cn('flex flex-col gap-6 rounded-tile bg-s2 px-6 pt-5 pb-6', className)}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 grow flex-col gap-1">
          <span className="cx flex items-center gap-2 text-ink2">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: project.color }} />
            Kilometre taşı
            {done &&
              m.doneAt !== null &&
              ` · tamamlandı ${formatShortDay(dayKey(new Date(m.doneAt)))}`}
            {late && (
              <span className="rounded-full bg-coral px-2.5 py-0.5 text-white">Gecikiyor</span>
            )}
          </span>
          <input
            value={title}
            maxLength={MILESTONE_TITLE_MAX}
            aria-label="Taşın adı"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setTitle(m.title)
                e.currentTarget.blur()
              }
            }}
            className={cn(
              'x -ml-2 w-full rounded-field bg-transparent px-2 text-[28px] leading-[1.2] font-black uppercase outline-none hover:bg-hover focus:bg-bg',
              done && 'text-ink3 line-through',
            )}
          />
        </div>
        <Menu
          align="end"
          label="Taş menüsü"
          items={[
            done
              ? { id: 'reopen', label: 'Yeniden aç' }
              : { id: 'done', label: 'Tamamlandı', description: 'Çizelgede soluk kalır' },
            { id: 'delete', label: 'Çöp kutusuna at' },
          ]}
          onSelect={onMenu}
          trigger={(props) => (
            <IconButton
              {...props}
              label="Taş menüsü"
              icon={MoreHorizontal}
              className="[--btn-soft:var(--bg)]"
            />
          )}
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Field
          label="Hedef tarih"
          hint={
            m.targetDate && !done
              ? daysLeftText(m.targetDate, today)
              : 'Tarihsiz taş çizelgede yok.'
          }
          className="w-[220px]"
        >
          <Input
            type="date"
            strong
            value={m.targetDate ?? ''}
            onChange={(e) => save({ targetDate: e.target.value || null })}
            className="x bg-bg"
          />
        </Field>
        {!done && (
          <Button
            variant="secondary"
            icon={Check}
            className="mb-[26px] [--btn-soft:var(--bg)]"
            onClick={() => save({ done: true })}
          >
            Tamamlandı
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Criteria milestone={m} tasks={tasks} onSave={(criteria) => save({ criteria })} />
        <BoundTasks project={project} milestone={m} tasks={bound} />
      </div>

      <Field label="Açıklama" optional>
        <Textarea
          value={description}
          rows={2}
          maxLength={MILESTONE_DESCRIPTION_MAX}
          placeholder="Bu taş neyi kanıtlıyor?"
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== m.description && save({ description })}
          className="bg-bg"
        />
      </Field>

      {!done && <ScopeSection project={project} milestone={m} scope={scope} />}
    </section>
  )
}

// ---------------------------------------------------------------- çıkış kriterleri

type CriterionDraft = Omit<Criterion, 'id'> & { id?: string }

function Criteria({
  milestone: m,
  tasks,
  onSave,
}: {
  milestone: Milestone
  tasks: Task[]
  onSave: (criteria: CriterionDraft[]) => void
}) {
  const [text, setText] = useState('')
  const title = new Map(tasks.map((t) => [t.id, t.title]))
  // Bağlanabilecek görevler: önce bu taşın açık görevleri, sonra projenin diğer açık görevleri.
  const candidates = [
    ...tasks.filter((t) => t.status === 'open' && t.milestoneId === m.id),
    ...tasks.filter((t) => t.status === 'open' && t.milestoneId !== m.id),
  ].slice(0, 12)

  const set = (next: CriterionDraft[]) => onSave(next)
  const replace = (id: string, patch: Partial<Criterion>) =>
    set(m.criteria.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  function add() {
    const value = text.trim()
    if (!value) return
    set([...m.criteria, { text: value, done: false, taskId: null }])
    setText('')
  }

  const doneCount = m.criteria.filter((c) => c.done).length

  return (
    <div className="flex flex-col gap-2">
      <span className="cx text-ink2">
        Çıkış kriterleri{m.criteria.length > 0 && ` · ${doneCount}/${m.criteria.length}`}
      </span>
      {m.criteria.length === 0 && (
        <span className="text-[14px] text-ink3">Bu taş ne zaman bitmiş sayılır? Aşağıya yaz.</span>
      )}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {m.criteria.map((c) => (
          <li
            key={c.id}
            className="group/c flex items-start gap-2 rounded-[14px] bg-bg py-1.5 pr-1 pl-2"
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={c.done}
              aria-label={c.text}
              disabled={c.taskId !== null}
              title={c.taskId ? 'Bağlı görev bitince kendiliğinden işaretlenir' : undefined}
              onClick={() => replace(c.id, { done: !c.done })}
              className={cn(
                'mt-0.5 flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border-2 border-ink',
                c.done && 'bg-ink text-bg',
                'disabled:cursor-default',
                'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
              )}
            >
              {c.done && <Check size={14} strokeWidth={3} aria-hidden />}
            </button>
            <span className="flex min-w-0 grow flex-col">
              <input
                key={c.text}
                defaultValue={c.text}
                maxLength={CRITERION_TEXT_MAX}
                aria-label="Kriter"
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== c.text) replace(c.id, { text: v })
                  else e.target.value = c.text
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className={cn(
                  'w-full bg-transparent text-[15px] font-semibold outline-none',
                  c.done && 'text-ink3 line-through',
                )}
              />
              {c.taskId && (
                <span className="truncate text-[13px] font-semibold text-ink3">
                  görev: {title.get(c.taskId) ?? 'silinmiş görev'}
                </span>
              )}
            </span>
            <Menu
              align="end"
              label="Göreve bağla"
              items={[
                ...(c.taskId ? [{ id: '', label: 'Bağı kaldır' }] : []),
                ...candidates.map((t) => ({ id: t.id, label: t.title })),
              ]}
              onSelect={(taskId) => replace(c.id, { taskId: taskId || null })}
              trigger={(props) => (
                <IconButton
                  {...props}
                  label={c.taskId ? 'Bağlı görevi değiştir' : 'Göreve bağla'}
                  icon={Link2}
                  size="xs"
                  disabled={!c.taskId && candidates.length === 0}
                  className="opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [--btn-soft:transparent]"
                />
              )}
            />
            <IconButton
              label="Kriteri sil"
              icon={X}
              size="xs"
              onClick={() => set(m.criteria.filter((x) => x.id !== c.id))}
              className="opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100 [--btn-soft:transparent]"
            />
          </li>
        ))}
      </ul>
      <Input
        value={text}
        maxLength={CRITERION_TEXT_MAX}
        placeholder="Kriter ekle… (Enter)"
        aria-label="Çıkış kriteri ekle"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        className="bg-bg"
      />
    </div>
  )
}

// ---------------------------------------------------------------- bağlı görevler

const BOUND_DONE_SHOWN = 3

function BoundTasks({
  project,
  milestone: m,
  tasks,
}: {
  project: ProjectSummary
  milestone: Milestone
  tasks: Task[]
}) {
  const { openTask } = useShell()
  const create = useCreateTask()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const open = tasks.filter((t) => t.status === 'open')
  const done = tasks.filter((t) => t.status === 'done')

  function add() {
    const title = text.trim()
    if (!title) return
    create.mutate(
      { title, projectId: project.id, milestoneId: m.id },
      {
        onSuccess: () => setText(''),
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="cx text-ink2">
        Görevler · {open.length} açık{done.length > 0 && `, ${done.length} bitti`}
      </span>
      {tasks.length === 0 && (
        <span className="text-[14px] text-ink3">
          Taşa bağlı görev yok. Park alanından ya da kanbandan görev bağla.
        </span>
      )}
      <div className="flex flex-col gap-1">
        {[...open, ...done.slice(0, BOUND_DONE_SHOWN)].map((t) => (
          <TaskRow key={t.id} task={t} onEdit={() => openTask(t)} className="bg-bg py-1.5" />
        ))}
        {done.length > BOUND_DONE_SHOWN && (
          <span className="text-[13px] font-semibold text-ink3">
            +{done.length - BOUND_DONE_SHOWN} biten görev daha
          </span>
        )}
      </div>
      <Input
        value={text}
        placeholder="Bu taşa görev ekle… (Enter)"
        aria-label="Taşa görev ekle"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        className="mt-auto bg-bg"
      />
    </div>
  )
}

// ---------------------------------------------------------------- kapsam ölçer

function ScopeSection({
  project,
  milestone: m,
  scope,
}: {
  project: ProjectSummary
  milestone: Milestone
  scope: MilestoneScope | undefined
}) {
  if (!scope) return <Skeleton className="h-[200px] rounded-block" />
  const total = scope.openTasks + scope.doneTasks
  return (
    <div className="flex flex-col gap-3 border-t-2 border-line pt-5">
      <div className="flex items-baseline gap-3">
        <span className="cx text-ink2">Kapsam ölçer</span>
        {total > 0 && (
          <span
            className={cn(
              'text-[14px] font-semibold',
              scope.trend.state === 'growing' ? 'text-t-coral' : 'text-ink2',
            )}
          >
            {trendText(scope.trend)}
          </span>
        )}
      </div>
      {total === 0 ? (
        <span className="text-[14px] text-ink3">
          Taşa bağlı görev yok. Park alanından ya da kanbandan görev bağla.
        </span>
      ) : (
        <>
          <ScopeChart weeks={scope.weeks} color={project.color} />
          <span
            className={cn(
              'text-[15px] font-bold',
              scope.finish.late || scope.finish.notFinishing ? 'text-t-coral' : 'text-ink',
            )}
          >
            {finishText(scope, m.targetDate)}
          </span>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- park sütunu

function ParkColumn({
  items,
  milestone,
  className,
}: {
  items: ParkingItem[]
  milestone: Milestone | null
  className?: string
}) {
  const now = useNow(60_000)
  const resolve = useResolveParking()
  const restore = useRestoreParking()
  const { toast } = useToast()
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const target = milestone && milestone.doneAt === null ? milestone : null

  function act(item: ParkingItem, action: 'convert' | 'dismiss', index: number) {
    resolve.mutate(
      { id: item.id, action, milestoneId: action === 'convert' ? (target?.id ?? null) : null },
      {
        onSuccess: () => {
          rows.current[Math.min(index, items.length - 2)]?.focus()
          toast({
            message:
              action === 'convert'
                ? target
                  ? `${target.title} taşına görev oldu: ${item.text}`
                  : `Görev oldu: ${item.text}`
                : `Atıldı: ${item.text}`,
            domain: 'projects',
            action: { label: 'Geri al', onClick: () => restore.mutate(item.id) },
          })
        },
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
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
    <aside
      aria-label="Park alanı"
      className={cn('flex flex-col gap-3 rounded-tile bg-s2 px-5 pt-5 pb-5', className)}
    >
      <span className="cx text-ink2">Sonra · {items.length}</span>
      {items.length === 0 ? (
        <span className="text-[14px] text-ink3">
          Park alanı boş. Çalışırken aklına gelenleri <Kbd>P</Kbd> ile buraya at.
        </span>
      ) : (
        <>
          <span className="-mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink3">
            <Kbd>Enter</Kbd> {target ? 'bu taşa görev' : 'görev'} · <Kbd>Del</Kbd> at
          </span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {items.map((item, i) => (
              <li
                key={item.id}
                ref={(el) => {
                  rows.current[i] = el
                }}
                tabIndex={0}
                onKeyDown={(e) => onKeyDown(e, item, i)}
                className="flex flex-col gap-1.5 rounded-[18px] bg-bg px-4 pt-2.5 pb-2.5 focus-visible:outline-3 focus-visible:outline-indigo"
              >
                <span className="text-[15px] font-bold">{item.text}</span>
                <span className="flex items-center gap-1.5">
                  <span className="grow text-[13px] font-semibold text-ink3">
                    {formatAgo(item.createdAt, now)}
                  </span>
                  <Button
                    size="xs"
                    variant="secondary"
                    icon={target ? Plus : ListPlus}
                    onClick={() => act(item, 'convert', i)}
                  >
                    {target ? 'Bu taşa görev yap' : 'Göreve çevir'}
                  </Button>
                  <Button size="xs" variant="secondary" onClick={() => act(item, 'dismiss', i)}>
                    At
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}
