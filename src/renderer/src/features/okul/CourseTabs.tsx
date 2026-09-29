import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Plus, Trash2 } from 'lucide-react'
import type { Assignment, AssignmentStatus, AttendanceMark, CourseDetail } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { useNow } from '../../lib/useNow'
import { Button, cn, Field, IconButton, Input, Select, Textarea, useToast } from '../../ui'
import { attendanceText, clock } from './schoolText'
import { useSchoolWrite } from './useSchool'

// Ders detayının küçük sekmeleri: Hoca, Ödevler (liste, kanban değil), Devamsızlık.

// ---------------------------------------------------------------- Hoca

export function InstructorTab({ detail }: { detail: CourseDetail }) {
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const save = useSchoolWrite('instructor:save')
  const addNote = useSchoolWrite('instructorNote:add')
  const remove = useSchoolWrite('school:delete')
  const restore = useSchoolWrite('school:restore')
  const i = detail.instructor
  const [form, setForm] = useState({
    name: i?.name ?? '',
    email: i?.email ?? '',
    room: i?.room ?? '',
    officeHours: i?.officeHours ?? '',
  })
  const [note, setNote] = useState('')
  const ro = detail.readOnly
  const dirty =
    form.name.trim() &&
    (form.name !== (i?.name ?? '') ||
      form.email !== (i?.email ?? '') ||
      form.room !== (i?.room ?? '') ||
      form.officeHours !== (i?.officeHours ?? ''))
  const openFlags = detail.flags.filter((f) => !f.resolved)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-6">
      <section aria-label="Hoca kartı" className="flex flex-col gap-4 rounded-tile bg-s2 px-5 py-[18px]">
        <span className="cx">Hoca</span>
        <Field label="Ad">
          <Input value={form.name} disabled={ro} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="E-posta" optional>
          <Input
            type="email"
            value={form.email}
            disabled={ro}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Oda" optional>
            <Input value={form.room} disabled={ro} onChange={(e) => setForm({ ...form, room: e.target.value })} />
          </Field>
          <Field label="Ofis saatleri" optional>
            <Input
              value={form.officeHours}
              disabled={ro}
              placeholder="Sal 14-16"
              onChange={(e) => setForm({ ...form, officeHours: e.target.value })}
            />
          </Field>
        </div>
        {!ro && (
          <div>
            <Button
              size="sm"
              disabled={!dirty}
              loading={save.isPending}
              onClick={() =>
                save.mutate(
                  { id: i?.id, courseId: i ? undefined : detail.course.id, ...form },
                  { onSuccess: () => toast({ message: 'Hoca kaydedildi.', domain: 'school' }), onError },
                )
              }
            >
              Kaydet
            </Button>
          </div>
        )}
        {i?.email && (
          <a className="font-bold text-indigo underline" href={`mailto:${i.email}`}>
            E-posta yaz
          </a>
        )}
      </section>

      <div className="flex flex-col gap-5">
        <section aria-label="Hoca notları" className="flex flex-col gap-3">
          <span className="cx">Hoca notları · sınav tarzı, vurguladıkları, devam ve ödev kuralları</span>
          {!ro && i && (
            <form
              className="flex items-start gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!note.trim()) return
                addNote.mutate({ courseId: detail.course.id, text: note }, { onSuccess: () => setNote(''), onError })
              }}
            >
              <Textarea
                rows={2}
                value={note}
                placeholder="İspat soruyor, test yok. Geç teslime %10 kesiyor."
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    e.currentTarget.form?.requestSubmit()
                  }
                }}
              />
              <Button type="submit" icon={Plus} loading={addNote.isPending}>
                Ekle
              </Button>
            </form>
          )}
          {!i && <span className="text-ink2">Önce hocanın adını gir; notlar hocanın bütün derslerinde görünür.</span>}
          {detail.instructorNotes.map((n) => (
            <div key={n.id} className="flex items-start gap-3 rounded-[20px] bg-s2 px-4 py-3">
              <span className="x shrink-0 pt-0.5 text-[13px] font-bold text-ink3">
                {format(parseISO(n.day), 'd MMM', { locale: tr })}
              </span>
              <span className="grow whitespace-pre-wrap">
                {n.text}
                {n.courseId !== detail.course.id && n.courseName && (
                  <span className="ml-2 text-[13px] font-semibold text-ink3">· {n.courseName}</span>
                )}
              </span>
              {!ro && (
                <IconButton
                  label="Notu sil"
                  icon={Trash2}
                  onClick={() =>
                    remove.mutate(
                      { table: 'instructor_notes', id: n.id },
                      {
                        onSuccess: () =>
                          toast({
                            message: 'Not silindi.',
                            domain: 'school',
                            action: {
                              label: 'Geri al',
                              onClick: () => restore.mutate({ table: 'instructor_notes', id: n.id }),
                            },
                          }),
                        onError,
                      },
                    )
                  }
                />
              )}
            </div>
          ))}
        </section>

        <section aria-label="Hocaya sor" className="flex flex-col gap-2 rounded-tile bg-sky px-5 py-[18px] text-fill-ink">
          <span className="cx">Hocaya sor · {openFlags.length}</span>
          {openFlags.length === 0 ? (
            <span className="font-semibold opacity-75">
              Hafta notlarında "Anlamadım" dediğin yerler burada toplanır.
            </span>
          ) : (
            openFlags.map((f) => (
              <span key={f.id} className="flex items-start gap-3">
                <span className="x shrink-0 font-black">{f.weekNo}.</span>
                <span className="grow font-semibold">{f.excerpt}</span>
                {!ro && (
                  <IconButton
                    label="İşareti sil"
                    icon={Trash2}
                    variant="onTileGhost"
                    className="size-7"
                    onClick={() =>
                      remove.mutate(
                        { table: 'note_flags', id: f.id },
                        {
                          onSuccess: () =>
                            toast({
                              message: 'İşaret silindi.',
                              domain: 'school',
                              action: { label: 'Geri al', onClick: () => restore.mutate({ table: 'note_flags', id: f.id }) },
                            }),
                          onError,
                        },
                      )
                    }
                  />
                )}
              </span>
            ))
          )}
          {i?.officeHours && <span className="text-[13px] font-bold opacity-75">Ofis saatleri: {i.officeHours}</span>}
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Ödevler

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  todo: 'Başlanmadı',
  doing: 'Devam',
  submitted: 'Teslim edildi',
  graded: 'Notlandı',
}

const toLocalInput = (ms: number) => format(ms, "yyyy-MM-dd'T'HH:mm")

export function AssignmentsTab({ detail }: { detail: CourseDetail }) {
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const save = useSchoolWrite('assignment:save')
  const remove = useSchoolWrite('school:delete')
  const restore = useSchoolWrite('school:restore')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const ro = detail.readOnly
  const now = useNow(60_000)
  const base = (a: Assignment) => ({ id: a.id, courseId: a.courseId, title: a.title, dueAt: a.dueAt })

  function add() {
    if (!title.trim() || !due) return
    const dueAt = new Date(due).getTime()
    save.mutate(
      { courseId: detail.course.id, title, dueAt, weekNo: weekOf(detail, dueAt) },
      {
        onSuccess: () => {
          setTitle('')
          setDue('')
          toast({
            message:
              dueAt - now > 48 * 3600_000 ? 'Ödev eklendi · 2 gün kala hatırlatılacak.' : 'Ödev eklendi.',
            domain: 'school',
          })
        },
        onError,
      },
    )
  }

  return (
    <section aria-label="Ödevler" className="flex max-w-[980px] flex-col gap-3">
      {!ro && (
        <form
          className="grid grid-cols-[1fr_230px_auto] items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Field label="Ödev">
            <Input value={title} maxLength={200} placeholder="Bağlı liste uygulaması" onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Son teslim">
            <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} strong />
          </Field>
          <Button type="submit" icon={Plus} disabled={!title.trim() || !due} loading={save.isPending}>
            Ekle
          </Button>
        </form>
      )}
      {detail.assignments.length === 0 && <span className="text-ink2">Ödev yok.</span>}
      {detail.assignments.map((a) => {
        const open = a.status === 'todo' || a.status === 'doing'
        const late = open && a.dueAt < now
        return (
          <div key={a.id} className="grid grid-cols-[150px_1fr_190px_90px_34px] items-center gap-3 rounded-[20px] bg-s2 px-4 py-2.5">
            <Select
              aria-label="Durum"
              disabled={ro}
              value={a.status}
              onChange={(e) => save.mutate({ ...base(a), status: e.target.value as AssignmentStatus }, { onError })}
              className={cn('h-[36px] text-[14px]', !open && 'bg-ink text-on-ink')}
            >
              {Object.entries(STATUS_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
            <span className={cn('truncate font-bold', !open && 'text-ink3')}>
              {a.title}
              {a.weekNo && <span className="ml-2 text-[13px] font-semibold text-ink3">{a.weekNo}. hafta</span>}
            </span>
            <input
              type="datetime-local"
              aria-label="Son teslim"
              disabled={ro}
              defaultValue={toLocalInput(a.dueAt)}
              onBlur={(e) => {
                const t = new Date(e.target.value).getTime()
                if (!Number.isNaN(t) && t !== a.dueAt) save.mutate({ ...base(a), dueAt: t }, { onError })
              }}
              className={cn('x rounded-lg bg-transparent px-1 text-[14px] font-bold', late && 'text-t-coral')}
            />
            <Input
              aria-label="Puan"
              inputMode="decimal"
              placeholder="Puan"
              disabled={ro}
              defaultValue={a.score ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim().replace(',', '.')
                const n = v === '' ? null : Number(v)
                if (n !== null && (Number.isNaN(n) || n < 0 || n > 100)) return
                if (n !== a.score) save.mutate({ ...base(a), score: n }, { onError })
              }}
              className="x h-[36px] text-right"
              strong
            />
            {!ro ? (
              <IconButton
                label="Ödevi sil"
                icon={Trash2}
                onClick={() =>
                  remove.mutate(
                    { table: 'assignments', id: a.id },
                    {
                      onSuccess: () =>
                        toast({
                          message: `${a.title} silindi.`,
                          domain: 'school',
                          action: { label: 'Geri al', onClick: () => restore.mutate({ table: 'assignments', id: a.id }) },
                        }),
                      onError,
                    },
                  )
                }
              />
            ) : (
              <span />
            )}
          </div>
        )
      })}
    </section>
  )
}

/** Son teslimin düştüğü dönem haftası. */
function weekOf(detail: CourseDetail, ms: number): number | null {
  const day = format(ms, 'yyyy-MM-dd')
  return detail.weeks.find((w) => day >= w.start && day <= w.end)?.weekNo ?? null
}

// ---------------------------------------------------------------- Devamsızlık

const MARKS: { id: AttendanceMark; label: string }[] = [
  { id: 'present', label: 'Katıldım' },
  { id: 'absent', label: 'Katılmadım' },
  { id: 'cancelled', label: 'İptal' },
]

export function AttendanceTab({ detail }: { detail: CourseDetail }) {
  const { toast } = useToast()
  const set = useSchoolWrite('attendance:set')
  const a = detail.attendance
  const ro = detail.readOnly
  const [showFuture, setShowFuture] = useState(false)
  const sessions = detail.sessions.filter((s) => showFuture || s.past)
  const unmarked = detail.sessions.filter((s) => s.past && s.status === null).length
  const limitText = detail.course.attendanceLimit
    ? detail.course.attendanceLimit.kind === 'percent'
      ? `%${detail.course.attendanceLimit.value} (${a.limit} ders saati)`
      : `${a.limit} ders saati`
    : 'Sınır yok'

  return (
    <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-6">
      <section
        aria-label="Kalan hak"
        className={cn(
          'flex flex-col gap-2 rounded-tile px-5 py-[18px]',
          a.state === 'over' ? 'bg-coral text-white' : a.state === 'warn' ? 'bg-amber text-fill-ink' : 'bg-sky text-fill-ink',
        )}
      >
        <span className="cx">Kalan hak</span>
        <span className="x text-[64px] leading-[.9] font-black">
          {a.remaining === null ? '∞' : Math.max(a.remaining, 0)}
        </span>
        <span className="font-bold">
          {a.state === 'over' ? `Sınır ${-(a.remaining ?? 0)} ders saati aşıldı` : 'ders saati'}
        </span>
        <span className="text-[13px] font-semibold opacity-80">
          Kullanılan {attendanceText(a)} · sınır {limitText}
        </span>
        {unmarked > 0 && (
          <span className="text-[13px] font-bold">{unmarked} geçmiş ders işaretlenmedi.</span>
        )}
      </section>
      <section aria-label="Oturumlar" className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="cx grow">Oturumlar</span>
          <Button size="sm" variant="secondary" onClick={() => setShowFuture((v) => !v)}>
            {showFuture ? 'Sadece geçmiş' : 'Gelecekleri de göster'}
          </Button>
        </div>
        {sessions.length === 0 && <span className="text-ink2">Henüz geçmiş ders yok.</span>}
        {[...sessions].reverse().map((s) => (
          <div key={`${s.slotId}|${s.day}`} className={cn('flex items-center gap-3 rounded-2xl px-3 py-1.5', !s.past && 'opacity-60')}>
            <span className="x w-[150px] shrink-0 text-[14px] font-bold">
              {format(parseISO(s.day), 'd MMM EEE', { locale: tr })}
            </span>
            <span className="x w-[110px] shrink-0 text-[13px] font-semibold text-ink3">
              {clock(s.startMin)}–{clock(s.endMin)}
            </span>
            <div className="flex gap-1.5">
              {MARKS.filter((m) => s.past || m.id === 'cancelled').map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={ro}
                  aria-pressed={s.status === m.id}
                  onClick={() =>
                    set.mutate(
                      { slotId: s.slotId, day: s.day, status: s.status === m.id ? null : m.id },
                      { onError: (e) => toast({ message: errorText(e), domain: 'warning' }) },
                    )
                  }
                  className={cn(
                    'h-[30px] cursor-pointer rounded-full px-3 text-[13px] font-bold transition-colors',
                    s.status === m.id
                      ? m.id === 'absent'
                        ? 'bg-coral text-white'
                        : 'bg-ink text-on-ink'
                      : 'bg-s2 hover:bg-s3',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
