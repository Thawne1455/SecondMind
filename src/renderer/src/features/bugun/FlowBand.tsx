import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { Check, Pin } from 'lucide-react'
import type { ScheduleBlock, ScheduleDay } from '@shared/ipc'
import {
  blockTiming,
  DAY_END,
  DAY_START,
  formatClock,
  formatDuration,
  hourTicks,
  timeToPercent,
  type BlockTiming,
} from '../../lib/flow'
import { Button, cn, ON_BAND } from '../../ui'
import { useProjectMap } from '../projeler/useProjects'

// Bant içi sabit renkler: bant her iki temada da koyu, üstündeki yazılar da sabit.
const MUTED = '#A5A5B4'
const SOFT = '#C8C8D4'
const NOW = '#FF5A45'
/** Projesiz (genel) görev: nötr açık blok; proje görevi proje renginde. */
const TASK_FILL = '#E4E4EC'
const ROUTINE_FILL = '#55555F'
/** Bundan kısa boşluk kesikli blok olarak çizilmez (sadece toplamda sayılır). */
const FREE_BLOCK_MIN = 60
/** Sürükleme 5 dk adımla; klavyede ← → 15 dk, Shift ile 5 dk. */
const SNAP = 5
const KEY_STEP = 15

export type FlowPin = { id: string; min: number; title: string }

type FlowBandProps = {
  day: ScheduleDay | undefined
  pins: FlowPin[]
  /** Günün dakikası. */
  nowMin: number
  onMove: (id: string, start: number) => void
  onUnpin: (id: string) => void
  onOpen: (block: ScheduleBlock) => void
  onReschedule: () => void
  rescheduling: boolean
  onShowUnplaced: () => void
  /** Ders bloğu dersi açar; çalışma bloğu yapıldı / yapılmadı arasında geçer. */
  onSchool: (block: ScheduleBlock) => void
}

/** Günün akışı, 08–24 tek satır: üst şerit hatırlatma pinleri, alt şerit bloklar, mercan "şimdi" çizgisi. */
export function FlowBand({
  day,
  pins,
  nowMin,
  onMove,
  onUnpin,
  onOpen,
  onReschedule,
  rescheduling,
  onShowUnplaced,
  onSchool,
}: FlowBandProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const nowPct = timeToPercent(nowMin)
  const minutesPerPx = () =>
    (DAY_END - DAY_START) / (trackRef.current?.getBoundingClientRect().width || 1)
  const unplaced = day?.unplaced ?? []
  const projects = useProjectMap()

  return (
    <section
      aria-label="Günün akışı, 08:00 ile 24:00 arası"
      className="relative h-[164px] shrink-0 rounded-tile bg-band text-white"
    >
      <div ref={trackRef} className="absolute inset-y-0 right-6 left-6">
        {/* Saat etiketleri ve dikey çizgiler */}
        <div
          className="x absolute inset-x-0 top-3 h-[18px] text-[13px] leading-[18px] font-bold"
          style={{ color: MUTED }}
        >
          {hourTicks().map((h, i, all) => (
            <span
              key={h}
              className="absolute"
              style={i === all.length - 1 ? { right: 0 } : { left: `${timeToPercent(h * 60)}%` }}
            >
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
        {hourTicks().map((h, i, all) => (
          <div
            key={h}
            className="absolute top-[34px] bottom-[30px] w-px bg-white/8"
            style={i === all.length - 1 ? { right: 0 } : { left: `${timeToPercent(h * 60)}%` }}
          />
        ))}

        {pins.map((pin, i) => (
          <div
            key={pin.id}
            title={`${formatClock(pin.min)} · ${pin.title}`}
            className="absolute top-[38px] flex h-[26px] max-w-[260px] items-center gap-1.5 rounded-full bg-amber pr-2.5 pl-1 text-[13px] font-bold whitespace-nowrap text-fill-ink"
            style={{ left: `${timeToPercent(pin.min)}%`, maxWidth: pinMaxWidth(pins, i) }}
          >
            <span className="x flex h-[18px] shrink-0 items-center rounded-full bg-fill-ink px-1.5 text-white">
              {formatClock(pin.min)}
            </span>
            <span className="truncate">{pin.title}</span>
          </div>
        ))}

        {day?.freeGaps
          .filter((g) => g.end - Math.max(g.start, nowMin) >= FREE_BLOCK_MIN)
          .map((g) => (
            <FreeBlock key={g.start} start={Math.max(g.start, nowMin)} end={g.end} />
          ))}

        {day?.blocks.map((block) =>
          block.kind === 'routine' ? (
            <RoutineBlock key={block.id} block={block} timing={timingOf(block, nowMin)} />
          ) : block.kind === 'class' || block.kind === 'study' ? (
            <SchoolBlock key={block.id} block={block} timing={timingOf(block, nowMin)} onClick={onSchool} />
          ) : (
            <TaskBlock
              key={block.id}
              block={block}
              fill={(block.projectId && projects.get(block.projectId)?.color) || TASK_FILL}
              timing={timingOf(block, nowMin)}
              minutesPerPx={minutesPerPx}
              onMove={onMove}
              onUnpin={onUnpin}
              onOpen={onOpen}
            />
          ),
        )}

        {/* Şimdi çizgisi ve saat etiketi */}
        <div
          className="pointer-events-none absolute top-[34px] bottom-[26px] w-0.5"
          style={{ left: `${nowPct}%`, background: NOW }}
        />
        <div
          className="x absolute bottom-2 flex h-[22px] items-center rounded-full px-2 text-[13px] font-extrabold text-white"
          style={{ left: `calc(${nowPct}% - 24px)`, background: NOW }}
        >
          {formatClock(Math.min(nowMin, DAY_END))}
        </div>

        <div
          className={cn('absolute right-0 bottom-2 flex items-center gap-3 text-[13px]', ON_BAND)}
          style={{ color: MUTED }}
        >
          {unplaced.length > 0 && (
            <button
              type="button"
              title={unplaced.map((u) => u.title).join('\n')}
              onClick={onShowUnplaced}
              className="cursor-pointer font-bold text-[#FF8A7A] underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo"
            >
              {unplaced.length} görev sığmadı
            </button>
          )}
          {day && `${formatDuration(day.freeMinutes)} boş`}
          <Button
            size="xs"
            variant="onTileGhost"
            className="px-3"
            loading={rescheduling}
            onClick={onReschedule}
          >
            Yeniden yerleştir
          </Button>
        </div>
      </div>
    </section>
  )
}

/** Pin bir sonrakinin üstüne taşmaz: başlık kısalır, saat hep görünür. */
function pinMaxWidth(pins: FlowPin[], i: number): string | undefined {
  const next = pins.slice(i + 1).find((p) => p.min > pins[i]!.min)
  if (!next) return undefined
  return `max(64px, calc(${timeToPercent(next.min) - timeToPercent(pins[i]!.min)}% - 6px))`
}

const timingOf = (b: ScheduleBlock, nowMin: number): BlockTiming =>
  b.done && b.end <= nowMin ? 'past' : blockTiming(b.start, b.end, nowMin)

const position = (start: number, end: number): CSSProperties => {
  const left = timeToPercent(start)
  return { left: `${left}%`, width: `calc(${timeToPercent(end) - left}% - 4px)` }
}

const BASE =
  'absolute top-[72px] flex h-[60px] flex-col justify-center overflow-hidden rounded-block px-2.5 py-1.5 leading-[1.25] text-fill-ink'

function FreeBlock({ start, end }: { start: number; end: number }) {
  return (
    <div
      title={`Boş · ${formatClock(start)}–${formatClock(end)}`}
      className={cn(BASE, 'items-center border-[1.5px] border-dashed border-white/35')}
      style={{ ...position(start, end), color: SOFT }}
    >
      <span className="text-[13px] font-bold whitespace-nowrap">
        boş · {formatDuration(end - start)}
      </span>
    </div>
  )
}

/** Kısa gri blok; etiketi sağında, bloğun dışında. Sabit, sürüklenmez. */
function RoutineBlock({ block, timing }: { block: ScheduleBlock; timing: BlockTiming }) {
  return (
    <>
      <div
        title={`${block.title} · ${formatClock(block.start)}–${formatClock(block.end)}`}
        className={cn(BASE, 'p-0', timing === 'past' && 'opacity-72')}
        style={{ ...position(block.start, block.end), background: ROUTINE_FILL }}
      />
      <div
        className="pointer-events-none absolute top-[72px] flex h-[60px] items-center text-[13px] whitespace-nowrap"
        style={{ left: `calc(${timeToPercent(block.end)}% + 2px)`, color: SOFT }}
      >
        {block.title}
      </div>
    </>
  )
}

/**
 * Ders (dersin gök tonunda, sabit) ve sınav çalışma bloğu (gök çapraz çizgili). Sürüklenmez.
 * Ders: tıklayınca dersi açar; çalışma: tıklayınca yapıldı işaretlenir (tekrar tıklamak geri alır).
 */
function SchoolBlock({
  block,
  timing,
  onClick,
}: {
  block: ScheduleBlock
  timing: BlockTiming
  onClick: (block: ScheduleBlock) => void
}) {
  const tone = block.tone ?? '#7CC4FF'
  const range = `${formatClock(block.start)}–${formatClock(block.end)}`
  const study = block.kind === 'study'
  const label = study ? `${block.detail} · ${block.title}` : `${block.title}${block.detail ? ` · ${block.detail}` : ''}`
  const mark = block.attendance === 'present' ? ' · katıldın' : block.attendance === 'absent' ? ' · katılmadın' : ''
  return (
    <button
      type="button"
      title={`${label} · ${range}${mark}${study ? (block.done ? ' · yapıldı' : ' · tıkla: yapıldı') : ''}`}
      aria-label={`${label}, ${range}${block.done ? ', yapıldı' : ''}`}
      onClick={() => onClick(block)}
      className={cn(
        BASE,
        'cursor-pointer text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
        timing === 'past' && 'opacity-72',
      )}
      style={{
        ...position(block.start, block.end),
        ...(study
          ? {
              backgroundImage: `repeating-linear-gradient(135deg, ${tone} 0 7px, color-mix(in srgb, ${tone} 45%, #FFFFFF) 7px 14px)`,
            }
          : { background: tone }),
        boxShadow: timing === 'current' ? '0 0 0 3px #FFFFFF' : undefined,
      }}
    >
      <span className="flex min-w-0 items-center gap-1 text-[13px] font-extrabold">
        {block.done && <Check size={14} strokeWidth={2.5} aria-hidden className="shrink-0" />}
        <span className={cn('truncate', study && 'rounded bg-white/70 px-1', block.done && 'line-through')}>
          {study ? block.detail : block.title}
        </span>
      </span>
      <span className={cn('x truncate text-[13px]', study && 'self-start rounded bg-white/70 px-1')}>
        {study ? range : block.detail || range}
      </span>
    </button>
  )
}

type TaskBlockProps = {
  block: ScheduleBlock
  /** Proje rengi; genel görevde nötr. */
  fill: string
  timing: BlockTiming
  minutesPerPx: () => number
  onMove: (id: string, start: number) => void
  onUnpin: (id: string) => void
  onOpen: (block: ScheduleBlock) => void
}

/**
 * Görev bloğu: tıklayınca açılır, sürükleyince taşınır ve o gün sabitlenir (işaret görünür,
 * işarete tıklamak sabitliği kaldırır). Klavye: Enter açar, ← → 15 dk (Shift 5 dk) taşır.
 */
function TaskBlock({ block, fill, timing, minutesPerPx, onMove, onUnpin, onOpen }: TaskBlockProps) {
  const [drag, setDrag] = useState<{ x0: number; scale: number; delta: number } | null>(null)
  const draggable = !block.done
  const delta = drag?.delta ?? 0
  const start = block.start + delta
  const end = block.end + delta
  const range = `${formatClock(start)}–${formatClock(end)}`
  const asks = block.postponeCount >= 3 && !block.done

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    // Bitmiş blok taşınmaz (ölçek 0): basıp bırakmak sadece açar.
    setDrag({ x0: e.clientX, scale: draggable ? minutesPerPx() : 0, delta: 0 })
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return
    const raw = (e.clientX - drag.x0) * drag.scale
    const next = Math.round(raw / SNAP) * SNAP
    if (next !== drag.delta) setDrag({ ...drag, delta: next })
  }
  function onPointerUp() {
    // Basılmadan gelen bırakma (başka yerde başlayan tıklama) bir şey yapmaz.
    if (!drag) return
    setDrag(null)
    if (drag.delta === 0) onOpen(block)
    else onMove(block.id, block.start + drag.delta)
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(block)
      return
    }
    if (!draggable || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const step = (e.shiftKey ? SNAP : KEY_STEP) * (e.key === 'ArrowLeft' ? -1 : 1)
    onMove(block.id, block.start + step)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${block.title}, ${range}${block.pinned ? ', sabit' : ''}${block.done ? ', bitti' : ''}`}
        title={`${block.title} · ${range}${block.pinned ? ' · sabit' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={onKeyDown}
        className={cn(
          BASE,
          'touch-none select-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
          timing === 'past' && !drag && 'opacity-72',
          draggable ? (drag ? 'z-10 cursor-grabbing' : 'cursor-grab') : 'cursor-pointer',
          block.pinned && 'pr-6',
        )}
        style={{
          ...position(start, end),
          background: fill,
          boxShadow: timing === 'current' || drag ? '0 0 0 3px #FFFFFF' : undefined,
        }}
      >
        <span className="flex min-w-0 items-center gap-1 text-[13px] font-extrabold">
          {block.done && <Check size={14} strokeWidth={2.5} aria-hidden className="shrink-0" />}
          {asks && (
            <span className="x shrink-0 rounded-full bg-coral px-1.5 text-[11px] leading-4 text-white">
              {block.postponeCount}×
            </span>
          )}
          <span className={cn('truncate', block.done && 'line-through')}>{block.title}</span>
        </span>
        <span className="x truncate text-[13px]">{range}</span>
      </div>
      {block.pinned && !drag && (
        <button
          type="button"
          title="Sabit · tıkla, sabitliği kaldır"
          aria-label={`${block.title}: sabitliği kaldır`}
          onClick={() => onUnpin(block.id)}
          className="absolute top-[76px] flex size-5 cursor-pointer items-center justify-center rounded-full bg-fill-ink text-white hover:bg-coral focus-visible:outline-3 focus-visible:outline-indigo"
          style={{ left: `calc(${timeToPercent(block.end)}% - 26px)` }}
        >
          <Pin size={11} strokeWidth={2.25} aria-hidden />
        </button>
      )}
    </>
  )
}
