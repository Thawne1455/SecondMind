import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Term } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatMinutes } from '../../lib/format'
import { useSetSetting, useSetting } from '../../lib/settings'
import { Button, Chip, Field, IconButton, Input, SectionHeader, useToast } from '../../ui'
import { CourseDialog } from '../okul/CourseDialog'
import { formatSlots, guessTermName } from '../okul/schoolText'
import { SetupWizard } from '../okul/SetupWizard'
import { useCourses, useSchoolWrite, useTerms } from '../okul/useSchool'

// Ayarlar > Okul: dönemler (aktif / arşiv; geçmiş dönemler ortalamaya girer), seçili dönemin dersleri
// (program, hoca, devam sınırı, harfler), günlük en fazla çalışma. Okul panosundaki "Dönem ayarları" buraya gelir.

export function SchoolSection() {
  const terms = useTerms()
  const location = useLocation()
  const ref = useRef<HTMLElement>(null)
  const list = terms.data ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = list.find((t) => t.id === selectedId) ?? list.find((t) => t.active) ?? list[list.length - 1]
  const [wizard, setWizard] = useState(false)
  const [termForm, setTermForm] = useState<Term | 'new' | null>(null)

  useEffect(() => {
    if (location.hash === '#okul') ref.current?.scrollIntoView({ block: 'start' })
  }, [location.hash, terms.isSuccess])

  return (
    <section ref={ref} id="okul" className="flex max-w-[980px] flex-col gap-4 pt-4">
      <SectionHeader title="Okul" description="Dönemler, dersler ve program. Geçmiş dönemler ortalamaya girer." />
      {terms.isSuccess && list.length === 0 ? (
        <div className="flex items-center gap-3">
          <span className="grow text-ink2">Dönem yok.</span>
          <Button icon={Plus} onClick={() => setWizard(true)}>
            Dönem kur
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {list.map((t) => (
              <Chip key={t.id} selected={t.id === selected?.id} onClick={() => setSelectedId(t.id)}>
                {t.name}
                {t.active && <span className="ml-2 text-[12px] font-semibold opacity-60">aktif</span>}
              </Chip>
            ))}
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setTermForm('new')}>
              Dönem
            </Button>
          </div>
          {termForm && (
            <TermForm
              term={termForm === 'new' ? undefined : termForm}
              hasActive={list.some((t) => t.active)}
              onClose={() => setTermForm(null)}
              onSaved={(id) => setSelectedId(id)}
            />
          )}
          {selected && !termForm && <TermCourses term={selected} onEdit={() => setTermForm(selected)} />}
        </>
      )}
      <DailyStudy />
      <SetupWizard open={wizard} onClose={() => setWizard(false)} />
    </section>
  )
}

function TermForm({
  term,
  hasActive,
  onClose,
  onSaved,
}: {
  term?: Term
  hasActive: boolean
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const { toast } = useToast()
  const save = useSchoolWrite('term:save')
  const [name, setName] = useState(term?.name ?? guessTermName(new Date()))
  const [start, setStart] = useState(term?.startDate ?? '')
  const [weeks, setWeeks] = useState(String(term?.weekCount ?? 14))
  const [active, setActive] = useState(term?.active ?? !hasActive)
  return (
    <form
      className="grid grid-cols-[1fr_190px_110px_auto] items-end gap-3 rounded-tile bg-s2 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(
          { id: term?.id, name, startDate: start, weekCount: Number(weeks), active },
          {
            onSuccess: (t) => {
              onSaved(t.id)
              onClose()
            },
            onError: (err) => toast({ message: errorText(err), domain: 'warning' }),
          },
        )
      }}
    >
      <Field label="Dönem adı">
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-autofocus />
      </Field>
      <Field label="İlk gün">
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} strong />
      </Field>
      <Field label="Hafta">
        <Input type="number" min={1} max={30} value={weeks} onChange={(e) => setWeeks(e.target.value)} strong />
      </Field>
      <div className="flex items-center gap-2 pb-1">
        <Chip selected={active} onClick={() => setActive(!active)}>
          Aktif dönem
        </Chip>
        <Button type="submit" loading={save.isPending} disabled={!name.trim() || !start}>
          Kaydet
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Vazgeç
        </Button>
      </div>
    </form>
  )
}

function TermCourses({ term, onEdit }: { term: Term; onEdit: () => void }) {
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const courses = useCourses(term.id)
  const activate = useSchoolWrite('term:activate')
  const remove = useSchoolWrite('school:delete')
  const restore = useSchoolWrite('school:restore')
  const move = useSchoolWrite('course:move')
  const [dialog, setDialog] = useState<string | 'new' | null>(null)
  const list = courses.data ?? []
  const editing = dialog && dialog !== 'new' ? list.find((c) => c.id === dialog) : undefined

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="grow text-[14px] font-semibold text-ink2">
          {format(parseISO(term.startDate), 'd MMMM yyyy', { locale: tr })} –{' '}
          {format(parseISO(term.endDate), 'd MMMM yyyy', { locale: tr })} · {term.weekCount} hafta
          {term.active ? ' · aktif' : ' · arşiv (salt okunur, ortalamaya girer)'}
        </span>
        {!term.active && (
          <Button size="sm" variant="secondary" onClick={() => activate.mutate({ id: term.id }, { onError })}>
            Aktif yap
          </Button>
        )}
        <IconButton label="Dönemi düzenle" icon={Pencil} onClick={onEdit} />
        <IconButton
          label="Dönemi sil"
          icon={Trash2}
          onClick={() =>
            remove.mutate(
              { table: 'terms', id: term.id },
              {
                onSuccess: () =>
                  toast({
                    message: `${term.name} ve dersleri çöp kutusunda.`,
                    domain: 'school',
                    action: { label: 'Geri al', onClick: () => restore.mutate({ table: 'terms', id: term.id }) },
                  }),
                onError,
              },
            )
          }
        />
      </div>
      {list.map((c, i) => (
        <div key={c.id} className="flex items-center gap-3 rounded-[20px] bg-s2 px-4 py-2.5">
          <span className="size-4 shrink-0 rounded-[5px]" style={{ background: c.tone }} />
          <span className="flex min-w-0 grow flex-col">
            <span className="truncate font-bold">
              {c.name}
              {c.code && <span className="ml-2 text-[13px] font-semibold text-ink3">{c.code}</span>}
              {c.letter && <span className="x ml-2 rounded-full bg-ink px-2 text-[12px] text-on-ink">{c.letter}</span>}
            </span>
            <span className="truncate text-[13px] font-semibold text-ink3">
              {[
                c.credit ? `${c.credit} kredi` : null,
                c.instructorName,
                c.slots.length ? formatSlots(c.slots) : 'Program yok',
                c.attendanceLimit
                  ? c.attendanceLimit.kind === 'percent'
                    ? `devam %${c.attendanceLimit.value}`
                    : `devam ${c.attendanceLimit.value} saat`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <IconButton label="Yukarı" icon={ArrowUp} disabled={i === 0} onClick={() => move.mutate({ id: c.id, dir: -1 })} />
          <IconButton
            label="Aşağı"
            icon={ArrowDown}
            disabled={i === list.length - 1}
            onClick={() => move.mutate({ id: c.id, dir: 1 })}
          />
          <Button size="sm" variant="secondary" onClick={() => setDialog(c.id)}>
            Düzenle
          </Button>
        </div>
      ))}
      <div>
        <Button size="sm" icon={Plus} onClick={() => setDialog('new')}>
          Ders
        </Button>
      </div>
      <CourseDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        termId={term.id}
        course={editing}
        instructorName={editing?.instructorName}
      />
    </div>
  )
}

function DailyStudy() {
  const value = useSetting('studyDailyMaxMin')
  const set = useSetSetting('studyDailyMaxMin')
  const v = value.data ?? 180
  return (
    <div className="flex items-center gap-3">
      <span className="grow">
        <span className="font-bold">Günlük en fazla çalışma</span>
        <span className="ml-2 text-[13px] font-semibold text-ink3">Sınav planı bir güne bundan fazlasını koymaz.</span>
      </span>
      <Button size="sm" variant="secondary" onClick={() => set.mutate(Math.max(30, v - 30))} aria-label="30 dk azalt">
        −
      </Button>
      <span className="x min-w-[80px] text-center font-black">{formatMinutes(v)}</span>
      <Button size="sm" variant="secondary" onClick={() => set.mutate(Math.min(720, v + 30))} aria-label="30 dk artır">
        +
      </Button>
    </div>
  )
}
