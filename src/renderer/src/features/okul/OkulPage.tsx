import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import type { AttendanceMark, BoardAssignment, WeekClass, WeekStudy } from '@shared/ipc'
import { TopBar } from '../../app/TopBar'
import { errorText } from '../../lib/errors'
import { useNow } from '../../lib/useNow'
import { Button, EmptyState, ErrorState, Modal, Skeleton, useToast } from '../../ui'
import { CourseShelf, SoonStrip, TermBand } from './Board'
import { ExamDialog } from './ExamDialog'
import { SetupWizard } from './SetupWizard'
import { useBoard, useSchoolWrite } from './useSchool'
import { WeekProgram } from './WeekProgram'

// Okul — "Bu dönem nasıl gidiyor, hangi sınav yaklaşıyor, şu an ne çalışmalıyım?"
// Pano (OKUL.md, 2026-09-30 yeniden düzen): ince gök mavisi üst bant (hafta, ilerleme, ortalamalar, Haftalık program
// modalı) · Bugün / Yarın / Yaklaşan şeridi (dersler + yoklama, çalışma blokları, sınav ve teslimler) ·
// ders defterleri (her ders bir satır, 14 hafta karesi: tıklayınca dersin o haftası). Not tablosu Notlar ekranında.

export function OkulPage() {
  const board = useBoard()
  const [setupOpen, setSetupOpen] = useState(false)

  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-8">
      <TopBar title="Okul" />
      {board.isPending ? (
        <>
          <Skeleton shape="tile" className="h-[104px]" />
          <Skeleton shape="tile" className="h-[160px]" />
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
  const [programOpen, setProgramOpen] = useState(false)
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
  function onDone(a: BoardAssignment) {
    assignment.mutate(
      { id: a.id, courseId: a.courseId, title: a.title, dueAt: a.dueAt, status: 'submitted' },
      { onSuccess: () => toast({ message: `${a.title} teslim edildi.`, domain: 'school' }), onError },
    )
  }

  return (
    <>
      <TermBand board={board} onProgram={() => setProgramOpen(true)} />
      {board.courses.length === 0 ? (
        <EmptyState
          className="h-48 max-w-[640px]"
          title="Bu dönemde ders yok"
          message="Ayarlar > Okul'dan ders ve programını ekle."
          action={{ label: 'Ayarlara git', onClick: () => void navigate('/ayarlar#okul') }}
        />
      ) : (
        <>
          <SoonStrip
            board={board}
            nowMin={nowMin}
            now={now.getTime()}
            onAttendance={onAttendance}
            onStudy={onStudy}
            onDone={onDone}
          />
          <div className="flex items-center gap-3 pt-2">
            <span className="cx">Ders defterleri · {board.courses.length}</span>
            <span className="grow text-[13px] font-semibold text-ink3">
              Kare bir hafta: renkli = içerik var, mercan = anlamadım. Tıkla, o haftaya git.
            </span>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setExamOpen(true)}>
              Sınav
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void navigate('/ayarlar#okul')}>
              Dönem ayarları
            </Button>
          </div>
          <CourseShelf board={board} nowMin={nowMin} />
        </>
      )}
      <Modal
        open={programOpen}
        onClose={() => setProgramOpen(false)}
        title="Haftalık program"
        domain="school"
        width={1100}
      >
        <WeekProgram
          weekStart={board.weekStart}
          today={board.today}
          nowMin={nowMin}
          classes={board.classes}
          study={board.study}
          exams={board.exams}
          onAttendance={onAttendance}
          onStudy={onStudy}
          onCourse={(id) => {
            setProgramOpen(false)
            void navigate(`/okul/ders/${id}`)
          }}
        />
      </Modal>
      <ExamDialog
        open={examOpen}
        onClose={() => setExamOpen(false)}
        courses={board.courses}
        onSaved={(id) => void navigate(`/okul/sinav/${id}`)}
      />
    </>
  )
}
