import { cn } from '../../ui'
import { formatMinutes } from '../../lib/format'

type WeekBarsProps = {
  /** Hafta başına commit ve oturum dakikası, en eski önce; son eleman bu hafta. */
  weeks: readonly { commits: number; minutes: number }[]
  color: string
  height?: number
  className?: string
}

/** Bir commit bu kadar dakikalık emek sayılır: commit ve dakika tek çubukta toplanır. */
const COMMIT_MIN = 30

/**
 * Şeritteki aktivite çubukları (PROJELER.md): son 8 hafta, hafta başına tam yuvarlak uçlu çubuk.
 * Boy haftaların en yoğununa göre; boş hafta küçük nokta, bu hafta koyu ton. Ayrıntı ipucunda.
 */
export function WeekBars({ weeks, color, height = 40, className }: WeekBarsProps) {
  const w = 10
  const gap = 6
  const width = weeks.length * (w + gap) - gap
  const score = weeks.map((x) => x.minutes + x.commits * COMMIT_MIN)
  const max = Math.max(...score, 1)
  const commits = weeks.reduce((a, x) => a + x.commits, 0)
  const minutes = weeks.reduce((a, x) => a + x.minutes, 0)
  return (
    <svg
      role="img"
      aria-label={`Son ${weeks.length} hafta: ${commits} commit, ${formatMinutes(minutes)} oturum`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('shrink-0 overflow-visible', className)}
    >
      {weeks.map((week, i) => {
        const x = i * (w + gap)
        const current = i === weeks.length - 1
        const label = `${weeks.length - 1 - i === 0 ? 'Bu hafta' : `${weeks.length - 1 - i} hafta önce`}: ${week.commits} commit · ${formatMinutes(week.minutes)}`
        if (score[i]! <= 0)
          return (
            <circle
              key={i}
              cx={x + w / 2}
              cy={height - w / 2}
              r={2.5}
              className={current ? 'fill-ink' : 'fill-ink3/40'}
            >
              <title>{label}</title>
            </circle>
          )
        const h = Math.max(w, Math.round((score[i]! / max) * height))
        return (
          <rect
            key={i}
            x={x}
            y={height - h}
            width={w}
            height={h}
            rx={w / 2}
            fill={current ? undefined : color}
            className={current ? 'fill-ink' : undefined}
          >
            <title>{label}</title>
          </rect>
        )
      })}
    </svg>
  )
}
