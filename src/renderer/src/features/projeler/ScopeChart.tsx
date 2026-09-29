import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { MilestoneScope } from '@shared/ipc'

// Kapsam ölçer grafiği (PROJELER.md > Kapsam ölçer): son 8 hafta, hafta başına iki çubuk (taşa eklenen proje
// renginde, biten ink) ve üstte kalan görev çizgisi. Kalın çizgi, tam yuvarlak uçlar, eksen neredeyse yok.

// Detay sütununun 1440 genişlikteki gerçek eni: yazılar ~1:1 ölçekte kalsın.
const W = 800
const H = 150
const TOP = 18
const BOTTOM = 22
const BAR = 12
const PAIR_GAP = 3

export function ScopeChart({ weeks, color }: { weeks: MilestoneScope['weeks']; color: string }) {
  const max = Math.max(1, ...weeks.flatMap((w) => [w.added, w.done, w.remaining]))
  const slot = W / weeks.length
  const y = (v: number) => TOP + (H - TOP - BOTTOM) * (1 - v / max)
  const base = H - BOTTOM
  const cx = (i: number) => slot * i + slot / 2
  const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${cx(i)},${y(w.remaining)}`).join(' ')
  const summary = weeks
    .map(
      (w) =>
        `${format(parseISO(w.weekStart), 'd MMM', { locale: tr })}: ${w.added} eklendi, ${w.done} bitti, ${w.remaining} kaldı`,
    )
    .join('; ')

  return (
    <figure className="m-0 flex flex-col gap-2">
      <svg
        role="img"
        aria-label={`Son ${weeks.length} hafta. ${summary}`}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
      >
        <line x1={0} x2={W} y1={base} y2={base} className="stroke-line" strokeWidth={2} />
        {weeks.map((w, i) => {
          const x = cx(i)
          const bar = (v: number, dx: number, fill: string | undefined, cls?: string) =>
            v > 0 ? (
              <rect
                x={x + dx}
                y={Math.min(y(v), base - BAR)}
                width={BAR}
                height={Math.max(BAR, base - y(v))}
                rx={BAR / 2}
                fill={fill}
                className={cls}
              />
            ) : null
          return (
            <g key={w.weekStart}>
              <title>{`${format(parseISO(w.weekStart), 'd MMM', { locale: tr })} haftası: ${w.added} eklendi, ${w.done} bitti, ${w.remaining} kaldı`}</title>
              {bar(w.added, -BAR - PAIR_GAP / 2, color)}
              {bar(w.done, PAIR_GAP / 2, undefined, 'fill-ink')}
              <text
                x={x}
                y={H - 4}
                textAnchor="middle"
                className="fill-ink3 text-[13px] font-semibold tabular-nums"
              >
                {format(parseISO(w.weekStart), 'd MMM', { locale: tr })}
              </text>
            </g>
          )
        })}
        <path
          d={line}
          fill="none"
          className="stroke-ink2"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1 7"
        />
        {weeks.length > 0 && (
          <text
            x={cx(weeks.length - 1)}
            y={y(weeks[weeks.length - 1]!.remaining) - 8}
            textAnchor="middle"
            className="fill-ink text-[14px] font-extrabold tabular-nums"
          >
            {weeks[weeks.length - 1]!.remaining}
          </text>
        )}
      </svg>
      <figcaption className="flex items-center gap-4 text-[13px] font-semibold text-ink3">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: color }} /> Taşa eklenen
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-ink" /> Biten
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-[3px] border-dotted border-ink2" /> Kalan
        </span>
      </figcaption>
    </figure>
  )
}
