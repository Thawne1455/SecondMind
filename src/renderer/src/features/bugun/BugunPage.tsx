import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Plus, Repeat, X } from 'lucide-react'
import type { AttendanceQuestion, ScheduleBlock, WeekAchievements } from '@shared/ipc'
import { TopBar } from '../../app/TopBar'
import { useShell } from '../../app/shell-context'
import { errorText } from '../../lib/errors'
import { formatDayName, formatMinutes, formatReminderAt } from '../../lib/format'
import { parseQuickEntry } from '../../lib/quickEntry'
import { formatSleep, parseSleep } from '../../lib/sleep'
import { tileSpans } from '../../lib/tiles'
import { useNow } from '../../lib/useNow'
import { Button, cn, IconButton, Scale, Tile, useToast, type ScaleValue } from '../../ui'
import type { BilgiLocationState } from '../bilgi/BilgiPage'
import { UNTITLED_IDEA, useIdeaDecision } from '../bilgi/ideas'
import { useCreateIdea, useIdeaToday } from '../bilgi/useKnowledge'
import { useProjects, useUpdateProject } from '../projeler/useProjects'
import { useAttendanceQuestions, useSchoolWrite } from '../okul/useSchool'
import { useSetCheckin, useTodayCheckin, useWeekAchievements } from '../zihin/useMind'
import { FlowBand, type FlowPin } from './FlowBand'
import { NowSection } from './NowSection'
import { PostponeDialog } from './PostponeDialog'
import { pickRadar, type RadarPick } from './radar'
import { TaskRow } from './TaskList'
import {
  useCreateTask,
  useMoveBlock,
  useReminders,
  useReschedule,
  useResolveMissed,
  useSchedule,
  useTasks,
  useUnpinBlock,
} from './usePlanning'

// Bugün — "Şu an ne yapmalıyım?" Tasarım: bugun-acik.png. Aşama 3a'dan beri görevler (Sıradaki adımlar),
// hatırlatmalar ve kaçırılanlar, 3b'den beri akış bandı ve Şimdi, 3c'den beri Nasılsın? ve başarılar gerçek.
// Karar gözden geçirme karosu Aşama 7'ye (kararlar) kadar yok.

// Bugün karoları tasarım sistemindekinden 2px daha sıkı (bugun.html: padding 16px 20px).
const TILE = 'py-4'

export function BugunPage() {
  const now = useNow(30_000)
  const nowMin = minuteOfDay(new Date(now))
  const day = useSchedule().data
  const openTasks = useTasks('open').data ?? []
  const doneTasks = useTasks('done').data ?? []
  const pins = useTodayPins(now)
  const { openTask } = useShell()
  const move = useMoveBlock()
  const unpin = useUnpinBlock()
  const reschedule = useReschedule()
  const { toast } = useToast()
  const [asking, setAsking] = useState<ScheduleBlock | null>(null)
  const navigate = useNavigate()
  const studyStatus = useSchoolWrite('study:setStatus')
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })

  // Okul blokları: ders dersi açar; çalışma bloğu yapıldı / yapılmadı (geri alınabilir).
  function onSchool(block: ScheduleBlock) {
    if (block.kind === 'class') {
      if (block.courseId) void navigate(`/okul/ders/${block.courseId}`)
      return
    }
    const status = block.done ? 'planned' : 'done'
    studyStatus.mutate(
      { id: block.sourceId, status },
      {
        onSuccess: () =>
          toast({
            message: status === 'done' ? `${block.detail} çalışıldı.` : `${block.detail} yapılmadı olarak işaretlendi.`,
            domain: 'school',
            action: {
              label: 'Geri al',
              onClick: () =>
                studyStatus.mutate({ id: block.sourceId, status: status === 'done' ? 'planned' : 'done' }),
            },
          }),
        onError,
      },
    )
  }

  // Blok tıklaması: 3. ertelemeye ulaşmış ve henüz sabitlenmemiş görev sorar, diğerleri görevi açar.
  function openBlock(block: ScheduleBlock) {
    if (block.kind !== 'task') return
    if (!block.done && !block.pinned && block.postponeCount >= POSTPONE_ASK_AT) {
      setAsking(block)
      return
    }
    const task = [...openTasks, ...doneTasks].find((t) => t.id === block.sourceId)
    if (task) openTask(task)
  }

  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-6">
      <TopBar
        title={format(new Date(now), 'EEEE d MMMM', { locale: tr })}
        status={<MissedReminders />}
      />
      <FlowBand
        day={day}
        pins={pins}
        nowMin={nowMin}
        onMove={(id, start) => move.mutate({ id, start }, { onError })}
        onUnpin={(id) => unpin.mutate(id, { onError })}
        onOpen={openBlock}
        onReschedule={() => reschedule.mutate(undefined, { onError })}
        rescheduling={reschedule.isPending}
        onShowUnplaced={() => openTask()}
        onSchool={onSchool}
      />
      <NowSection day={day} nowMin={nowMin} openTasks={openTasks} aside={<NextSteps />} />
      <PostponeDialog block={asking} onClose={() => setAsking(null)} />
      <TodayTiles />
    </main>
  )
}

// Erteleme sorusu eşiği: main/domain/tasks.POSTPONE_ASK_AT ile aynı.
const POSTPONE_ASK_AT = 3

const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()

/** Bantın üst şeridi: bugün 08–24 arasında çalacak (kaçırılmamış) hatırlatmalar. */
function useTodayPins(now: number): FlowPin[] {
  const reminders = useReminders().data ?? []
  const end = new Date(now).setHours(24, 0, 0, 0)
  return reminders
    .filter((r) => r.missedAt === null && r.at >= now && r.at < end)
    .map((r) => ({ id: r.id, min: minuteOfDay(new Date(r.at)), title: r.title }))
    .filter((p) => p.min >= 8 * 60)
}

/** Uygulama kapalıyken (ya da uykudayken) geçen hatırlatmalar. Bugüne al: her biri bugünkü görev olur. */
function MissedReminders() {
  const missed = (useReminders().data ?? []).filter((r) => r.missedAt !== null)
  const resolve = useResolveMissed()
  const { toast } = useToast()
  const now = useNow(60_000)
  if (!missed.length) return null

  const ids = missed.map((r) => r.id)
  const list = missed.map((r) => `${formatReminderAt(r.missedAt!, now)} · ${r.title}`).join('\n')
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })

  return (
    <span
      title={list}
      className="ml-1.5 flex h-[34px] items-center gap-1.5 rounded-full bg-coral pr-1 pl-3.5 text-[14px] font-bold text-white [--ot-ghost-bg:rgba(255,255,255,.2)] [--ot-ghost-fg:#FFFFFF]"
    >
      <span className="pr-0.5">
        {missed.length === 1 ? `Kaçtı: ${missed[0]!.title}` : `${missed.length} hatırlatma kaçtı`}
      </span>
      <Button
        size="xs"
        variant="onTileGhost"
        loading={resolve.isPending}
        onClick={() =>
          resolve.mutate(
            { ids, action: 'today' },
            {
              onSuccess: ({ taskIds }) =>
                toast({
                  variant: 'fill',
                  domain: 'today',
                  message: `${taskIds.length} görev bugüne eklendi.`,
                }),
              onError,
            },
          )
        }
      >
        Bugüne al
      </Button>
      <IconButton
        label="Kapat"
        icon={X}
        variant="onTileGhost"
        className="size-[26px]"
        onClick={() => resolve.mutate({ ids, action: 'dismiss' }, { onError })}
      />
    </span>
  )
}

const NEXT_STEPS_MAX = 3

/** Sıradaki adımlar: açık görevler (bugünkü önce, domain/tasks sırası) + hızlı görev satırı. */
function NextSteps() {
  const { openTask } = useShell()
  const tasks = useTasks('open').data ?? []

  return (
    <div className="flex w-[360px] shrink-0 flex-col gap-2 pb-0.5">
      <div className="flex items-baseline">
        <span className="cx grow text-ink2">Sıradaki adımlar</span>
        {tasks.length > NEXT_STEPS_MAX && (
          <button
            type="button"
            onClick={() => openTask()}
            className="cursor-pointer text-[13px] font-extrabold underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo"
          >
            Tümü · {tasks.length}
          </button>
        )}
      </div>
      {tasks.slice(0, NEXT_STEPS_MAX).map((t) => (
        <TaskRow key={t.id} task={t} onEdit={(task) => openTask(task)} />
      ))}
      <QuickTask />
    </div>
  )
}

/**
 * Tek satırda görev: Enter ekler. Gün yazılmazsa bugüne; "yarın", "cuma", "45dk", "!", "son 5 ekim"
 * tanınır. Ayrıntı için Ctrl G.
 */
function QuickTask() {
  const [text, setText] = useState('')
  const create = useCreateTask()
  const { toast } = useToast()

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') setText('')
    if (e.key !== 'Enter' || create.isPending) return
    e.preventDefault()
    const now = new Date()
    const p = parseQuickEntry(text, now)
    if (!p.title) return
    const planned = p.date ?? format(now, 'yyyy-MM-dd')
    create.mutate(
      {
        title: p.title,
        plannedDate: planned,
        dueDate: p.dueDate,
        estimateMin: p.estimateMin,
        priority: p.priority ?? 2,
      },
      {
        onSuccess: () => {
          setText('')
          const details = [
            formatDayName(new Date(`${planned}T00:00`), now),
            p.estimateMin && formatMinutes(p.estimateMin),
            p.dueDate && `son ${formatDayName(new Date(`${p.dueDate}T00:00`), now)}`,
            p.priority && 'yüksek öncelik',
          ].filter(Boolean)
          toast({
            variant: 'fill',
            domain: 'today',
            message: `${p.title} · ${details.join(' · ')}`,
          })
        },
        onError: (err) => toast({ message: errorText(err), domain: 'warning' }),
      },
    )
  }

  return (
    <label className="flex h-11 items-center gap-2 rounded-full border-2 border-dashed border-s3 px-3.5 focus-within:border-solid focus-within:border-ink">
      <Plus size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink3" />
      <input
        value={text}
        maxLength={300}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Hızlı görev"
        placeholder="Görev ekle… (yarın, 45dk, !)"
        className="min-w-0 grow bg-transparent text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-ink3"
      />
    </label>
  )
}

function MoodRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: ScaleValue | null
  onChange: (v: ScaleValue) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 text-[13px] font-bold">{label}</span>
      <Scale
        label={label}
        value={value}
        onChange={onChange}
        domain="mind"
        className="grow bg-transparent p-0"
      />
    </div>
  )
}

/**
 * Karolar 3 × 2. İçeriği olmayan karo gizlenir (sessiz fikir ya da proje yoksa Radar, bu hafta biten görev yoksa
 * başarılar), kalanlar satırlara dengeli yayılır.
 */
function TodayTiles() {
  const radar = pickRadar(useIdeaToday().data?.radar, useProjects().data ?? [])
  const week = useWeekAchievements().data
  const questions = useAttendanceQuestions().data ?? []
  const tiles: Array<{ key: string; el: ReactNode }> = [
    { key: 'mood', el: <MoodTile /> },
    ...(radar ? [{ key: 'radar', el: <RadarTile radar={radar} /> }] : []),
    { key: 'incubation', el: <IncubationTile /> },
    { key: 'reminders', el: <RemindersTile /> },
    ...(week && (week.tasksWeek > 0 || week.submittedWeek > 0)
      ? [{ key: 'week', el: <WeekTile week={week} /> }]
      : []),
    ...(questions.length ? [{ key: 'attendance', el: <AttendanceTile questions={questions} /> }] : []),
  ]
  const spans = tileSpans(tiles.length)
  return (
    <div
      className="grid grow grid-cols-6 gap-4"
      style={{ gridTemplateRows: `repeat(${Math.ceil(tiles.length / 3)}, minmax(180px, 1fr))` }}
    >
      {tiles.map((t, i) => (
        <div key={t.key} className="grid" style={{ gridColumn: `span ${spans[i]}` }}>
          {t.el}
        </div>
      ))}
    </div>
  )
}

/** Günlük kayıt: her seçim hemen yazılır (gün başına tek kayıt). Günlük ve not Zihin'de (Aşama 7). */
function MoodTile() {
  const checkin = useTodayCheckin().data
  const set = useSetCheckin()
  const { toast } = useToast()
  const save = (input: Parameters<typeof set.mutate>[0]) =>
    set.mutate(input, { onError: (e) => toast({ message: errorText(e), domain: 'warning' }) })

  return (
    <Tile variant="question" domain="mind" className={TILE}>
      <div className="flex items-baseline">
        <span className="cx grow text-[15px]">Nasılsın?</span>
        <SleepField value={checkin?.sleepMin ?? null} onSave={(sleepMin) => save({ sleepMin })} />
      </div>
      <MoodRow
        label="Ruh hâli"
        value={(checkin?.mood ?? null) as ScaleValue | null}
        onChange={(mood) => save({ mood })}
      />
      <MoodRow
        label="Enerji"
        value={(checkin?.energy ?? null) as ScaleValue | null}
        onChange={(energy) => save({ energy })}
      />
    </Tile>
  )
}

/**
 * "Uyku 7:15": tıklayınca yazılır. "7", "7:15", "7,5", "6 sa 40" anlaşılır; Enter ya da odak kaybı kaydeder,
 * Esc vazgeçer, boş bırakmak siler.
 */
function SleepField({
  value,
  onSave,
}: {
  value: number | null
  onSave: (sleepMin: number | null) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const { toast } = useToast()
  const style = 'text-[13px] font-semibold text-[#3A3470]'

  function commit() {
    if (draft === null) return
    const parsed = parseSleep(draft)
    setDraft(null)
    if (parsed === undefined) {
      toast({ message: 'Uyku anlaşılmadı. "7:15" ya da "7,5" gibi yaz.', domain: 'warning' })
      return
    }
    if (parsed !== value) onSave(parsed)
  }

  if (draft !== null) {
    return (
      <label className={cn('flex items-baseline gap-1.5', style)}>
        Uyku
        <input
          ref={(el) => el?.focus()}
          value={draft}
          maxLength={12}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              e.stopPropagation()
              setDraft(null)
            }
          }}
          placeholder="7:30"
          aria-label="Uyku süresi"
          className="x w-[64px] rounded-full bg-white/60 px-2 text-fill-ink outline-none placeholder:text-[#3A3470]/60 focus-visible:outline-2 focus-visible:outline-[#3A3470]"
        />
      </label>
    )
  }
  return (
    <button
      type="button"
      title="Uykunu yaz"
      onClick={() => setDraft(value === null ? '' : formatSleep(value))}
      className={cn(
        style,
        'cursor-pointer rounded-full hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
      )}
    >
      {value === null ? 'Uyku ?' : `Uyku ${formatSleep(value)}`}
    </button>
  )
}

/** Fikri Bilgi'de, Fikirler görünümünde açar. */
function useOpenIdea() {
  const navigate = useNavigate()
  return (noteId: string) =>
    void navigate(`/bilgi/${noteId}`, {
      state: { scope: { kind: 'ideas' } } satisfies BilgiLocationState,
    })
}

// Radar: 30 gündür açılmamış aktif fikir ya da 14 gündür dokunulmamış aktif proje (en uzun sessiz olan).
function RadarTile({ radar }: { radar: RadarPick }) {
  return radar.kind === 'project' ? <ProjectRadar radar={radar} /> : <IdeaRadar radar={radar} />
}

function SilentDays({ days }: { days: number }) {
  return (
    <div className="flex items-end gap-2.5">
      <span className="x text-[48px] leading-[.9] font-black">{days}</span>
      <span className="cx pb-[5px] text-[15px]">gün sessiz</span>
    </div>
  )
}

function IdeaRadar({ radar }: { radar: Extract<RadarPick, { kind: 'idea' }> }) {
  const openIdea = useOpenIdea()
  const decide = useIdeaDecision()
  const title = radar.idea.title || UNTITLED_IDEA
  return (
    <Tile
      variant="alert"
      className={TILE}
      actions={[
        <Button key="open" size="sm" variant="onTile" onClick={() => openIdea(radar.idea.noteId)}>
          Aç
        </Button>,
        <Button
          key="archive"
          size="sm"
          variant="onTileGhost"
          onClick={() => decide({ noteId: radar.idea.noteId, title, status: 'active' }, 'archived')}
        >
          Arşivle
        </Button>,
      ]}
    >
      <SilentDays days={radar.days} />
      <span className="line-clamp-2 font-bold">{title}</span>
      <span className="text-[14px]">Bu fikri {radar.days} gündür açmadın.</span>
    </Tile>
  )
}

/** Sessiz proje: Aç ya da Duraklat (bilerek bekletiyorsan radardan çıkar; geri alınabilir). */
function ProjectRadar({ radar }: { radar: Extract<RadarPick, { kind: 'project' }> }) {
  const navigate = useNavigate()
  const update = useUpdateProject()
  const { toast } = useToast()
  const p = radar.project
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  return (
    <Tile
      variant="alert"
      className={TILE}
      actions={[
        <Button
          key="open"
          size="sm"
          variant="onTile"
          onClick={() => void navigate(`/projeler/${p.id}`)}
        >
          Aç
        </Button>,
        <Button
          key="pause"
          size="sm"
          variant="onTileGhost"
          onClick={() =>
            update.mutate(
              { id: p.id, status: 'paused' },
              {
                onSuccess: () =>
                  toast({
                    message: `${p.name} duraklatıldı.`,
                    domain: 'projects',
                    action: {
                      label: 'Geri al',
                      onClick: () => update.mutate({ id: p.id, status: 'active' }, { onError }),
                    },
                  }),
                onError,
              },
            )
          }
        >
          Duraklat
        </Button>,
      ]}
    >
      <SilentDays days={radar.days} />
      <span className="flex items-center gap-2 font-bold">
        <span className="size-3 shrink-0 rounded" style={{ backgroundColor: p.color }} />
        <span className="line-clamp-1">{p.name}</span>
      </span>
      <span className="text-[14px]">Bu projeye {radar.days} gündür dokunmadın.</span>
    </Tile>
  )
}

function IncubationTile() {
  const data = useIdeaToday().data
  const openIdea = useOpenIdea()
  const decide = useIdeaDecision()
  const create = useCreateIdea()
  const { toast } = useToast()

  const titleButton = (noteId: string, text: string) => (
    <button
      type="button"
      onClick={() => openIdea(noteId)}
      className="line-clamp-2 cursor-pointer text-left hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo"
    >
      {text || UNTITLED_IDEA}
    </button>
  )

  if (data?.due) {
    const { due, dueCount } = data
    const target = { noteId: due.noteId, title: due.title, status: 'incubating' as const }
    const waiting = due.days > 0 ? ` · ${due.days} gündür bekliyor` : ''
    return (
      <Tile
        variant="question"
        domain="projects"
        className={TILE}
        titleClassName="text-[20px] leading-[1.2]"
        eyebrow={`Kuluçka doldu${waiting}${dueCount > 1 ? ` · +${dueCount - 1}` : ''}`}
        title={titleButton(due.noteId, due.title)}
        actions={[
          <Button key="yes" size="sm" variant="onTile" onClick={() => decide(target, 'active')}>
            Evet
          </Button>,
          <Button
            key="no"
            size="sm"
            variant="onTileGhost"
            onClick={() => decide(target, 'archived')}
          >
            Hayır
          </Button>,
        ]}
      >
        <span className="font-semibold text-[#0B3D24]">Hâlâ heyecanlandırıyor mu?</span>
      </Tile>
    )
  }

  const next = data?.next
  return (
    <Tile
      variant="question"
      domain="projects"
      className={TILE}
      titleClassName="text-[20px] leading-[1.2]"
      eyebrow="Kuluçka"
      title={next ? titleButton(next.noteId, next.title) : 'Kuluçkada fikir yok'}
      actions={[
        <Button
          key="new"
          size="sm"
          variant="onTileGhost"
          loading={create.isPending}
          onClick={() =>
            create.mutate(undefined, {
              onSuccess: (note) => openIdea(note.id),
              onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
            })
          }
        >
          Fikir yaz
        </Button>,
      ]}
    >
      <span className="font-semibold text-[#0B3D24]">
        {next
          ? `${next.days} gün sonra soracağım: hâlâ heyecanlandırıyor mu?`
          : 'Aklına geleni yaz; 14 gün bekler, sonra karar verirsin.'}
      </span>
    </Tile>
  )
}

const REMINDERS_SHOWN = 3

/** Sıradaki hatırlatmalar; satıra tıklayınca düzenlenir. Kaçırılanlar üst çubuktaki rozette. */
function RemindersTile() {
  const { openReminder } = useShell()
  const now = useNow(60_000)
  const all = useReminders().data ?? []
  const upcoming = all.filter((r) => r.at > now)
  const todayEnd = new Date(now).setHours(24, 0, 0, 0)

  return (
    <Tile
      variant="standard"
      className={TILE}
      eyebrow="Hatırlatmalar"
      // İkisi de aynı çalışma alanını açar (solda tümü, sağda yeni); "Tümü" sadece gizlenen varsa.
      actions={[
        <Button key="add" size="sm" icon={Plus} onClick={() => openReminder()}>
          Ekle
        </Button>,
        upcoming.length > REMINDERS_SHOWN ? (
          <Button
            key="all"
            size="sm"
            variant="secondary"
            className="[--btn-soft:var(--bg)]"
            onClick={() => openReminder()}
          >
            Tümü · {upcoming.length}
          </Button>
        ) : undefined,
      ]}
    >
      {!upcoming.length && (
        <span className="text-[14px] text-ink2">
          Yaklaşan hatırlatma yok. Ctrl H ile her ekrandan kurabilirsin: “yarın 10:00 kitabı iade
          et”.
        </span>
      )}
      <div className="flex flex-col gap-1.5">
        {upcoming.slice(0, REMINDERS_SHOWN).map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => openReminder(r)}
            className="flex cursor-pointer items-center gap-3 rounded-full text-left hover:bg-s3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo"
          >
            <span
              className={cn(
                'x flex h-[26px] w-[92px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold',
                r.at < todayEnd ? 'bg-amber text-fill-ink' : 'bg-s3',
              )}
            >
              {formatReminderAt(r.at, now)}
            </span>
            <span className="min-w-0 truncate font-semibold">{r.title}</span>
            {r.rule && (
              <Repeat
                size={14}
                strokeWidth={1.75}
                aria-label="Tekrarlıyor"
                className="shrink-0 text-ink3"
              />
            )}
          </button>
        ))}
      </div>
    </Tile>
  )
}

/** Bu hafta ve bugün biten görevler. Commit Aşama 5'te, quiz Aşama 6'da eklenir. */
function WeekTile({ week }: { week: WeekAchievements }) {
  const stats = [
    { value: week.tasksWeek, label: 'görev' },
    { value: week.tasksToday, label: 'bugün' },
    ...(week.submittedWeek ? [{ value: week.submittedWeek, label: 'ödev' }] : []),
  ]
  return (
    <Tile variant="question" domain="dump" className={TILE}>
      <div className="flex items-baseline">
        <span className="cx grow">Bu hafta başardıkların</span>
        <Link to="/zihin" className="text-[14px] font-extrabold text-fill-ink underline">
          Başarılar →
        </Link>
      </div>
      <div className="flex grow items-end gap-7">
        {stats.map((s) => (
          <span key={s.label} className="flex flex-col">
            <span className="x text-[56px] leading-none font-black">{s.value}</span>
            <span className="font-bold">{s.label}</span>
          </span>
        ))}
      </div>
    </Tile>
  )
}

/**
 * "Derse katıldın mı?" (OKUL.md Devamsızlık): bugün biten, yoklaması girilmemiş ders. Tek tık cevap
 * devamsızlığa yazılır; birden çoksa sırayla sorulur.
 */
function AttendanceTile({ questions }: { questions: AttendanceQuestion[] }) {
  const set = useSchoolWrite('attendance:set')
  const { toast } = useToast()
  const q = questions[0]!
  const answer = (status: 'present' | 'absent') =>
    set.mutate(
      { slotId: q.slotId, day: q.day, status },
      {
        onSuccess: () =>
          toast({
            message: status === 'present' ? `${q.name}: katıldın.` : `${q.name}: devamsızlığa yazıldı.`,
            domain: 'school',
            action: {
              label: 'Geri al',
              onClick: () => set.mutate({ slotId: q.slotId, day: q.day, status: null }),
            },
          }),
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
    )
  return (
    <Tile
      variant="question"
      fill={q.tone}
      className={TILE}
      eyebrow={
        <>
          Ders bitti · {formatClockRange(q.startMin, q.endMin)}
          {questions.length > 1 && <span className="opacity-70"> · +{questions.length - 1} ders</span>}
        </>
      }
      title={`${q.name} dersine katıldın mı?`}
      actions={[
        <Button key="yes" size="sm" variant="onTile" loading={set.isPending} onClick={() => answer('present')}>
          Katıldım
        </Button>,
        <Button key="no" size="sm" variant="onTileGhost" onClick={() => answer('absent')}>
          Katılmadım
        </Button>,
      ]}
    />
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const formatClockRange = (a: number, b: number) =>
  `${pad(Math.floor(a / 60))}:${pad(a % 60)}–${pad(Math.floor(b / 60))}:${pad(b % 60)}`
