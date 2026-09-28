import { cn } from '../../ui'

type RhythmProps = {
  /** Gün başına dakika, en eski önce; son eleman bugün. */
  days: readonly number[]
  color: string
  height?: number
  className?: string
}

/**
 * Son günlerin çalışma ritmi: gün başına tam yuvarlak uçlu çubuk (TASARIM.md "Grafik").
 * Çalışılmayan gün küçük nokta; bugün koyu ton. Ölçek sabit: 4 saat ve üstü tam boy.
 */
export function Rhythm({ days, color, height = 40, className }: RhythmProps) {
  const max = 240
  const w = 8
  const gap = 5
  const width = days.length * (w + gap) - gap
  const total = days.reduce((a, b) => a + b, 0)
  return (
    <svg
      role="img"
      aria-label={`Son ${days.length} gün: ${Math.round(total / 60)} saat çalışıldı`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('shrink-0 overflow-visible', className)}
    >
      {days.map((min, i) => {
        const x = i * (w + gap)
        const today = i === days.length - 1
        if (min <= 0)
          return (
            <circle
              key={i}
              cx={x + w / 2}
              cy={height - w / 2}
              r={2.5}
              className={today ? 'fill-ink' : 'fill-ink3/40'}
            />
          )
        const h = Math.max(w, Math.round((Math.min(min, max) / max) * height))
        return (
          <rect
            key={i}
            x={x}
            y={height - h}
            width={w}
            height={h}
            rx={w / 2}
            fill={today ? undefined : color}
            className={today ? 'fill-ink' : undefined}
          >
            <title>{`${Math.round(min)} dk`}</title>
          </rect>
        )
      })}
    </svg>
  )
}
