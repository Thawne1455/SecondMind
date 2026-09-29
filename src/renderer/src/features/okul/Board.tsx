import { Link, useNavigate } from 'react-router'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Check, Plus } from 'lucide-react'
import type { BoardAssignment, BoardCourse, ExamCard, SchoolBoard } from '@shared/ipc'
import { formatDecimal } from '@shared/school/grades'
import { formatMinutes } from '../../lib/format'
import { Button, cn } from '../../ui'
import { attendanceText, daysLeftText, examUrgent, formatScore } from './schoolText'

// Dönem panosunun parçaları (OKUL.md "Ana ekran"): üst bant, sınav şeridi, not durumu tablosu, bu hafta teslim.

export function TermBand({ board }: { board: SchoolBoard }) {
  const term = board.term!
  const week = Math.min(Math.max(board.week, 0), term.weekCount)
  const status =
    board.week === 0 ? 'Dönem başlamadı' : board.week > term.weekCount ? 'Dönem bitti' : null
  return (
    <header className="flex min-h-[168px] items-stretch gap-10 rounded-tile bg-sky px-8 pt-5 pb-6 text-fill-ink">
      <div className="flex min-w-0 grow flex-col justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="cx">{term.name}</span>
          <span className="cx opacity-60">
            {format(new Date(term.startDate), 'd MMM', { locale: tr })} –{' '}
            {format(new Date(term.endDate), 'd MMM', { locale: tr })}
          </span>
        </div>
        <div className="flex items-end gap-4">
          <span className="x text-[64px] leading-[.9] font-black uppercase">
            {status ?? (
              <>
                Hafta {week}
                <span className="opacity-45"> / {term.weekCount}</span>
              </>
            )}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Dönem ilerlemesi"
          aria-valuenow={Math.round(board.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2.5 w-full max-w-[560px] overflow-hidden rounded-full bg-[rgba(19,19,22,.14)]"
        >
          <div className="h-full rounded-full bg-fill-ink" style={{ width: `${board.progress * 100}%` }} />
        </div>
      </div>
      <Link
        to="/okul/gano"
        title="Ortalama ekranı: harfleri değiştirip dene"
        className="flex shrink-0 items-end gap-8 rounded-[22px] px-3 py-2 hover:bg-[rgba(19,19,22,.08)] focus-visible:outline-3 focus-visible:outline-indigo"
      >
        <BigNumber label="Dönem ort." value={board.termGpa} />
        <BigNumber label="Genel ort." value={board.overallGpa} />
      </Link>
    </header>
  )
}

function BigNumber({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="x text-[56px] leading-[.9] font-black">{value === null ? '—' : formatDecimal(value)}</span>
      <span className="cx opacity-70">{label}</span>
    </div>
  )
}

export function ExamStrip({ exams, onAdd }: { exams: ExamCard[]; onAdd: () => void }) {
  const navigate = useNavigate()
  return (
    <section aria-label="Yaklaşan sınavlar" className="flex gap-3 overflow-x-auto pb-1">
      {exams.map((e) => {
        const urgent = examUrgent(e)
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => void navigate(`/okul/sinav/${e.id}`)}
            className={cn(
              'flex w-[260px] shrink-0 cursor-pointer flex-col gap-2 rounded-tile px-5 py-4 text-left',
              'transition-transform duration-[180ms] hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-indigo',
              urgent ? 'bg-coral text-white' : 'bg-s2 text-ink',
            )}
          >
            <span className="cx line-clamp-2 min-h-[34px]">
              {daysLeftText(e.daysLeft)} · {e.courseName} {e.title}
            </span>
            <span className="flex items-end gap-2">
              <span className="x text-[44px] leading-[.9] font-black">
                {e.readiness === null ? '—' : `%${e.readiness}`}
              </span>
              <span className="cx pb-1 opacity-80">hazır</span>
            </span>
            <span className={cn('text-[13px] font-semibold', urgent ? 'text-white/85' : 'text-ink3')}>
              {e.plannedMin
                ? `${formatMinutes(e.doneMin)} / ${formatMinutes(e.plannedMin)} çalışıldı`
                : e.topicCount
                  ? `${e.topicCount} konu · plan yok`
                  : 'Konu yok · kapsamı gir'}
            </span>
          </button>
        )
      })}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-[160px] shrink-0 cursor-pointer flex-col items-start justify-end gap-2 rounded-tile border-2 border-dashed border-line px-5 py-4 text-ink2 hover:bg-hover focus-visible:outline-3 focus-visible:outline-indigo"
      >
        <Plus size={20} strokeWidth={1.75} aria-hidden />
        <span className="cx">Sınav ekle</span>
      </button>
    </section>
  )
}

const ATT_CLASS = { none: '', ok: '', warn: 'bg-amber text-fill-ink', over: 'bg-coral text-white' } as const

export function GradeTable({ courses }: { courses: BoardCourse[] }) {
  const navigate = useNavigate()
  return (
    <section aria-label="Not durumu" className="flex flex-col gap-2 rounded-tile bg-s2 px-5 py-[18px]">
      <span className="cx">Not durumu</span>
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
              <td className="max-w-[180px] !pl-0">
                <span className="flex items-center gap-2 font-bold">
                  <span className="size-3 shrink-0 rounded-[4px]" style={{ background: c.tone }} />
                  <span className="truncate">{c.name}</span>
                </span>
              </td>
              <td className="x text-right">{c.credit ? formatScore(c.credit) : '—'}</td>
              <td className="x text-right font-bold">
                {c.score.current === null ? '—' : formatScore(c.score.current)}
              </td>
              <td className="x text-right font-black">
                {c.score.letter ?? '—'}
              </td>
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

export function DueList({
  items,
  now,
  onDone,
}: {
  items: BoardAssignment[]
  now: number
  onDone: (a: BoardAssignment) => void
}) {
  const navigate = useNavigate()
  return (
    <section aria-label="Bu hafta teslim" className="flex flex-col gap-2 rounded-tile bg-s2 px-5 py-[18px]">
      <span className="cx">Bu hafta teslim</span>
      {items.length === 0 ? (
        <span className="text-ink3">Bu hafta teslim yok.</span>
      ) : (
        items.map((a) => {
          const done = a.status === 'submitted' || a.status === 'graded'
          const late = !done && a.dueAt < now
          return (
            <div key={a.id} className="flex items-center gap-3">
              <button
                type="button"
                aria-label={done ? `${a.title}: teslim edildi` : `${a.title}: teslim ettim`}
                title={done ? 'Teslim edildi' : 'Teslim ettim'}
                disabled={done}
                onClick={() => onDone(a)}
                className={cn(
                  'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2',
                  done ? 'border-ink bg-ink text-on-ink' : 'border-ink3 hover:border-ink',
                )}
              >
                {done && <Check size={14} strokeWidth={3} aria-hidden />}
              </button>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.tone }} />
              <button
                type="button"
                onClick={() => void navigate(`/okul/ders/${a.courseId}/odevler`)}
                className={cn('min-w-0 grow cursor-pointer truncate text-left font-bold hover:underline', done && 'text-ink3 line-through')}
              >
                {a.title}
                <span className="ml-2 text-[13px] font-semibold text-ink3">{a.courseName}</span>
              </button>
              <span className={cn('x shrink-0 text-[13px] font-bold', late ? 'text-t-coral' : 'text-ink2')}>
                {late ? 'Gecikti · ' : ''}
                {format(a.dueAt, 'EEE HH:mm', { locale: tr })}
              </span>
            </div>
          )
        })
      )}
    </section>
  )
}

export function BoardActions({ onExam, onSettings }: { onExam: () => void; onSettings: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" icon={Plus} onClick={onExam}>
        Sınav
      </Button>
      <Button size="sm" variant="secondary" onClick={onSettings}>
        Dönem ayarları
      </Button>
    </div>
  )
}
