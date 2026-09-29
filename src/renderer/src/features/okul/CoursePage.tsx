import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import type { CourseDetail } from '@shared/ipc'
import { TopBar } from '../../app/TopBar'
import { errorText } from '../../lib/errors'
import { Chip, EmptyState, ErrorState, IconButton, Menu, Skeleton, useToast } from '../../ui'
import { AssignmentsTab, AttendanceTab, InstructorTab } from './CourseTabs'
import { CourseDialog } from './CourseDialog'
import { GradesTab } from './GradesTab'
import { attendanceText, clock, formatScore, WEEKDAY_SHORT } from './schoolText'
import { useCourse, useSchoolWrite } from './useSchool'
import { WeekTab } from './WeekTab'

// Ders detayı: dersin tonunda ders bandı (ad, kod, kredi, derslik ve saatler, hoca; sağda puan · devamsızlık ·
// sıradaki sınava kalan gün) ve sekmeler: Hafta hafta, Sınavlar ve notlar, Hoca, Ödevler, Devamsızlık (Ctrl 1–5).
// Projeler'in sekmelerinden farkı: kanban, yol haritası, doküman ağacı yok; hafta, not, devam var.

type Tab = 'week' | 'grades' | 'instructor' | 'assignments' | 'attendance'

const TABS: { id: Tab; path: string; label: string }[] = [
  { id: 'week', path: '', label: 'Hafta hafta' },
  { id: 'grades', path: 'sinavlar', label: 'Sınavlar ve notlar' },
  { id: 'instructor', path: 'hoca', label: 'Hoca' },
  { id: 'assignments', path: 'odevler', label: 'Ödevler' },
  { id: 'attendance', path: 'devamsizlik', label: 'Devamsızlık' },
]

export function CoursePage() {
  const { courseId, tab: tabPath = '' } = useParams()
  const course = useCourse(courseId)

  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-8">
      <TopBar title="Okul" />
      {course.isPending ? (
        <>
          <Skeleton shape="tile" className="h-[168px]" />
          <Skeleton shape="tile" className="h-[420px]" />
        </>
      ) : course.isError ? (
        <ErrorState title="Ders açılamadı" detail={errorText(course.error)} onRetry={() => void course.refetch()} />
      ) : !course.data ? (
        <EmptyState
          className="h-60 max-w-[640px]"
          title="Ders bulunamadı"
          message="Silinmiş olabilir."
          action={{ label: "Okul'a dön", icon: ArrowLeft, onClick: () => history.back() }}
        />
      ) : (
        <CourseView detail={course.data} tab={TABS.find((t) => t.path === tabPath)?.id ?? 'week'} />
      )}
    </main>
  )
}

function CourseView({ detail, tab }: { detail: CourseDetail; tab: Tab }) {
  const navigate = useNavigate()
  const base = `/okul/ders/${detail.course.id}`

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return
      const next = TABS[Number(e.key) - 1]
      if (!next) return
      e.preventDefault()
      void navigate(next.path ? `${base}/${next.path}` : base)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [base, navigate])

  const open = detail.assignments.filter((a) => a.status === 'todo' || a.status === 'doing').length
  const labels: Record<Tab, string> = {
    week: 'Hafta hafta',
    grades: detail.exams.length ? `Sınavlar ve notlar · ${detail.exams.length}` : 'Sınavlar ve notlar',
    instructor: 'Hoca',
    assignments: open ? `Ödevler · ${open}` : 'Ödevler',
    attendance: 'Devamsızlık',
  }

  return (
    <>
      <CourseBand detail={detail} />
      <nav aria-label="Ders sekmeleri" className="flex items-center gap-2">
        {TABS.map((t, i) => (
          <Chip
            key={t.id}
            selected={tab === t.id}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => void navigate(t.path ? `${base}/${t.path}` : base)}
          >
            {labels[t.id]}
            <span className="ml-2 text-[12px] font-semibold opacity-50">Ctrl {i + 1}</span>
          </Chip>
        ))}
      </nav>
      {tab === 'week' ? (
        <WeekTab key={detail.course.id} detail={detail} />
      ) : tab === 'grades' ? (
        <GradesTab key={detail.course.id} detail={detail} />
      ) : tab === 'instructor' ? (
        <InstructorTab key={`${detail.course.id}:${detail.instructor?.id}`} detail={detail} />
      ) : tab === 'assignments' ? (
        <AssignmentsTab detail={detail} />
      ) : (
        <AttendanceTab detail={detail} />
      )}
    </>
  )
}

function CourseBand({ detail }: { detail: CourseDetail }) {
  const c = detail.course
  const navigate = useNavigate()
  const { toast } = useToast()
  const remove = useSchoolWrite('school:delete')
  const restore = useSchoolWrite('school:restore')
  const [editing, setEditing] = useState(false)
  const slots = c.slots
    .map((s) => `${WEEKDAY_SHORT[s.weekday - 1]} ${clock(s.startMin)}${s.room && s.room !== c.room ? ` ${s.room}` : ''}`)
    .join(' · ')

  return (
    <header
      className="flex min-h-[168px] items-stretch gap-8 rounded-tile px-8 pt-5 pb-6 text-fill-ink"
      style={{ backgroundColor: c.tone }}
    >
      <div className="flex min-w-0 grow flex-col justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/okul"
            className="cx flex items-center gap-1.5 rounded-full opacity-70 hover:opacity-100 focus-visible:outline-3 focus-visible:outline-indigo"
          >
            <ArrowLeft size={16} strokeWidth={2} aria-hidden /> Okul
          </Link>
          <span className="cx opacity-70">· {detail.term.name}</span>
          {detail.readOnly && (
            <span className="cx rounded-full bg-fill-ink px-3 py-0.5 text-white">Arşiv</span>
          )}
        </div>
        <h2 className="x m-0 truncate text-[44px] leading-[.95] font-black uppercase">{c.name}</h2>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] font-bold">
          {c.code && <span>{c.code}</span>}
          {c.credit > 0 && <span>{formatScore(c.credit)} kredi</span>}
          {c.room && <span>{c.room}</span>}
          {slots && <span className="x">{slots}</span>}
          {detail.instructor && <span>{detail.instructor.name}</span>}
        </span>
      </div>
      <div className="flex shrink-0 items-end gap-8">
        <BandNumber label={detail.score.letter ? `Puan · ${detail.score.letter}` : 'Puan'} value={detail.score.current === null ? '—' : formatScore(detail.score.current)} />
        <BandNumber
          label="Devamsızlık"
          value={attendanceText(detail.attendance)}
          warn={detail.attendance.state === 'warn' || detail.attendance.state === 'over'}
        />
        <BandNumber
          label="Sıradaki sınav"
          value={detail.nextExamDays === null ? '—' : detail.nextExamDays === 0 ? 'Bugün' : `${detail.nextExamDays} gün`}
        />
      </div>
      <div className="flex shrink-0 flex-col">
        <Menu
          align="end"
          label="Ders menüsü"
          items={[
            { id: 'edit', label: 'Ders ayarları', description: 'Program, hoca, devam sınırı, harfler' },
            { id: 'delete', label: 'Çöp kutusuna at' },
          ]}
          onSelect={(id) => {
            if (id === 'edit') setEditing(true)
            else
              remove.mutate(
                { table: 'courses', id: c.id },
                {
                  onSuccess: () => {
                    void navigate('/okul')
                    toast({
                      message: `${c.name} çöp kutusunda.`,
                      domain: 'school',
                      action: { label: 'Geri al', onClick: () => restore.mutate({ table: 'courses', id: c.id }) },
                    })
                  },
                  onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
                },
              )
          }}
          className="w-[280px]"
          trigger={(props) => <IconButton label="Ders menüsü" icon={MoreHorizontal} variant="onTileGhost" {...props} />}
        />
      </div>
      <CourseDialog
        open={editing}
        onClose={() => setEditing(false)}
        termId={c.termId}
        course={c}
        instructorName={detail.instructor?.name ?? ''}
      />
    </header>
  )
}

function BandNumber({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`x text-[44px] leading-[.9] font-black ${warn ? 'rounded-xl bg-coral px-2 text-white' : ''}`}>
        {value}
      </span>
      <span className="cx opacity-70">{label}</span>
    </div>
  )
}
