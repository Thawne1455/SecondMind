import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Play } from 'lucide-react'
import { TopBar } from '../../app/TopBar'
import {
  FAKE_BLOCKS,
  FAKE_COUNTS,
  FAKE_FREE_MINUTES,
  FAKE_NEXT_STEPS,
  FAKE_NOW,
  FAKE_NOW_TASK,
  FAKE_PINS,
  FAKE_REMINDERS,
  FAKE_TILES,
} from '../../lib/fake'
import { errorText } from '../../lib/errors'
import { Button, cn, Scale, Tile, useToast, type ScaleValue } from '../../ui'
import type { BilgiLocationState } from '../bilgi/BilgiPage'
import { UNTITLED_IDEA, useIdeaDecision } from '../bilgi/ideas'
import { useCreateIdea, useIdeaToday } from '../bilgi/useKnowledge'
import { FlowBand } from './FlowBand'

// Bugün — "Şu an ne yapmalıyım?" Aşama 1b: sahte veriyle, tasarımla birebir (bugun-acik.png).

// Bugün karoları tasarım sistemindekinden 2px daha sıkı (bugun.html: padding 16px 20px).
const TILE = 'py-4'

export function BugunPage() {
  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-6">
      <TopBar
        title={format(new Date(), 'EEEE d MMMM', { locale: tr })}
        status={<MissedReminders count={FAKE_COUNTS.missedReminders} />}
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

function MissedReminders({ count }: { count: number }) {
  return (
    <span className="ml-1.5 flex h-[34px] items-center gap-2 rounded-full bg-coral pr-1.5 pl-3.5 text-[14px] font-bold text-white [--ot-ghost-bg:rgba(255,255,255,.2)] [--ot-ghost-fg:#FFFFFF]">
      {count} hatırlatma kaçtı
      <Button size="xs" variant="onTileGhost">
        Bugüne al
      </Button>
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

      <div className="flex w-[330px] shrink-0 flex-col gap-2 pb-0.5">
        <span className="cx text-ink2">Sıradaki adımlar</span>
        {FAKE_NEXT_STEPS.map((step) => (
          <div
            key={step.id}
            className="flex items-center gap-2.5 rounded-[18px] bg-s2 py-2.5 pr-2.5 pl-3.5"
          >
            <span className="size-2.5 rounded" style={{ background: step.project.color }} />
            <span className="flex grow flex-col leading-[1.3]">
              <span className="text-[13px] font-semibold text-ink3">{step.project.name}</span>
              <span className="font-bold">{step.title}</span>
            </span>
            <Button size="sm">Başla</Button>
          </div>
        ))}
      </div>
    </section>
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

function RemindersTile() {
  return (
    <Tile variant="standard" className={TILE} eyebrow="Hatırlatmalar">
      <div className="flex flex-col gap-1.5">
        {FAKE_REMINDERS.map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <span
              className={cn(
                'x flex h-[26px] w-[92px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold',
                r.today ? 'bg-amber text-fill-ink' : 'bg-s3',
              )}
            >
              {r.when}
            </span>
            <span className="font-semibold">{r.title}</span>
          </div>
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
