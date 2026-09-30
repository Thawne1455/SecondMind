import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import { CalendarDays, Check, X } from 'lucide-react'
import type {
  AttendanceMark,
  BoardAssignment,
  BoardCourse,
  BoardWeek,
  ExamCard,
  SchoolBoard,
  WeekClass,
  WeekStudy,
} from '@shared/ipc'
import { formatDecimal } from '@shared/school/grades'
import { Button, cn } from '../../ui'
import { attendanceText, clock, daysLeftText, examUrgent, formatScore, nextClassText, stripes } from './schoolText'

// Dönem panosunun parçaları (OKUL.md "Ana ekran"): ince üst bant, Bugün / Yarın şeridi, ders defterleri.
// Not durumu tablosu Notlar ve ortalama ekranında (GpaPage) kullanılır.

export function TermBand({ board, onProgram }: { board: SchoolBoard; onProgram: () => void }) {
  const term = board.term!
  const week = Math.min(Math.max(board.week, 0), term.weekCount)
  const status =
    board.week === 0 ? 'Dönem başlamadı' : board.week > term.weekCount ? 'Dönem bitti' : null
  const hasGpa = board.termGpa !== null || board.overallGpa !== null
  return (
    <header className="flex items-center gap-8 rounded-tile bg-sky px-8 py-5 text-fill-ink">
      <div className="flex min-w-0 grow flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="cx">{term.name}</span>
          <span className="cx opacity-60">
            {format(new Date(term.startDate), 'd MMM', { locale: tr })} –{' '}
            {format(new Date(term.endDate), 'd MMM', { locale: tr })}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <span className="x shrink-0 text-[40px] leading-[.9] font-black uppercase">
            {status ?? (
              <>
                Hafta {week}
                <span className="opacity-45"> / {term.weekCount}</span>
              </>
            )}
          </span>
          <div
            role="progressbar"
            aria-label="Dönem ilerlemesi"
            aria-valuenow={Math.round(board.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2.5 w-full max-w-[420px] overflow-hidden rounded-full bg-[rgba(19,19,22,.14)]"
          >
            <div className="h-full rounded-full bg-fill-ink" style={{ width: `${board.progress * 100}%` }} />
          </div>
        </div>
      </div>
      <Button variant="onTile" icon={CalendarDays} onClick={onProgram}>
        Haftalık program
      </Button>
      {hasGpa && (
        <Link
          to="/okul/gano"
          title="Notlar ve ortalama"
          className="flex shrink-0 items-end gap-6 rounded-[22px] px-3 py-2 hover:bg-[rgba(19,19,22,.08)] focus-visible:outline-3 focus-visible:outline-indigo"
        >
          <SmallNumber label="Dönem ort." value={board.termGpa} />
          <SmallNumber label="Genel ort." value={board.overallGpa} />
        </Link>
      )}
    </header>
  )
}

function SmallNumber({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="x text-[32px] leading-[.9] font-black">{value === null ? '—' : formatDecimal(value)}</span>
      <span className="cx text-[12px] opacity-70">{label}</span>
    </div>
  )
}

// ——— Bugün / Yarın şeridi ———

type SoonProps = {
  board: SchoolBoard
  nowMin: number
  now: number
  onAttendance: (c: WeekClass, status: AttendanceMark | null) => void
  onStudy: (s: WeekStudy) => void
  onDone: (a: BoardAssignment) => void
}

export function SoonStrip({ board, nowMin, now, onAttendance, onStudy, onDone }: SoonProps) {
  const later = board.exams.filter((e) => e.daysLeft >= 2 && e.daysLeft <= 7)
  return (
    <section aria-label="Bugün ve yarın" className="grid grid-cols-3 items-start gap-4">
      {[board.today, board.tomorrow].map((day) => (
        <DayColumn
          key={day}
          label={day === board.today ? 'Bugün' : 'Yarın'}
          day={day}
          classes={board.soonClasses.filter((c) => c.day === day)}
          study={board.soonStudy.filter((s) => s.day === day)}
          exams={board.exams.filter((e) => e.day === day)}
          isToday={day === board.today}
          nowMin={nowMin}
          onAttendance={onAttendance}
          onStudy={onStudy}
        />
      ))}
      <Column label="Yaklaşan" sub="7 gün sınav · 48 saat teslim">
        {later.length === 0 && board.dueSoon.length === 0 ? (
          <Quiet>Yakında sınav ya da teslim yok.</Quiet>
        ) : (
          <>
            {later.map((e) => (
              <ExamLine key={e.id} e={e} />
            ))}
            {board.dueSoon.map((a) => (
              <DueLine key={a.id} a={a} now={now} onDone={onDone} />
            ))}
          </>
        )}
      </Column>
    </section>
  )
}

function Column({ label, sub, children }: { label: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-tile bg-s2 px-5 py-[18px]">
      <div className="flex items-baseline gap-2">
        <span className="cx">{label}</span>
        <span className="text-[13px] font-semibold text-ink3">{sub}</span>
      </div>
      {children}
    </div>
  )
}

const Quiet = ({ children }: { children: ReactNode }) => <span className="text-ink3">{children}</span>

function DayColumn({
  label,
  day,
  classes,
  study,
  exams,
  isToday,
  nowMin,
  onAttendance,
  onStudy,
}: {
  label: string
  day: string
  classes: WeekClass[]
  study: WeekStudy[]
  exams: ExamCard[]
  isToday: boolean
  nowMin: number
  onAttendance: SoonProps['onAttendance']
  onStudy: SoonProps['onStudy']
}) {
  const navigate = useNavigate()
  const items = [
    ...classes.map((c) => ({ at: c.startMin, node: <ClassLine key={c.slotId} c={c} past={isToday && c.endMin <= nowMin} onAttendance={onAttendance} /> })),
    ...study.map((s) => ({ at: s.startMin, node: <StudyLine key={s.id} s={s} actionable={isToday} onStudy={onStudy} /> })),
  ].sort((a, b) => a.at - b.at)
  return (
    <Column label={label} sub={format(parseISO(day), 'EEEE d MMM', { locale: tr })}>
      {exams.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => void navigate(`/okul/sinav/${e.id}`)}
          className="flex cursor-pointer items-center gap-2 rounded-full bg-coral px-3 py-1 text-left text-[13px] font-bold text-white focus-visible:outline-3 focus-visible:outline-indigo"
        >
          <span className="cx shrink-0">Sınav</span>
          <span className="truncate">
            {e.startMin !== null && `${clock(e.startMin)} · `}
            {e.courseName} {e.title}
          </span>
        </button>
      ))}
      {items.length === 0 && exams.length === 0 ? <Quiet>Ders yok.</Quiet> : items.map((i) => i.node)}
    </Column>
  )
}

function ClassLine({
  c,
  past,
  onAttendance,
}: {
  c: WeekClass
  past: boolean
  onAttendance: SoonProps['onAttendance']
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-9 w-2.5 shrink-0 rounded-full" style={{ background: c.tone }} />
      <div className="flex min-w-0 grow flex-col">
        <Link to={`/okul/ders/${c.courseId}`} className="truncate font-bold hover:underline">
          {c.name}
        </Link>
        <span className="x truncate text-[13px] font-semibold text-ink2">
          {clock(c.startMin)}–{clock(c.endMin)}
          {c.room && ` · ${c.room}`}
        </span>
      </div>
      {past &&
        (c.attendance === null ? (
          <span className="flex shrink-0 items-center gap-1">
            <MarkButton label="Katıldım" onClick={() => onAttendance(c, 'present')}>
              <Check size={14} strokeWidth={3} aria-hidden />
            </MarkButton>
            <MarkButton label="Katılmadım" onClick={() => onAttendance(c, 'absent')}>
              <X size={14} strokeWidth={3} aria-hidden />
            </MarkButton>
          </span>
        ) : (
          <button
            type="button"
            title="Yoklama işaretini kaldır"
            onClick={() => onAttendance(c, null)}
            className={cn(
              'cx flex h-6 shrink-0 cursor-pointer items-center rounded-full px-2 text-[11px] text-white',
              c.attendance === 'present' ? 'bg-fill-ink' : 'bg-coral',
            )}
          >
            {c.attendance === 'present' ? 'Katıldım' : c.attendance === 'absent' ? 'Yoktum' : 'İptal'}
          </button>
        ))}
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
      className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-bg hover:bg-hover focus-visible:outline-3 focus-visible:outline-indigo"
    >
      {children}
    </button>
  )
}

function StudyLine({ s, actionable, onStudy }: { s: WeekStudy; actionable: boolean; onStudy: SoonProps['onStudy'] }) {
  const done = s.status === 'done'
  return (
    <div className="flex items-center gap-3">
      <span className="h-9 w-2.5 shrink-0 rounded-full" style={stripes(s.tone)} />
      <div className={cn('flex min-w-0 grow flex-col', done && 'text-ink3')}>
        <span className={cn('truncate font-bold', done && 'line-through')}>{s.title}</span>
        <span className="x text-[13px] font-semibold text-ink2">
          Çalışma · {clock(s.startMin)}–{clock(s.endMin)}
        </span>
      </div>
      {actionable && (
        <button
          type="button"
          aria-label={done ? `${s.title}: yapılmadı say` : `${s.title}: çalıştım`}
          title={done ? 'Yapılmadı say' : 'Çalıştım'}
          onClick={() => onStudy(s)}
          className={cn(
            'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-2',
            done ? 'border-ink bg-ink text-on-ink' : 'border-ink3 hover:border-ink',
          )}
        >
          {done && <Check size={14} strokeWidth={3} aria-hidden />}
        </button>
      )}
    </div>
  )
}

function ExamLine({ e }: { e: ExamCard }) {
  const urgent = examUrgent(e)
  return (
    <Link
      to={`/okul/sinav/${e.id}`}
      className="flex items-center gap-3 rounded-[14px] hover:bg-hover focus-visible:outline-3 focus-visible:outline-indigo"
    >
      <span
        className={cn(
          'cx shrink-0 rounded-full px-2.5 py-1 text-[12px]',
          urgent ? 'bg-coral text-white' : 'bg-bg text-ink',
        )}
      >
        {daysLeftText(e.daysLeft)}
      </span>
      <span className="min-w-0 grow truncate font-bold">
        {e.courseName} {e.title}
      </span>
      <span className="x shrink-0 text-[13px] font-bold text-ink2">
        {e.readiness === null ? 'plan yok' : `%${e.readiness} hazır`}
      </span>
    </Link>
  )
}

function DueLine({ a, now, onDone }: { a: BoardAssignment; now: number; onDone: SoonProps['onDone'] }) {
  const late = a.dueAt < now
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`${a.title}: teslim ettim`}
        title="Teslim ettim"
        onClick={() => onDone(a)}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-ink3 hover:border-ink"
      />
      <Link to={`/okul/ders/${a.courseId}/odevler`} className="min-w-0 grow truncate font-bold hover:underline">
        {a.title}
        <span className="ml-2 text-[13px] font-semibold text-ink3">{a.courseName}</span>
      </Link>
      <span className={cn('x shrink-0 text-[13px] font-bold', late ? 'text-t-coral' : 'text-ink2')}>
        {late ? 'Gecikti · ' : ''}
        {format(a.dueAt, 'EEE HH:mm', { locale: tr })}
      </span>
    </div>
  )
}

// ——— Ders defterleri: her ders bir satır, 14 haftalık kare şeridi ———

export function CourseShelf({ board, nowMin }: { board: SchoolBoard; nowMin: number }) {
  return (
    <section aria-label="Ders defterleri" className="flex flex-col gap-2">
      {board.courses.map((c) => (
        <CourseRow
          key={c.id}
          c={c}
          exam={board.exams.find((e) => e.courseId === c.id)}
          currentWeek={board.week}
          nextText={c.nextClass && nextClassText(c.nextClass, board.today, board.tomorrow, nowMin)}
        />
      ))}
    </section>
  )
}

function CourseRow({
  c,
  exam,
  currentWeek,
  nextText,
}: {
  c: BoardCourse
  exam: ExamCard | undefined
  currentWeek: number
  nextText: string | null
}) {
  const base = `/okul/ders/${c.id}`
  const warn = c.attendance.state === 'warn' || c.attendance.state === 'over'
  return (
    <div className="flex items-stretch overflow-hidden rounded-tile bg-s2">
      <span className="w-3 shrink-0" style={{ background: c.tone }} />
      <div className="grid min-w-0 grow grid-cols-[minmax(180px,260px)_minmax(0,1fr)_minmax(150px,auto)] items-center gap-6 px-5 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Link to={base} className="truncate text-[18px] leading-tight font-extrabold hover:underline">
            {c.name}
          </Link>
          <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink3">
            {c.code && <span>{c.code}</span>}
            {exam && (
              <Link
                to={`/okul/sinav/${exam.id}`}
                className={cn(
                  'cx rounded-full px-2 py-0.5 text-[11px]',
                  examUrgent(exam) ? 'bg-coral text-white' : 'bg-bg text-ink',
                )}
              >
                {exam.title} · {daysLeftText(exam.daysLeft)}
              </Link>
            )}
            {warn && (
              <span
                title="Devamsızlık"
                className={cn(
                  'x rounded-full px-2 py-0.5 text-[11px] font-bold',
                  c.attendance.state === 'over' ? 'bg-coral text-white' : 'bg-amber text-fill-ink',
                )}
              >
                Devam {attendanceText(c.attendance)}
              </span>
            )}
          </span>
        </div>
        <WeekSquares base={base} name={c.name} tone={c.tone} weeks={c.weeks} currentWeek={currentWeek} />
        <span className="x text-right text-[14px] font-bold text-ink2">{nextText ?? '—'}</span>
      </div>
    </div>
  )
}

function WeekSquares({
  base,
  name,
  tone,
  weeks,
  currentWeek,
}: {
  base: string
  name: string
  tone: string
  weeks: BoardWeek[]
  currentWeek: number
}) {
  const navigate = useNavigate()
  return (
    <div role="group" aria-label={`${name} haftaları`} className="flex flex-wrap gap-1.5">
      {weeks.map((w) => {
        const current = w.weekNo === currentWeek
        const future = w.weekNo > currentWeek
        const label = [
          `${w.weekNo}. hafta`,
          w.title,
          w.filled ? null : 'boş',
          w.openFlags ? `${w.openFlags} anlamadım` : null,
        ]
          .filter(Boolean)
          .join(' · ')
        return (
          <button
            key={w.weekNo}
            type="button"
            title={label}
            aria-label={label}
            aria-current={current ? 'date' : undefined}
            onClick={() => void navigate(`${base}?hafta=${w.weekNo}`)}
            className={cn(
              'x flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] text-[12px] font-bold',
              'transition-transform duration-[180ms] hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-indigo',
              w.openFlags ? 'bg-coral text-white' : w.filled ? 'text-fill-ink' : 'bg-bg text-ink3',
              !w.filled && !w.openFlags && future && 'opacity-50',
              current && 'ring-2 ring-ink ring-offset-2 ring-offset-s2',
            )}
            style={w.filled && !w.openFlags ? { background: tone } : undefined}
          >
            {w.weekNo}
          </button>
        )
      })}
    </div>
  )
}

// ——— Not durumu tablosu (Notlar ve ortalama ekranı) ———

const ATT_CLASS = { none: '', ok: '', warn: 'bg-amber text-fill-ink', over: 'bg-coral text-white' } as const

export function GradeTable({ courses }: { courses: BoardCourse[] }) {
  const navigate = useNavigate()
  return (
    <section aria-label="Not durumu" className="flex flex-col gap-2 rounded-tile bg-s2 px-5 py-[18px]">
      <span className="cx">Not durumu · bu dönem</span>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="cx text-[12px] text-ink3 [&>th]:px-2 [&>th]:py-1.5 [&>th]:font-extrabold">
            <th className="!pl-0">Ders</th>
            <th className="text-right">Kredi</th>
            <th className="text-right">Puan</th>
            <th className="text-right">Harf</th>
            <th className="!pl-4">Hedef</th>
            <th className="!pr-0 text-right">Devam</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => (
            <tr
              key={c.id}
              onClick={() => void navigate(`/okul/ders/${c.id}/sinavlar`)}
              className="cursor-pointer border-t border-line hover:bg-hover [&>td]:px-2 [&>td]:py-2.5"
            >
              <td className="max-w-[220px] !pl-0">
                <span className="flex items-center gap-2 font-bold">
                  <span className="size-3 shrink-0 rounded-[4px]" style={{ background: c.tone }} />
                  <span className="truncate">{c.name}</span>
                </span>
              </td>
              <td className="x text-right">{c.credit ? formatScore(c.credit) : '—'}</td>
              <td className="x text-right font-bold">
                {c.score.current === null ? '—' : formatScore(c.score.current)}
              </td>
              <td className="x text-right font-black">{c.score.letter ?? '—'}</td>
              <td className="!pl-4 text-[13px] font-semibold text-ink2">
                <RequiredCell course={c} />
              </td>
              <td className="!pr-0 text-right whitespace-nowrap">
                <span className={cn('x rounded-full px-2 py-0.5 font-bold', ATT_CLASS[c.attendance.state])}>
                  {attendanceText(c.attendance)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function RequiredCell({ course: c }: { course: BoardCourse }) {
  const r = c.score.required
  if (r.status === 'final') return <>{r.reached ? `${c.targetLetter} tuttu` : 'Sonuç belli'}</>
  if (r.status === 'secured') return <>{c.targetLetter} garanti</>
  if (r.status === 'impossible')
    return (
      <span className="text-t-coral">
        {c.targetLetter} olmaz · en iyi {r.bestLetter}
      </span>
    )
  return (
    <>
      {c.targetLetter} için en az <span className="x font-extrabold text-ink">{r.min}</span>
    </>
  )
}
