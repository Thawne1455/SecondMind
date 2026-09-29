import { useState } from 'react'
import { useNavigate } from 'react-router'
import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { ComponentKind, CourseDetail, ExamSummary, GradeComponent } from '@shared/ipc'
import {
  DEFAULT_LETTER_TABLE,
  letterFor,
  projectedScore,
  requiredScores,
  type LetterRow,
} from '@shared/school/grades'
import { errorText } from '../../lib/errors'
import { Button, Chip, cn, IconButton, Input, Select, Textarea, useToast } from '../../ui'
import { ExamDialog } from './ExamDialog'
import { clock, COMPONENT_KIND_LABEL, daysLeftText, formatScore, requiredText } from './schoolText'
import { useSchoolWrite } from './useSchool'

// Ders detayı > Sınavlar ve notlar: değerlendirme şeması ve alınan notlar (girildikçe puan ve harf anında
// değişir), hedef hesaplayıcı ("Hedef harf: BB" → kalanlarda en az kaç), "Finalden 60 alırsam?" kaydırıcısı,
// harf aralıkları ve sınav kartları (geçenlerde puan ve sınav sonrası analiz). Hesap `shared/school/grades`.

export function GradesTab({ detail }: { detail: CourseDetail }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(360px,1fr)] items-start gap-6">
      <div className="flex flex-col gap-5">
        <Scheme detail={detail} />
        <TargetCalculator detail={detail} />
      </div>
      <ExamCards detail={detail} />
    </div>
  )
}

function Scheme({ detail }: { detail: CourseDetail }) {
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const setGrade = useSchoolWrite('grade:set')
  const save = useSchoolWrite('component:save')
  const remove = useSchoolWrite('school:delete')
  const restore = useSchoolWrite('school:restore')
  const ro = detail.readOnly
  const total = detail.components.reduce((n, c) => n + c.weight, 0)
  const s = detail.score

  return (
    <section aria-label="Değerlendirme" className="flex flex-col gap-3 rounded-tile bg-s2 px-5 py-[18px]">
      <div className="flex items-end gap-6">
        <span className="cx grow">Değerlendirme ve notlar</span>
        <Stat label="Gidişat" value={s.current === null ? '—' : formatScore(s.current)} />
        <Stat label={s.letterManual ? 'Harf' : 'Harf tahmini'} value={s.letter ?? '—'} />
      </div>
      {detail.components.length === 0 && (
        <span className="text-ink2">Bileşen yok. Vize, Final, Ödevler… ve ağırlıklarını ekle.</span>
      )}
      {detail.components.map((c) => (
        <ComponentRow
          key={c.id}
          c={c}
          ro={ro}
          onScore={(score) => setGrade.mutate({ componentId: c.id, score }, { onError })}
          onSave={(p) => save.mutate({ id: c.id, courseId: detail.course.id, ...p }, { onError })}
          onDelete={() =>
            remove.mutate(
              { table: 'grade_components', id: c.id },
              {
                onSuccess: () =>
                  toast({
                    message: `${c.name} silindi.`,
                    domain: 'school',
                    action: { label: 'Geri al', onClick: () => restore.mutate({ table: 'grade_components', id: c.id }) },
                  }),
                onError,
              },
            )
          }
        />
      ))}
      <div className="flex items-center gap-3">
        {!ro && (
          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            onClick={() =>
              save.mutate(
                { courseId: detail.course.id, name: 'Quiz', kind: 'quiz', weight: Math.max(0, 100 - total) },
                { onError },
              )
            }
          >
            Bileşen
          </Button>
        )}
        <span className="grow" />
        <span className={cn('x text-[13px] font-bold', total !== 100 ? 'text-t-coral' : 'text-ink3')}>
          Toplam %{formatScore(total)}
          {total !== 100 && ' · 100 değil'}
        </span>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col items-end">
      <span className="x text-[34px] leading-none font-black">{value}</span>
      <span className="cx text-[12px] text-ink3">{label}</span>
    </span>
  )
}

function ComponentRow({
  c,
  ro,
  onScore,
  onSave,
  onDelete,
}: {
  c: GradeComponent
  ro: boolean
  onScore: (score: number | null) => void
  onSave: (p: { name: string; kind: ComponentKind; weight: number }) => void
  onDelete: () => void
}) {
  const [score, setScore] = useState(c.score === null ? '' : String(c.score))
  const [name, setName] = useState(c.name)
  const [weight, setWeight] = useState(String(c.weight))

  function commitScore() {
    const t = score.trim().replace(',', '.')
    const n = t === '' ? null : Number(t)
    if (n !== null && (Number.isNaN(n) || n < 0 || n > 100)) return setScore(c.score === null ? '' : String(c.score))
    if (n !== c.score) onScore(n)
  }
  function commitMeta(kind = c.kind) {
    const w = Number(weight.replace(',', '.'))
    if (!name.trim() || Number.isNaN(w) || w < 0 || w > 100) return
    if (name.trim() !== c.name || w !== c.weight || kind !== c.kind) onSave({ name: name.trim(), kind, weight: w })
  }

  return (
    <div className="grid grid-cols-[1fr_120px_84px_96px_34px] items-center gap-2">
      <Input
        aria-label="Bileşen adı"
        value={name}
        disabled={ro}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => commitMeta()}
        className="h-[40px] font-bold"
      />
      <Select
        aria-label="Tür"
        disabled={ro}
        value={c.kind}
        onChange={(e) => commitMeta(e.target.value as ComponentKind)}
        className="h-[40px] text-[14px]"
      >
        {Object.entries(COMPONENT_KIND_LABEL).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </Select>
      <div className="relative">
        <span className="x pointer-events-none absolute top-[10px] left-3 text-ink3">%</span>
        <Input
          aria-label="Ağırlık"
          inputMode="decimal"
          value={weight}
          disabled={ro}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => commitMeta()}
          className="h-[40px] pl-7"
          strong
        />
      </div>
      <Input
        aria-label={`${c.name} notu`}
        inputMode="decimal"
        placeholder="Not"
        value={score}
        disabled={ro}
        onChange={(e) => setScore(e.target.value)}
        onBlur={commitScore}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="x h-[40px] text-right text-[18px]"
        strong
      />
      {!ro ? <IconButton label={`${c.name} bileşenini sil`} icon={Trash2} onClick={onDelete} /> : <span />}
    </div>
  )
}

function TargetCalculator({ detail }: { detail: CourseDetail }) {
  const { toast } = useToast()
  const save = useSchoolWrite('course:save')
  const table: readonly LetterRow[] = detail.course.letterTable ?? DEFAULT_LETTER_TABLE
  const inputs = detail.components.map((c) => ({ id: c.id, weight: c.weight, score: c.score }))
  const remaining = detail.components.filter((c) => c.score === null)
  const names = new Map(detail.components.map((c) => [c.id, c.name]))
  const target = detail.course.targetLetter
  const req = requiredScores(inputs, target, table)
  const [assume, setAssume] = useState(60)
  const projected = projectedScore(inputs, Object.fromEntries(remaining.map((c) => [c.id, assume])))
  const scenarioName =
    remaining.length === 1 ? remaining[0]!.name : remaining.length ? 'kalanların hepsinden' : ''

  function setTarget(letter: string) {
    if (letter === target) return
    save.mutate(
      { id: detail.course.id, termId: detail.course.termId, name: detail.course.name, code: detail.course.code, credit: detail.course.credit, room: detail.course.room, targetLetter: letter },
      { onError: (e) => toast({ message: errorText(e), domain: 'warning' }) },
    )
  }

  return (
    <section aria-label="Hedef hesaplayıcı" className="flex flex-col gap-4 rounded-tile bg-sky px-5 py-[18px] text-fill-ink">
      <span className="cx">Hedef harf</span>
      <div className="flex flex-wrap gap-1.5">
        {table.map((r) => (
          <button
            key={r.letter}
            type="button"
            disabled={detail.readOnly}
            aria-pressed={r.letter === target}
            onClick={() => setTarget(r.letter)}
            title={`${r.letter}: ${r.min} ve üstü`}
            className={cn(
              'x h-[34px] min-w-[46px] cursor-pointer rounded-full px-3 text-[14px] font-black',
              r.letter === target ? 'bg-fill-ink text-white' : 'bg-[rgba(19,19,22,.1)] hover:bg-[rgba(19,19,22,.16)]',
            )}
          >
            {r.letter}
          </button>
        ))}
      </div>
      <span className="x text-[30px] leading-[1.05] font-black uppercase">
        {detail.components.length ? requiredText(req, target, names) : 'Önce bileşenleri gir'}
      </span>
      {remaining.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-3 font-bold">
            <span className="shrink-0">
              {remaining.length === 1 ? `${scenarioName}'den` : scenarioName}{' '}
              <span className="x text-[18px] font-black">{assume}</span> alırsam?
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={assume}
              onChange={(e) => setAssume(Number(e.target.value))}
              className="grow accent-[#131316]"
              aria-label="Senaryo puanı"
            />
          </label>
          {projected !== null && (
            <span className="text-[15px] font-semibold">
              Dönem sonu <span className="x font-black">{formatScore(projected)}</span> ·{' '}
              <span className="x font-black">{letterFor(projected, table).letter}</span>
            </span>
          )}
        </div>
      )}
      <span className="text-[13px] font-semibold opacity-75">
        Aralıklar: {table.map((r) => `${r.letter} ${r.min}`).join(' · ')}
        {detail.course.letterTable ? ' (derse özel)' : ''} — ders ayarlarından değişir.
      </span>
    </section>
  )
}

function ExamCards({ detail }: { detail: CourseDetail }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const [editing, setEditing] = useState<ExamSummary | 'new' | null>(null)
  const remove = useSchoolWrite('school:delete')
  const restore = useSchoolWrite('school:restore')
  const today = format(new Date(), 'yyyy-MM-dd')
  const ro = detail.readOnly

  return (
    <section aria-label="Sınavlar" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="cx grow">Sınavlar · {detail.exams.length}</span>
        {!ro && (
          <Button size="sm" icon={Plus} onClick={() => setEditing('new')}>
            Sınav
          </Button>
        )}
      </div>
      {detail.exams.length === 0 && (
        <span className="rounded-tile bg-s2 px-5 py-4 text-ink2">Sınav yok. Tarihi belli olunca ekle; hazırlık planı ondan çıkar.</span>
      )}
      {detail.exams.map((e) => {
        const past = e.day < today
        const days = Math.round((parseISO(e.day).getTime() - parseISO(today).getTime()) / 86_400_000)
        return (
          <article key={e.id} className="flex flex-col gap-2 rounded-tile bg-s2 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="cx grow">
                {past ? format(parseISO(e.day), 'd MMMM', { locale: tr }) : daysLeftText(days)} · {e.title}
              </span>
              {!ro && (
                <>
                  <IconButton label="Sınavı düzenle" icon={Pencil} onClick={() => setEditing(e)} />
                  <IconButton
                    label="Sınavı sil"
                    icon={Trash2}
                    onClick={() =>
                      remove.mutate(
                        { table: 'exams', id: e.id },
                        {
                          onSuccess: () =>
                            toast({
                              message: `${e.title} silindi.`,
                              domain: 'school',
                              action: { label: 'Geri al', onClick: () => restore.mutate({ table: 'exams', id: e.id }) },
                            }),
                          onError,
                        },
                      )
                    }
                  />
                </>
              )}
            </div>
            <span className="text-[14px] font-semibold text-ink2">
              {format(parseISO(e.day), 'd MMMM EEEE', { locale: tr })}
              {e.startMin !== null && ` · ${clock(e.startMin)}`}
              {e.place && ` · ${e.place}`}
              {` · ${e.topicIds.length} konu`}
            </span>
            {past ? (
              <>
                <span className="x text-[28px] font-black">
                  {e.score === null ? 'Not girilmedi' : formatScore(e.score)}
                </span>
                <Review exam={e} courseId={detail.course.id} ro={ro} />
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span className="x text-[28px] font-black">{e.readiness === null ? '—' : `%${e.readiness}`}</span>
                <span className="cx grow text-ink3">hazır</span>
                <Button size="sm" variant="action" onClick={() => void navigate(`/okul/sinav/${e.id}`)}>
                  Hazırlık
                </Button>
              </div>
            )}
          </article>
        )
      })}
      <ExamDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        courseId={detail.course.id}
        exam={editing === 'new' || editing === null ? undefined : editing}
      />
    </section>
  )
}

/** Sınav sonrası analiz: bir sonraki sınavın hazırlık ekranında gösterilir. */
function Review({ exam, courseId, ro }: { exam: ExamSummary; courseId: string; ro: boolean }) {
  const save = useSchoolWrite('exam:save')
  const [text, setText] = useState(exam.reviewMd)
  const [open, setOpen] = useState(!!exam.reviewMd)
  if (!open)
    return ro ? null : (
      <div>
        <Chip selected={false} onClick={() => setOpen(true)}>
          Sınav sonrası analiz yaz
        </Chip>
      </div>
    )
  return (
    <Textarea
      aria-label="Sınav sonrası analiz"
      rows={3}
      disabled={ro}
      value={text}
      placeholder="Nerede puan kaybettim? Bir dahaki sefere ne yaparım?"
      onChange={(e) => setText(e.target.value)}
      onBlur={() =>
        text !== exam.reviewMd &&
        save.mutate({ id: exam.id, courseId, title: exam.title, day: exam.day, startMin: exam.startMin, place: exam.place, reviewMd: text })
      }
    />
  )
}
