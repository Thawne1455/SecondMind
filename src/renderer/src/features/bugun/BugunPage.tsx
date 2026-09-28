import { useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Play, Plus, Repeat, X } from 'lucide-react'
import { TopBar } from '../../app/TopBar'
import { useShell } from '../../app/shell-context'
import {
  FAKE_BLOCKS,
  FAKE_FREE_MINUTES,
  FAKE_NOW,
  FAKE_NOW_TASK,
  FAKE_PINS,
  FAKE_TILES,
} from '../../lib/fake'
import { errorText } from '../../lib/errors'
import { formatDayName, formatMinutes, formatReminderAt } from '../../lib/format'
import { parseQuickEntry } from '../../lib/quickEntry'
import { useNow } from '../../lib/useNow'
import { Button, cn, IconButton, Scale, Tile, useToast, type ScaleValue } from '../../ui'
import type { BilgiLocationState } from '../bilgi/BilgiPage'
import { UNTITLED_IDEA, useIdeaDecision } from '../bilgi/ideas'
import { useCreateIdea, useIdeaToday } from '../bilgi/useKnowledge'
import { FlowBand } from './FlowBand'
import { TaskRow } from './TaskList'
import { useCreateTask, useReminders, useResolveMissed, useTasks } from './usePlanning'

// Bugün — "Şu an ne yapmalıyım?" Tasarım: bugun-acik.png. Aşama 3a'dan beri görevler (Sıradaki adımlar),
// hatırlatmalar ve kaçırılanlar gerçek; akış bandı ve Şimdi 3b'de, kalan karolar 3c'de gerçek veriye geçer.

// Bugün karoları tasarım sistemindekinden 2px daha sıkı (bugun.html: padding 16px 20px).
const TILE = 'py-4'

export function BugunPage() {
  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-6">
      <TopBar
        title={format(new Date(), 'EEEE d MMMM', { locale: tr })}
        status={<MissedReminders />}
      />
      <FlowBand
        blocks={FAKE_BLOCKS}
        pins={FAKE_PINS}
        now={FAKE_NOW}
        freeMinutes={FAKE_FREE_MINUTES}
      />
      <NowSection />
      <div className="grid grow grid-cols-3 grid-rows-[repeat(2,minmax(180px,1fr))] gap-4">
        <MoodTile />
        <RadarTile />
        <IncubationTile />
        <RemindersTile />
        <DecisionTile />
        <WeekTile />
      </div>
    </main>
  )
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

function NowSection() {
  const { project, title, minutesLeft } = FAKE_NOW_TASK
  return (
    <section className="flex items-end gap-10 px-1">
      <div className="flex min-w-0 grow flex-col gap-2.5">
        <span className="cx flex items-center gap-2.5 text-ink2">
          <span className="size-3 rounded-full" style={{ background: project.color }} />
          Şimdi · {project.name} · {minutesLeft} dk kaldı
        </span>
        <h2 className="x m-0 max-w-[860px] text-[64px] leading-[.95] font-black uppercase">
          {title}
        </h2>
        <div className="flex gap-2.5 pt-1.5">
          <Button size="lg" variant="action" icon={Play}>
            Başla
          </Button>
          <Button variant="secondary" className="h-12">
            Oturumu kapat
          </Button>
        </div>
      </div>

      <NextSteps />
    </section>
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

// Günlük kayıt yazımı Aşama 3'te; şimdilik seçim sadece ekranda.
function MoodTile() {
  const [mood, setMood] = useState<ScaleValue | null>(4)
  const [energy, setEnergy] = useState<ScaleValue | null>(null)
  return (
    <Tile variant="question" domain="mind" className={TILE}>
      <div className="flex items-baseline">
        <span className="cx grow text-[15px]">Nasılsın?</span>
        <span className="text-[13px] font-semibold text-[#3A3470]">Uyku {FAKE_TILES.sleep}</span>
      </div>
      <MoodRow label="Ruh hâli" value={mood} onChange={setMood} />
      <MoodRow label="Enerji" value={energy} onChange={setEnergy} />
    </Tile>
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

// Radar: 30 gündür açılmamış aktif fikir. Sessiz projeler Aşama 5'te (tarama) eklenir.
function RadarTile() {
  const radar = useIdeaToday().data?.radar
  const openIdea = useOpenIdea()
  const decide = useIdeaDecision()

  if (!radar) {
    return (
      <Tile variant="standard" className={TILE} eyebrow="Radar">
        <span className="font-bold">Sessiz kalan fikir yok.</span>
        <span className="text-[14px] text-ink2">
          30 gündür açmadığın bir fikir olursa burada çıkar.
        </span>
      </Tile>
    )
  }
  const title = radar.title || UNTITLED_IDEA
  return (
    <Tile
      variant="alert"
      className={TILE}
      actions={[
        <Button key="open" size="sm" variant="onTile" onClick={() => openIdea(radar.noteId)}>
          Aç
        </Button>,
        <Button
          key="archive"
          size="sm"
          variant="onTileGhost"
          onClick={() => decide({ noteId: radar.noteId, title, status: 'active' }, 'archived')}
        >
          Arşivle
        </Button>,
      ]}
    >
      <div className="flex items-end gap-2.5">
        <span className="x text-[48px] leading-[.9] font-black">{radar.days}</span>
        <span className="cx pb-[5px] text-[15px]">gün sessiz</span>
      </div>
      <span className="line-clamp-2 font-bold">{title}</span>
      <span className="text-[14px]">Bu fikri {radar.days} gündür açmadın.</span>
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

function DecisionTile() {
  const { ago, decision, expectation } = FAKE_TILES.decision
  return (
    <Tile variant="question" fill="#BDB3FF" className={TILE} eyebrow={`${ago} karar verdin`}>
      <span className="leading-[1.4] font-semibold">
        <span className="font-extrabold">{decision}</span> Beklenti: {expectation}
      </span>
      {/* Üç cevap seçeneği tek sorunun cevabı; karo eylemi değil. */}
      <div className="mt-auto flex items-center gap-1.5">
        <span className="grow text-[14px] font-bold">Beklediğin gibi oldu mu?</span>
        <Button size="sm" variant="onTile">
          Evet
        </Button>
        <Button size="sm" variant="onTileGhost">
          Kısmen
        </Button>
        <Button size="sm" variant="onTileGhost">
          Hayır
        </Button>
      </div>
    </Tile>
  )
}

function WeekTile() {
  return (
    <Tile variant="question" domain="dump" className={TILE}>
      <div className="flex items-baseline">
        <span className="cx grow">Bu hafta başardıkların</span>
        <Link to="/zihin" className="text-[14px] font-extrabold text-fill-ink underline">
          Başarılar →
        </Link>
      </div>
      <div className="flex grow items-end gap-7">
        {FAKE_TILES.week.map((s) => (
          <span key={s.label} className="flex flex-col">
            <span className="x text-[56px] leading-none font-black">{s.value}</span>
            <span className="font-bold">{s.label}</span>
          </span>
        ))}
      </div>
    </Tile>
  )
}
