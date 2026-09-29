import type { KeyboardEvent } from 'react'
import type { MilestoneScope } from '@shared/ipc'
import { cn } from '../../ui'
import { formatShortDay, lateLabel } from './roadmapText'
import type { Timeline } from './timeline'

// Yol haritası zaman çizelgesi (PROJELER.md > Yol haritası): akış bandının haftalık/aylık hali. Siyah bant,
// üstte ay etiketleri, ince hafta çizgileri; her tarihli taş proje renginde blok, hedefte pin, bugün beyaz
// çizgi. Gecikecek taş mercan, hedeften tahmine kesikli kuyruk. Tarihsiz taşlar bandın altında.

// Bant içi sabit renkler (bant her iki temada da koyu).
const MUTED = '#A5A5B4'
const LATE = '#D93A26'
const LATE_TAIL = '#FF8A7A'

type RoadmapTimelineProps = {
  timeline: Timeline
  color: string
  scopes: ReadonlyMap<string, MilestoneScope>
  selectedId: string | null
  onSelect: (id: string) => void
}

export function RoadmapTimeline({
  timeline: t,
  color,
  scopes,
  selectedId,
  onSelect,
}: RoadmapTimelineProps) {
  const ids = [...t.blocks.map((b) => b.id), ...t.undated.map((m) => m.id)]

  // ← → taşlar arasında gezer (odak ve seçim birlikte).
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const next = ids[ids.indexOf(id) + (e.key === 'ArrowRight' ? 1 : -1)]
    if (!next) return
    e.preventDefault()
    onSelect(next)
    document.getElementById(`milestone-${next}`)?.focus()
  }

  return (
    <section
      aria-label="Kilometre taşları zaman çizelgesi"
      className="relative flex flex-col rounded-tile bg-band text-white"
    >
      <div className="relative mx-6 h-[168px]">
        {t.months.map((m) => (
          <span
            key={m.key}
            className="cx absolute top-3.5 pl-1.5"
            style={{ left: `${m.left}%`, color: MUTED }}
          >
            {m.label}
          </span>
        ))}
        {t.months.map((m) => (
          <div
            key={m.key}
            className="absolute top-3 bottom-4 w-px bg-white/20"
            style={{ left: `${m.left}%` }}
          />
        ))}
        {t.weeks.map((w) => (
          <div
            key={w}
            className="absolute top-[38px] bottom-4 w-px bg-white/7"
            style={{ left: `${w}%` }}
          />
        ))}

        {/* Bugün çizgisi bloğun arkasında: blok metnini kesmez, üstünde ve altında görünür. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-[40px] bottom-7 w-0.5 bg-white"
          style={{ left: `${t.today}%` }}
        />

        {t.blocks.map((b) => {
          const selected = b.id === selectedId
          const label = b.late ? lateLabel(b.targetDate, scopes.get(b.id)) : null
          return (
            <div key={b.id}>
              {b.finish !== null && (
                <div
                  aria-hidden
                  className="absolute top-[88px] h-0 border-t-[3px] border-dashed"
                  style={{
                    left: `${b.target}%`,
                    width: `${Math.max(0, b.finish - b.target)}%`,
                    borderColor: LATE_TAIL,
                  }}
                />
              )}
              {b.finish !== null && (
                <span
                  aria-hidden
                  className="absolute top-[82px] size-3 -translate-x-1/2 rounded-full"
                  style={{ left: `${b.finish}%`, background: LATE_TAIL }}
                />
              )}
              <button
                id={`milestone-${b.id}`}
                type="button"
                aria-pressed={selected}
                aria-label={`${b.title}, hedef ${formatShortDay(b.targetDate)}${b.done ? ', tamamlandı' : ''}${label ? `, ${label}` : ''}`}
                title={`${b.title} · ${label ?? `Hedef ${formatShortDay(b.targetDate)}`}`}
                onClick={() => onSelect(b.id)}
                onKeyDown={(e) => onKeyDown(e, b.id)}
                className={cn(
                  'absolute top-[56px] flex h-[64px] cursor-pointer flex-col justify-center overflow-hidden rounded-block px-2.5 text-left leading-[1.25] transition-[filter] hover:brightness-105',
                  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
                  b.late ? 'text-white' : 'text-fill-ink',
                  b.done && 'opacity-[.72]',
                  selected && 'ring-2 ring-white ring-offset-2 ring-offset-band',
                )}
                style={{
                  left: `${b.left}%`,
                  width: `calc(${b.width}% - 4px)`,
                  minWidth: 12,
                  background: b.late ? LATE : color,
                }}
              >
                <span className="truncate text-[15px] font-extrabold">
                  {b.done && '✓ '}
                  {b.title}
                </span>
                <span className="truncate text-[13px] font-semibold opacity-80">
                  {label ?? formatShortDay(b.targetDate)}
                </span>
              </button>
              {/* Hedef pini */}
              <span
                aria-hidden
                className="absolute top-[124px] h-3 w-0.5 -translate-x-1/2 bg-white/60"
                style={{ left: `${b.target}%` }}
              />
            </div>
          )
        })}

        <span
          className="cx absolute bottom-2 -translate-x-1/2 rounded-full bg-white px-2 py-0.5 text-fill-ink"
          style={{ left: `${t.today}%` }}
        >
          Bugün
        </span>
      </div>

      {t.undated.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-6 py-3">
          <span className="cx mr-1" style={{ color: MUTED }}>
            Tarihsiz
          </span>
          {t.undated.map((m) => (
            <button
              key={m.id}
              id={`milestone-${m.id}`}
              type="button"
              aria-pressed={m.id === selectedId}
              onClick={() => onSelect(m.id)}
              onKeyDown={(e) => onKeyDown(e, m.id)}
              className={cn(
                'h-[30px] cursor-pointer rounded-full border-[1.5px] border-dashed border-white/40 px-3 text-[14px] font-bold',
                'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
                m.done && 'opacity-[.72]',
                m.id === selectedId && 'border-solid border-white bg-white text-fill-ink',
              )}
            >
              {m.done && '✓ '}
              {m.title}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
