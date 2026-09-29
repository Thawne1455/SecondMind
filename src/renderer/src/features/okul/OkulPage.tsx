import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import type { AttendanceMark, WeekClass, WeekStudy } from '@shared/ipc'
import { TopBar } from '../../app/TopBar'
import { errorText } from '../../lib/errors'
import { useNow } from '../../lib/useNow'
import { EmptyState, ErrorState, Skeleton, useToast } from '../../ui'
import { BoardActions, DueList, ExamStrip, GradeTable, TermBand } from './Board'
import { ExamDialog } from './ExamDialog'
import { SetupWizard } from './SetupWizard'
import { useBoard, useSchoolWrite } from './useSchool'
import { WeekProgram } from './WeekProgram'

// Okul — "Bu dönem nasıl gidiyor, hangi sınav yaklaşıyor, şu an ne çalışmalıyım?"
// Ders kartı ızgarası değil, dönemin tamamını tek bakışta gösteren pano (OKUL.md):
// gök mavisi üst bant (hafta, ilerleme, ortalamalar) · sınav şeridi · solda dikey haftalık program,
// sağda not durumu tablosu ve bu hafta teslim.

export function OkulPage() {
  const board = useBoard()
  const [setupOpen, setSetupOpen] = useState(false)

  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-8">
      <TopBar title="Okul" />
      {board.isPending ? (
        <>
          <Skeleton shape="tile" className="h-[168px]" />
          <Skeleton shape="tile" className="h-[120px]" />
          <Skeleton shape="tile" className="h-[420px]" />
        </>
      ) : board.isError ? (
        <ErrorState title="Pano açılamadı" detail={errorText(board.error)} onRetry={() => void board.refetch()} />
      ) : !board.data.term ? (
        <EmptyState
          className="h-60 max-w-[640px]"
          title="Dönem tanımlanmadı"
          message="Derslerini ve programını gir, SecondMind haftanı kursun."
          action={{ label: 'Dönem oluştur', icon: Plus, onClick: () => setSetupOpen(true) }}
        />
      ) : (
        <BoardView />
      )}
      <SetupWizard open={setupOpen} onClose={() => setSetupOpen(false)} />
    </main>
  )
}

function BoardView() {
  const board = useBoard().data!
  const navigate = useNavigate()
  const now = new Date(useNow(60_000))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const { toast } = useToast()
  const [examOpen, setExamOpen] = useState(false)
  const attend = useSchoolWrite('attendance:set')
  const study = useSchoolWrite('study:setStatus')
  const assignment = useSchoolWrite('assignment:save')
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })

  function onAttendance(c: WeekClass, status: AttendanceMark | null) {
    attend.mutate({ slotId: c.slotId, day: c.day, status }, { onError })
  }
  function onStudy(s: WeekStudy) {
    study.mutate({ id: s.id, status: s.status === 'done' ? 'planned' : 'done' }, { onError })
  }

  return (
    <>
      <TermBand board={board} />
      <div className="flex items-center gap-3">
        <span className="cx grow">Yaklaşan sınavlar · {board.exams.length}</span>
        <BoardActions onExam={() => setExamOpen(true)} onSettings={() => void navigate('/ayarlar#okul')} />
      </div>
      <ExamStrip exams={board.exams} onAdd={() => setExamOpen(true)} />
      {board.courses.length === 0 ? (
        <EmptyState
          className="h-48 max-w-[640px]"
          title="Bu dönemde ders yok"
          message="Ayarlar > Okul'dan ders ve programını ekle."
          action={{ label: 'Ayarlara git', onClick: () => void navigate('/ayarlar#okul') }}
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(420px,1fr)] items-start gap-5">
          <WeekProgram
            weekStart={board.weekStart}
            today={board.today}
            nowMin={nowMin}
            classes={board.classes}
            study={board.study}
            exams={board.exams}
            onAttendance={onAttendance}
            onStudy={onStudy}
            onCourse={(id) => void navigate(`/okul/ders/${id}`)}
          />
          <div className="flex flex-col gap-5">
            <GradeTable courses={board.courses} />
            <DueList
              items={board.dueThisWeek}
              now={now.getTime()}
              onDone={(a) =>
                assignment.mutate(
                  { id: a.id, courseId: a.courseId, title: a.title, dueAt: a.dueAt, status: 'submitted' },
                  {
                    onSuccess: () => toast({ message: `${a.title} teslim edildi.`, domain: 'school' }),
                    onError,
                  },
                )
              }
            />
          </div>
        </div>
      )}
      <ExamDialog
        open={examOpen}
        onClose={() => setExamOpen(false)}
        courses={board.courses}
        onSaved={(id) => void navigate(`/okul/sinav/${id}`)}
      />
    </>
  )
}
