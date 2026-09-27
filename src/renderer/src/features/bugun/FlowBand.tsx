import type { CSSProperties } from 'react'
import type { FakeFlowBlock } from '../../lib/fake'
import {
  blockTiming,
  formatDuration,
  hourTicks,
  parseTime,
  timeToPercent,
  type BlockTiming,
} from '../../lib/flow'
import { Button, cn, ON_BAND } from '../../ui'

// Bant içi sabit renkler: bant her iki temada da koyu, üstündeki yazılar da sabit.
const MUTED = '#A5A5B4'
const SOFT = '#C8C8D4'
const NOW = '#FF5A45'
const EXAM_STRIPES = 'repeating-linear-gradient(135deg, #7CC4FF 0 6px, #B9DFFF 6px 12px)'

type FlowBandProps = {
  blocks: FakeFlowBlock[]
  pins: Array<{ id: string; time: string; title: string }>
  /** "13:40" */
  now: string
  freeMinutes: number
  onReschedule?: () => void
}

/** Günün akışı, 08–24 tek satır: üst şerit hatırlatma pinleri, alt şerit bloklar, mercan "şimdi" çizgisi. */
export function FlowBand({ blocks, pins, now, freeMinutes, onReschedule }: FlowBandProps) {
  const nowMin = parseTime(now)
  const nowPct = timeToPercent(nowMin)

  return (
    <section
      aria-label="Günün akışı, 08:00 ile 24:00 arası"
      className="relative h-[164px] shrink-0 rounded-tile bg-band text-white"
    >
      <div className="absolute inset-y-0 right-6 left-6">
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

        {pins.map((pin) => (
          <div
            key={pin.id}
            className="absolute top-[38px] flex h-[26px] items-center gap-1.5 rounded-full bg-amber pr-2.5 pl-1 text-[13px] font-bold whitespace-nowrap text-fill-ink"
            style={{ left: `${timeToPercent(parseTime(pin.time))}%` }}
          >
            <span className="x flex h-[18px] items-center rounded-full bg-fill-ink px-1.5 text-white">
              {pin.time}
            </span>
            {pin.title}
          </div>
        ))}

        {blocks.map((block) => (
          <Block
            key={block.id}
            block={block}
            timing={blockTiming(parseTime(block.start), parseTime(block.end), nowMin)}
          />
        ))}

        {/* Şimdi çizgisi ve saat etiketi */}
        <div
          className="absolute top-[34px] bottom-[26px] w-0.5"
          style={{ left: `${nowPct}%`, background: NOW }}
        />
        <div
          className="x absolute bottom-2 flex h-[22px] items-center rounded-full px-2 text-[13px] font-extrabold text-white"
          style={{ left: `calc(${nowPct}% - 24px)`, background: NOW }}
        >
          {now}
        </div>

        <div
          className={cn('absolute right-0 bottom-2 flex items-center gap-3 text-[13px]', ON_BAND)}
          style={{ color: MUTED }}
        >
          {formatDuration(freeMinutes)} boş
          {/* Yeniden yerleştirme algoritması Aşama 3'te (domain/scheduler). */}
          <Button size="xs" variant="onTileGhost" className="px-3" onClick={onReschedule}>
            Yeniden yerleştir
          </Button>
        </div>
      </div>
    </section>
  )
}

function Block({ block, timing }: { block: FakeFlowBlock; timing: BlockTiming }) {
  const start = parseTime(block.start)
  const end = parseTime(block.end)
  const left = timeToPercent(start)
  const width = timeToPercent(end) - left
  const range = `${block.start}–${block.end}`
  const current = timing === 'current'

  const position: CSSProperties = { left: `${left}%`, width: `calc(${width}% - 4px)` }
  const base =
    'absolute top-[72px] flex h-[60px] flex-col justify-center overflow-hidden rounded-block px-2.5 py-1.5 leading-[1.25] text-fill-ink'

  if (block.kind === 'routine') {
    // Kısa gri blok; etiketi sağında, bloğun dışında.
    return (
      <>
        <div
          title={`${block.title} · ${range}`}
          className={cn(base, 'p-0', timing === 'past' && 'opacity-72')}
          style={{ ...position, background: '#55555F' }}
        />
        <div
          className="absolute top-[72px] flex h-[60px] items-center text-[13px]"
          style={{ left: `calc(${left + width}% + 6px)`, color: SOFT }}
        >
          {block.title}
        </div>
      </>
    )
  }

  if (block.kind === 'free') {
    return (
      <div
        title={`Boş · ${range}`}
        className={cn(base, 'items-center border-[1.5px] border-dashed border-white/35')}
        style={{ ...position, color: SOFT }}
      >
        <span className="text-[13px] font-bold">boş · {formatDuration(end - start)}</span>
      </div>
    )
  }

  const surface: CSSProperties =
    block.kind === 'exam'
      ? { background: EXAM_STRIPES }
      : { background: block.kind === 'task' ? block.color : 'var(--color-sky)' }

  return (
    <div
      title={`${block.title}${block.subtitle ? ` · ${block.subtitle}` : ''} · ${range}`}
      className={cn(
        base,
        timing === 'past' && 'opacity-72',
        // Görev blokları sürüklenebilir (Aşama 3); ders ve sınav sabit.
        block.kind === 'task' && 'cursor-grab',
      )}
      style={{ ...position, ...surface, boxShadow: current ? '0 0 0 3px #FFFFFF' : undefined }}
    >
      <span className={cn('font-extrabold', block.kind !== 'class' && 'text-[13px]')}>
        {block.title}
      </span>
      {block.subtitle && <span className="text-[13px]">{block.subtitle}</span>}
    </div>
  )
}
