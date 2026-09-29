import type { CSSProperties, ReactNode } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Check, X } from 'lucide-react'
import type { AttendanceMark, ExamCard, WeekClass, WeekStudy } from '@shared/ipc'
import { cn } from '../../ui'
import { clock, stripes, WEEKDAY_SHORT } from './schoolText'

// Dönem panosunun haftalık programı: akış bandı bloklarının dikey hali (TASARIM.md). Pzt–Cum kolonları
// (hafta sonu doluysa o da), 08–20 satırları (geç biten blok varsa uzar). Ders blokları dersin gök tonunda,
// çalışma blokları çizgili, sınav günleri mercan pin. Geçmiş dersin üstünde yoklama: katıldım / katılmadım.

const HOUR_PX = 46
const NOW = '#FF5A45'

type Props = {
  weekStart: string
  today: string
  nowMin: number
  classes: WeekClass[]
  study: WeekStudy[]
  exams: ExamCard[]
  onAttendance: (c: WeekClass, status: AttendanceMark | null) => void
  onStudy: (s: WeekStudy) => void
  onCourse: (courseId: string) => void
}

export function WeekProgram({
  weekStart,
  today,
  nowMin,
  classes,
  study,
  exams,
  onAttendance,
  onStudy,
  onCourse,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(weekStart), i), 'yyyy-MM-dd'))
  const used = new Set([...classes.map((c) => c.day), ...study.map((s) => s.day)])
  const shown = days.filter((d, i) => i < 5 || used.has(d))
  const lastEnd = Math.max(20 * 60, ...classes.map((c) => c.endMin), ...study.map((s) => s.endMin))
  const firstStart = Math.min(8 * 60, ...classes.map((c) => c.startMin), ...study.map((s) => s.startMin))
  const from = Math.floor(firstStart / 60)
  const to = Math.ceil(lastEnd / 60)
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const top = (min: number) => ((min - from * 60) / 60) * HOUR_PX

  return (
    <section aria-label="Haftalık program" className="flex flex-col gap-3 rounded-tile bg-s2 px-5 py-[18px]">
      <span className="cx">Bu hafta</span>
      <div className="flex">
        <div className="relative w-10 shrink-0" style={{ height: (to - from) * HOUR_PX + 28 }}>
          {hours.map((h) => (
            <span
              key={h}
              className="x absolute right-2 text-[13px] font-bold text-ink3"
              style={{ top: 28 + top(h * 60) - 9 }}
            >
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
        {shown.map((day) => {
          const i = days.indexOf(day)
          const isToday = day === today
          const dayExams = exams.filter((e) => e.day === day)
          return (
            <div key={day} className="relative min-w-0 flex-1 border-l border-line">
              <div
                className={cn(
                  'flex h-7 items-center justify-center gap-1.5 text-[13px] font-extrabold',
                  isToday && 'text-indigo',
                )}
              >
                <span className="cx">{WEEKDAY_SHORT[i]}</span>
                <span className="x font-bold text-ink3">{format(parseISO(day), 'd', { locale: tr })}</span>
              </div>
              <div className={cn('relative', isToday && 'bg-hover')} style={{ height: (to - from) * HOUR_PX }}>
                {hours.slice(1).map((h) => (
                  <div key={h} className="absolute inset-x-0 h-px bg-line" style={{ top: top(h * 60) }} />
                ))}
                {dayExams.map((e, k) => (
                  <span
                    key={e.id}
                    title={`${e.courseName} · ${e.title}`}
                    className="absolute right-1 left-1 z-10 truncate rounded-full bg-coral px-2 text-[12px] leading-5 font-bold text-white"
                    style={{ top: e.startMin !== null ? top(e.startMin) : 2 + k * 22 }}
                  >
                    {e.startMin !== null && `${clock(e.startMin)} `}
                    {e.title} · {e.courseName}
                  </span>
                ))}
                {classes
                  .filter((c) => c.day === day)
                  .map((c) => (
                    <ClassBlock
                      key={c.slotId}
                      c={c}
                      past={day < today || (isToday && c.endMin <= nowMin)}
                      style={{ top: top(c.startMin), height: top(c.endMin) - top(c.startMin) - 3 }}
                      onAttendance={onAttendance}
                      onCourse={onCourse}
                    />
                  ))}
                {study
                  .filter((s) => s.day === day)
                  .map((s) => {
                    const actionable = day <= today
                    return (
                      <button
                        key={s.id}
                        type="button"
                        title={`${s.title} · ${clock(s.startMin)}–${clock(s.endMin)}${actionable ? ' · tıkla: yapıldı / yapılmadı' : ''}`}
                        disabled={!actionable}
                        onClick={() => onStudy(s)}
                        className={cn(
                          'absolute right-1 left-1 flex flex-col overflow-hidden rounded-block px-2 py-1 text-left text-[12px] leading-[1.2] font-bold text-fill-ink',
                          'focus-visible:outline-3 focus-visible:outline-indigo',
                          actionable ? 'cursor-pointer' : 'cursor-default',
                          s.status === 'done' && 'opacity-60',
                        )}
                        style={{
                          ...stripes(s.tone),
                          top: top(s.startMin),
                          height: top(s.endMin) - top(s.startMin) - 3,
                        }}
                      >
                        <span className="flex items-center gap-1 truncate">
                          {s.status === 'done' && <Check size={12} strokeWidth={3} aria-hidden />}
                          <span className="truncate rounded bg-white/70 px-1">{s.title}</span>
                        </span>
                      </button>
                    )
                  })}
                {isToday && nowMin >= from * 60 && nowMin <= to * 60 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 h-0.5"
                    style={{ top: top(nowMin), background: NOW }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ClassBlock({
  c,
  past,
  style,
  onAttendance,
  onCourse,
}: {
  c: WeekClass
  past: boolean
  style: CSSProperties
  onAttendance: Props['onAttendance']
  onCourse: Props['onCourse']
}) {
  return (
    <div
      className={cn(
        'absolute right-1 left-1 flex flex-col overflow-hidden rounded-block px-2 py-1 text-fill-ink',
        past && !c.attendance && 'opacity-90',
      )}
      style={{ ...style, background: c.tone }}
    >
      <button
        type="button"
        onClick={() => onCourse(c.courseId)}
        className="cursor-pointer truncate text-left text-[13px] leading-[1.2] font-extrabold hover:underline focus-visible:outline-3 focus-visible:outline-indigo"
      >
        {c.name}
      </button>
      <span className="x truncate text-[12px] font-semibold">
        {clock(c.startMin)}
        {c.room && ` · ${c.room}`}
      </span>
      {past && (
        <div className="mt-auto flex items-center gap-1">
          {c.attendance === null ? (
            <>
              <MarkButton label="Katıldım" onClick={() => onAttendance(c, 'present')}>
                <Check size={12} strokeWidth={3} aria-hidden />
              </MarkButton>
              <MarkButton label="Katılmadım" onClick={() => onAttendance(c, 'absent')}>
                <X size={12} strokeWidth={3} aria-hidden />
              </MarkButton>
            </>
          ) : (
            <button
              type="button"
              title="Yoklama işaretini kaldır"
              onClick={() => onAttendance(c, null)}
              className={cn(
                'cx flex h-5 cursor-pointer items-center gap-1 rounded-full px-1.5 text-[11px]',
                c.attendance === 'present' ? 'bg-fill-ink text-white' : 'bg-coral text-white',
              )}
            >
              {c.attendance === 'present' ? 'Katıldım' : c.attendance === 'absent' ? 'Yoktum' : 'İptal'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function MarkButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-5 cursor-pointer items-center justify-center rounded-full bg-white/70 hover:bg-white focus-visible:outline-3 focus-visible:outline-indigo"
    >
      {children}
    </button>
  )
}
