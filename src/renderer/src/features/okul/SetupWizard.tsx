import { useState } from 'react'
import { format, nextMonday, isMonday } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import type { CourseSaveInput } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, Chip, cn, Field, IconButton, Input, Modal, useToast } from '../../ui'
import { guessTermName, parseSlots, SCHEME_PRESETS } from './schoolText'
import { useSchoolWrite } from './useSchool'

// İlk kurulum sihirbazı (OKUL.md, Ayarlar + ilk kurulum): 1) dönem, 2) dersler ve program,
// 3) ortak değerlendirme şeması ve devam sınırı. Hepsi tek `school:setup` çağrısıyla yazılır.

type Row = { name: string; code: string; credit: string; instructor: string; program: string }

const EMPTY_ROW: Row = { name: '', code: '', credit: '', instructor: '', program: '' }


const defaultStart = () => {
  const d = new Date()
  return format(isMonday(d) ? d : nextMonday(d), 'yyyy-MM-dd')
}

export function SetupWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(() => guessTermName(new Date()))
  const [start, setStart] = useState(defaultStart)
  const [weeks, setWeeks] = useState('14')
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }])
  const [scheme, setScheme] = useState('vf')
  const [limit, setLimit] = useState('30')
  const [target, setTarget] = useState('BB')
  const setup = useSchoolWrite('school:setup')
  const { toast } = useToast()

  const filled = rows.filter((r) => r.name.trim())
  const parsed = rows.map((r) => parseSlots(r.program))
  const weekCount = Number(weeks)
  const step0Ok = name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(start) && weekCount >= 1 && weekCount <= 30

  function patch(i: number, p: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)))
  }

  function finish() {
    const components = SCHEME_PRESETS.find((s) => s.id === scheme)?.components ?? []
    const pct = Number(limit)
    const courses: Omit<CourseSaveInput, 'termId'>[] = rows.flatMap((r, i) =>
      r.name.trim()
        ? [
            {
              name: r.name.trim(),
              code: r.code.trim(),
              credit: Number(r.credit.replace(',', '.')) || 0,
              instructorName: r.instructor.trim(),
              slots: parsed[i]!.slots,
              components,
              attendanceLimit: pct > 0 ? { kind: 'percent' as const, value: pct } : null,
              targetLetter: target,
            },
          ]
        : [],
    )
    setup.mutate(
      { term: { name: name.trim(), startDate: start, weekCount }, courses },
      {
        onSuccess: () => {
          toast({ message: `${name.trim()} kuruldu · ${courses.length} ders.`, domain: 'school' })
          onClose()
        },
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
    )
  }

  const steps = ['Dönem', 'Dersler', 'Değerlendirme']

  return (
    <Modal
      open={open}
      onClose={onClose}
      domain="school"
      width={920}
      title={`Dönem kur · ${steps[step]}`}
      headerExtra={<span className="cx opacity-70">{step + 1} / 3</span>}
      hints={
        step === 1
          ? 'Program: "Pzt 09:00-10:50 D-201, Çar 13-15". Hepsini sonra Ayarlar > Okul\'dan değiştirebilirsin.'
          : 'Esc kapatır'
      }
      actions={
        <>
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              Geri
            </Button>
          )}
          {step < 2 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 0 ? !step0Ok : filled.length === 0}
            >
              İleri
            </Button>
          ) : (
            <Button onClick={finish} loading={setup.isPending}>
              Dönemi kur
            </Button>
          )}
        </>
      }
    >
      {step === 0 && (
        <div className="grid grid-cols-[1fr_200px_140px] gap-4">
          <Field label="Dönem adı">
            <Input data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          <Field label="İlk gün">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} strong />
          </Field>
          <Field label="Hafta" hint="Genelde 14">
            <Input
              type="number"
              min={1}
              max={30}
              value={weeks}
              onChange={(e) => setWeeks(e.target.value)}
              strong
            />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-1">
          <div className="cx grid grid-cols-[1.6fr_.7fr_.5fr_1.1fr_2fr_34px] gap-2 px-1 text-ink3">
            <span>Ders</span>
            <span>Kod</span>
            <span>AKTS</span>
            <span>Hoca</span>
            <span>Program</span>
            <span />
          </div>
          {rows.map((r, i) => {
            const p = parsed[i]!
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="grid grid-cols-[1.6fr_.7fr_.5fr_1.1fr_2fr_34px] items-center gap-2">
                  <Input
                    aria-label="Ders adı"
                    placeholder="Veri Yapıları"
                    value={r.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                    {...(i === 0 && { 'data-autofocus': true })}
                  />
                  <Input
                    aria-label="Ders kodu"
                    placeholder="BIL201"
                    value={r.code}
                    onChange={(e) => patch(i, { code: e.target.value })}
                  />
                  <Input
                    aria-label="Kredi"
                    inputMode="decimal"
                    placeholder="6"
                    value={r.credit}
                    onChange={(e) => patch(i, { credit: e.target.value })}
                  />
                  <Input
                    aria-label="Hoca"
                    placeholder="Ayşe Kaya"
                    value={r.instructor}
                    onChange={(e) => patch(i, { instructor: e.target.value })}
                  />
                  <Input
                    aria-label="Program"
                    placeholder="Pzt 09:00-10:50 D-201"
                    value={r.program}
                    aria-invalid={p.errors.length > 0 || undefined}
                    onChange={(e) => patch(i, { program: e.target.value })}
                  />
                  <IconButton
                    label="Satırı sil"
                    icon={Trash2}
                    disabled={rows.length === 1}
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  />
                </div>
                {p.errors.length > 0 && (
                  <span className="pl-1 text-[13px] font-semibold text-t-coral">
                    Anlaşılmadı: {p.errors.join(' · ')}
                  </span>
                )}
              </div>
            )
          })}
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              onClick={() => setRows((rs) => [...rs, { ...EMPTY_ROW }])}
            >
              Ders
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <Field label="Değerlendirme şeması" hint="Bütün derslere aynı şema; farklı olanı ders sayfasında düzeltirsin.">
            <div className="flex flex-wrap gap-2">
              {SCHEME_PRESETS.map((s) => (
                <Chip key={s.id} selected={scheme === s.id} onClick={() => setScheme(s.id)}>
                  {s.label}
                </Chip>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-[220px_220px] gap-4">
            <Field label="Devam sınırı (%)" hint="Boş ya da 0: sınır yok">
              <Input
                type="number"
                min={0}
                max={100}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                strong
              />
            </Field>
            <Field label="Hedef harf" hint="Finalde en az kaç almalısın?">
              <Input
                value={target}
                maxLength={4}
                onChange={(e) => setTarget(e.target.value.toLocaleUpperCase('tr-TR'))}
                strong
              />
            </Field>
          </div>
          <p className={cn('m-0 text-ink2')}>
            {filled.length} ders, {parsed.reduce((n, p) => n + p.slots.length, 0)} ders saati kurulacak.
            Haftalık program Bugün'ün akış bandına ve Okul panosuna kendiliğinden düşer.
          </p>
        </div>
      )}
    </Modal>
  )
}
