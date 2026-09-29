import { useState } from 'react'
import type { CourseDetail, ExamSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, Field, Input, Modal, Select, useToast } from '../../ui'
import { clock } from './schoolText'
import { useCourse, useSchoolWrite } from './useSchool'

// Sınav ekle / düzenle: ders, bileşen (Vize, Final…), tarih, saat, yer ve kapsam (hafta aralığı; o haftaların
// konuları, sonradan eklenenler dahil, sınava girer). Konu tek tek sınav hazırlık ekranında eklenip çıkarılır.

type Props = {
  open: boolean
  onClose: () => void
  /** Dersi sabit (ders sayfasından). Verilmezse listeden seçilir. */
  courseId?: string
  courses?: { id: string; name: string }[]
  exam?: ExamSummary
  onSaved?: (id: string) => void
}

export function ExamDialog(props: Props) {
  // Her açılışta alanlar baştan kurulsun.
  return props.open ? <ExamForm {...props} /> : null
}

function ExamForm({ open, onClose, courseId: fixed, courses = [], exam, onSaved }: Props) {
  const [courseId, setCourseId] = useState(fixed ?? courses[0]?.id ?? '')
  const detail = useCourse(courseId || undefined).data
  return (
    <Modal open={open} onClose={onClose} domain="school" width={640} title={exam ? 'Sınavı düzenle' : 'Sınav ekle'}>
      {!fixed && (
        <Field label="Ders">
          <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {detail ? (
        <ExamFields key={detail.course.id} detail={detail} exam={exam} onClose={onClose} onSaved={onSaved} />
      ) : (
        <span className="text-ink3">{courseId ? 'Ders yükleniyor…' : 'Önce ders ekle.'}</span>
      )}
    </Modal>
  )
}

function ExamFields({
  detail,
  exam,
  onClose,
  onSaved,
}: {
  detail: CourseDetail
  exam?: ExamSummary
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { toast } = useToast()
  const save = useSchoolWrite('exam:save')
  const comps = detail.components.filter((c) => c.kind === 'midterm' || c.kind === 'final' || c.kind === 'quiz')
  const defaultComp =
    exam?.componentId ??
    comps.find((c) => !detail.exams.some((e) => e.componentId === c.id))?.id ??
    comps[0]?.id ??
    ''
  const [componentId, setComponentId] = useState(defaultComp)
  const [title, setTitle] = useState(
    exam?.title ?? detail.components.find((c) => c.id === defaultComp)?.name ?? 'Vize',
  )
  const [day, setDay] = useState(exam?.day ?? '')
  const [time, setTime] = useState(exam?.startMin != null ? clock(exam.startMin) : '')
  const [place, setPlace] = useState(exam?.place ?? detail.course.room)
  const weeksWithTopics = detail.weeks.filter((w) => w.topics.length)
  const [fromWeek, setFromWeek] = useState(String(exam?.weekFrom ?? 1))
  const [toWeek, setToWeek] = useState(
    String(exam?.weekTo ?? Math.max(1, Math.min(detail.currentWeek, detail.term.weekCount))),
  )

  function submit() {
    const [h, m] = time.split(':').map(Number)
    save.mutate(
      {
        id: exam?.id,
        courseId: detail.course.id,
        title: title.trim() || 'Sınav',
        day,
        startMin: time ? h! * 60 + m! : null,
        place,
        componentId: componentId || null,
        // Düzenlerken kapsam sadece değiştiyse yeniden yazılır (tek tek eklenenler korunur).
        ...((!exam || String(exam.weekFrom) !== fromWeek || String(exam.weekTo) !== toWeek) && {
          weekFrom: Number(fromWeek),
          weekTo: Number(toWeek),
        }),
      },
      {
        onSuccess: ({ id }) => {
          toast({ message: `${detail.course.name} · ${title} kaydedildi.`, domain: 'school' })
          onSaved?.(id)
          onClose()
        },
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
    )
  }

  const weekOptions = detail.weeks.map((w) => (
    <option key={w.weekNo} value={w.weekNo}>
      {w.weekNo}. hafta{w.title ? ` · ${w.title}` : ''}
    </option>
  ))

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Not bileşeni" hint="Puan girilince bu bileşene yazılır">
          <Select
            value={componentId}
            onChange={(e) => {
              setComponentId(e.target.value)
              const c = detail.components.find((x) => x.id === e.target.value)
              if (c) setTitle(c.name)
            }}
          >
            <option value="">Bağlı değil</option>
            {detail.components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · %{c.weight}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ad">
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Tarih">
          <Input data-autofocus type="date" value={day} onChange={(e) => setDay(e.target.value)} strong />
        </Field>
        <Field label="Saat" optional>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} strong />
        </Field>
        <Field label="Yer" optional className="col-span-2">
          <Input value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} />
        </Field>
        <Field
          label="Kapsam: ilk hafta"
          hint={weeksWithTopics.length ? undefined : 'Henüz konu yok; hafta defterine konu ekledikçe sınava girer.'}
        >
          <Select value={fromWeek} onChange={(e) => setFromWeek(e.target.value)}>
            {weekOptions}
          </Select>
        </Field>
        <Field label="Son hafta">
          <Select value={toWeek} onChange={(e) => setToWeek(e.target.value)}>
            {weekOptions}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={submit} disabled={!/^\d{4}-\d{2}-\d{2}$/.test(day)} loading={save.isPending}>
          Kaydet
        </Button>
      </div>
    </>
  )
}
