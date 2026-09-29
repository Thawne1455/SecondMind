import { useState } from 'react'
import type { Course } from '@shared/ipc'
import { DEFAULT_LETTER_TABLE } from '@shared/school/grades'
import { errorText } from '../../lib/errors'
import { Button, Chip, cn, Field, Input, Modal, useToast } from '../../ui'
import { formatLetterTable, formatSlots, parseLetterTable, parseSlots, SCHEME_PRESETS } from './schoolText'
import { useSchoolWrite } from './useSchool'

// Ders ekle / düzenle: ad, kod, kredi, hoca, derslik, haftalık program (serbest yazım), devam sınırı,
// hedef harf, elle harf (bağıl değerlendirme / geçmiş dönem), harf tablosu, ton.

/** Gök mavisi tonları (main/domain/school/term.COURSE_TONES ile aynı). */
const TONES = ['#7CC4FF', '#B5DEFF', '#4FA8F2', '#9ED0F7', '#69D0F0', '#8DB5EE', '#C9E8FF', '#5BBBE6']

type Props = {
  open: boolean
  onClose: () => void
  termId: string
  /** Düzenlenen ders; yoksa yeni ders. */
  course?: Course & { instructorName?: string | null }
  instructorName?: string | null
}

export function CourseDialog(props: Props) {
  return props.open ? <CourseForm {...props} /> : null
}

function CourseForm({ open, onClose, termId, course, instructorName }: Props) {
  const { toast } = useToast()
  const save = useSchoolWrite('course:save')
  const [name, setName] = useState(course?.name ?? '')
  const [code, setCode] = useState(course?.code ?? '')
  const [credit, setCredit] = useState(course ? String(course.credit || '') : '')
  const [teacher, setTeacher] = useState(instructorName ?? course?.instructorName ?? '')
  const [room, setRoom] = useState(course?.room ?? '')
  const [program, setProgram] = useState(course ? formatSlots(course.slots) : '')
  const [limitKind, setLimitKind] = useState<'percent' | 'hours'>(course?.attendanceLimit?.kind ?? 'percent')
  const [limit, setLimit] = useState(course?.attendanceLimit ? String(course.attendanceLimit.value) : course ? '' : '30')
  const [target, setTarget] = useState(course?.targetLetter ?? 'BB')
  const [letter, setLetter] = useState(course?.letter ?? '')
  const [tone, setTone] = useState(course?.tone ?? '')
  const [table, setTable] = useState(formatLetterTable(course?.letterTable ?? DEFAULT_LETTER_TABLE))
  const [scheme, setScheme] = useState('vf')

  const slots = parseSlots(program)
  const letters = parseLetterTable(table)
  const tableIsDefault = table === formatLetterTable(DEFAULT_LETTER_TABLE)

  function submit() {
    if (!letters) return
    const value = Number(limit.replace(',', '.'))
    // Mevcut saatlerin id'leri korunur (yoklama geçmişi bağlı kalsın): aynı gün ve başlangıçtaki satır.
    const withIds = slots.slots.map((s) => ({
      ...s,
      id: course?.slots.find((o) => o.weekday === s.weekday && o.startMin === s.startMin)?.id,
    }))
    save.mutate(
      {
        id: course?.id,
        termId,
        name,
        code,
        credit: Number(credit.replace(',', '.')) || 0,
        room,
        instructorName: teacher,
        slots: withIds,
        attendanceLimit: value > 0 ? { kind: limitKind, value } : null,
        targetLetter: target || 'BB',
        letter: letter.trim() || null,
        letterTable: tableIsDefault ? null : letters,
        ...(tone && { tone }),
        ...(!course && { components: SCHEME_PRESETS.find((s) => s.id === scheme)?.components ?? [] }),
      },
      {
        onSuccess: () => {
          toast({ message: `${name.trim()} kaydedildi.`, domain: 'school' })
          onClose()
        },
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      domain="school"
      fill={tone || undefined}
      width={760}
      title={course ? `${course.name} · ayarlar` : 'Ders ekle'}
      hints='Program: "Pzt 09:00-10:50 D-201, Çar 13-15"'
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!name.trim() || !letters || slots.errors.length > 0}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="grid max-h-[62vh] grid-cols-6 gap-4 overflow-y-auto pr-1">
        <Field label="Ders" className="col-span-3">
          <Input data-autofocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Kod" className="col-span-2">
          <Input value={code} maxLength={30} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="AKTS">
          <Input inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value)} strong />
        </Field>
        <Field label="Hoca" className="col-span-3" hint="Aynı adlı hoca varsa ona bağlanır">
          <Input value={teacher} maxLength={120} onChange={(e) => setTeacher(e.target.value)} />
        </Field>
        <Field label="Derslik" className="col-span-3" optional>
          <Input value={room} maxLength={60} onChange={(e) => setRoom(e.target.value)} />
        </Field>
        <Field
          label="Haftalık program"
          className="col-span-6"
          error={slots.errors.length ? `Anlaşılmadı: ${slots.errors.join(' · ')}` : undefined}
          hint={slots.errors.length ? undefined : `${slots.slots.length} ders saati`}
        >
          <Input value={program} onChange={(e) => setProgram(e.target.value)} placeholder="Pzt 09:00-10:50 D-201" />
        </Field>
        <Field label="Devam sınırı" className="col-span-2">
          <Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Sınır yok" strong />
        </Field>
        <Field label="Birim" className="col-span-2">
          <div className="flex gap-2">
            <Chip selected={limitKind === 'percent'} onClick={() => setLimitKind('percent')}>
              % dönem
            </Chip>
            <Chip selected={limitKind === 'hours'} onClick={() => setLimitKind('hours')}>
              Ders saati
            </Chip>
          </div>
        </Field>
        <Field label="Hedef harf">
          <Input value={target} maxLength={4} onChange={(e) => setTarget(e.target.value.toLocaleUpperCase('tr-TR'))} strong />
        </Field>
        <Field label="Elle harf" optional hint="Bağıl not">
          <Input value={letter} maxLength={4} onChange={(e) => setLetter(e.target.value.toLocaleUpperCase('tr-TR'))} strong />
        </Field>
        <Field
          label="Harf aralıkları"
          className="col-span-6"
          hint="Harf · alt sınır · katsayı. Üniversiten farklıysa değiştir."
          error={letters ? undefined : 'Her parça "AA 90 4" biçiminde olmalı'}
        >
          <div className="flex gap-2">
            <Input value={table} onChange={(e) => setTable(e.target.value)} className="font-mono text-[14px]" />
            {!tableIsDefault && (
              <Button variant="secondary" onClick={() => setTable(formatLetterTable(DEFAULT_LETTER_TABLE))}>
                Varsayılan
              </Button>
            )}
          </div>
        </Field>
        {!course && (
          <Field label="Değerlendirme" className="col-span-6">
            <div className="flex flex-wrap gap-2">
              {SCHEME_PRESETS.map((s) => (
                <Chip key={s.id} selected={scheme === s.id} onClick={() => setScheme(s.id)}>
                  {s.label}
                </Chip>
              ))}
            </div>
          </Field>
        )}
        <Field label="Ton" className="col-span-6">
          <div className="flex gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                aria-label={`Ton ${t}`}
                aria-pressed={(tone || course?.tone) === t}
                onClick={() => setTone(t)}
                className={cn(
                  'size-9 cursor-pointer rounded-full focus-visible:outline-3 focus-visible:outline-indigo',
                  (tone || course?.tone) === t && 'ring-3 ring-ink ring-offset-2 ring-offset-bg',
                )}
                style={{ background: t }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
