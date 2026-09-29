import { useState, type CSSProperties } from 'react'
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { tr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarEntry, ProjectSummary } from '@shared/ipc'
import { formatClock } from '../../lib/flow'
import { Button, cn, IconButton, Skeleton } from '../../ui'
import { useProjectCalendar } from './useProjects'

// Proje takvimi (PROJELER.md > Yol haritası): projeye ait tarihli her şey ay görünümünde. Taş hedefi proje
// renginde, son tarihli görev çerçeveli, planlanmış çalışma bloğu saatiyle. Taşa tıklamak onu çizelgede seçer.

const key = (d: Date) => format(d, 'yyyy-MM-dd')
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const PER_DAY = 3

type ProjectCalendarProps = {
  project: ProjectSummary
  onPickMilestone: (id: string) => void
}

export function ProjectCalendar({ project, onPickMilestone }: ProjectCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const from = startOfWeek(month, { weekStartsOn: 1 })
  const to = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const { data, isPending } = useProjectCalendar(project.id, key(from), key(to))
  const today = key(new Date())

  const byDay = new Map<string, CalendarEntry[]>()
  for (const e of data ?? []) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e])
  const days: Date[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)

  return (
    <section aria-label="Proje takvimi" className="flex flex-col gap-3 rounded-tile bg-s2 p-5">
      <div className="flex items-center gap-2">
        <h2 className="x m-0 grow text-[28px] leading-none font-black uppercase">
          {format(month, 'LLLL yyyy', { locale: tr })}
        </h2>
        <span className="mr-3 flex items-center gap-3 text-[13px] font-semibold text-ink3">
          <Legend className="rounded-full" style={{ background: project.color }}>
            Taş hedefi
          </Legend>
          <Legend className="rounded-full border-2 border-ink">Son tarih</Legend>
          <Legend className="rounded-full bg-s3">Planlanmış blok</Legend>
        </span>
        <IconButton
          label="Önceki ay"
          icon={ChevronLeft}
          className="[--btn-soft:var(--bg)]"
          onClick={() => setMonth((m) => addMonths(m, -1))}
        />
        <Button
          size="sm"
          variant="secondary"
          className="[--btn-soft:var(--bg)]"
          onClick={() => setMonth(startOfMonth(new Date()))}
        >
          Bu ay
        </Button>
        <IconButton
          label="Sonraki ay"
          icon={ChevronRight}
          className="[--btn-soft:var(--bg)]"
          onClick={() => setMonth((m) => addMonths(m, 1))}
        />
      </div>

      <div role="grid" aria-label="Ay görünümü" className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <span key={w} role="columnheader" className="cx px-2 text-ink3">
            {w}
          </span>
        ))}
        {isPending
          ? days.map((d) => <Skeleton key={key(d)} className="h-[104px] rounded-block" />)
          : days.map((d) => {
              const k = key(d)
              const entries = byDay.get(k) ?? []
              const inMonth = isSameMonth(d, month)
              return (
                <div
                  key={k}
                  role="gridcell"
                  aria-label={format(d, 'd MMMM EEEE', { locale: tr })}
                  className={cn(
                    'flex min-h-[104px] flex-col gap-1 rounded-block bg-bg p-1.5',
                    !inMonth && 'opacity-45',
                    k === today && 'ring-2 ring-ink',
                  )}
                >
                  <span
                    className={cn(
                      'x px-1 text-[13px] font-extrabold',
                      k === today ? 'text-ink' : 'text-ink3',
                    )}
                  >
                    {format(d, 'd')}
                  </span>
                  {entries.slice(0, PER_DAY).map((e) => (
                    <Entry
                      key={e.kind + e.id}
                      entry={e}
                      color={project.color}
                      onPick={onPickMilestone}
                    />
                  ))}
                  {entries.length > PER_DAY && (
                    <span
                      className="px-1 text-[13px] font-semibold text-ink3"
                      title={entries
                        .slice(PER_DAY)
                        .map((e) => e.title)
                        .join('\n')}
                    >
                      +{entries.length - PER_DAY} daha
                    </span>
                  )}
                </div>
              )
            })}
      </div>
    </section>
  )
}

function Entry({
  entry: e,
  color,
  onPick,
}: {
  entry: CalendarEntry
  color: string
  onPick: (id: string) => void
}) {
  const base = 'truncate rounded-full px-2 py-0.5 text-left text-[13px] font-bold'
  if (e.kind === 'milestone')
    return (
      <button
        type="button"
        title={`Taş hedefi: ${e.title}`}
        onClick={() => onPick(e.id)}
        className={cn(
          base,
          'cursor-pointer text-fill-ink focus-visible:outline-3 focus-visible:outline-indigo',
          e.done && 'line-through opacity-70',
        )}
        style={{ background: color }}
      >
        {e.title}
      </button>
    )
  if (e.kind === 'due')
    return (
      <span
        title={`Son tarih: ${e.title}`}
        className={cn(base, 'border-2 border-ink py-0', e.done && 'text-ink3 line-through')}
      >
        {e.title}
      </span>
    )
  return (
    <span title={e.title} className={cn(base, 'bg-s3', e.done && 'text-ink3 line-through')}>
      <span className="x mr-1 text-ink3">{formatClock(e.startMin ?? 0)}</span>
      {e.title}
    </span>
  )
}

function Legend({
  className,
  style,
  children,
}: {
  className: string
  style?: CSSProperties
  children: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-3', className)} style={style} />
      {children}
    </span>
  )
}
