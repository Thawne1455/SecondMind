import { useState, type FormEvent } from 'react'
import { addMinutes, format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import type { Routine } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatMinutes, formatRule } from '../../lib/format'
import {
  Button,
  Chip,
  cn,
  Field,
  IconButton,
  Input,
  SectionHeader,
  Skeleton,
  useToast,
} from '../../ui'
import {
  useCreateRoutine,
  useDeleteRoutine,
  useRestoreRoutine,
  useRoutines,
  useUpdateRoutine,
} from '../bugun/usePlanning'

// Ayarlar > Rutinler: günün sabit blokları (kahvaltı, yürüyüş, spor). Akış bandına Aşama 3b'de yerleşir.

const WEEK = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const DURATIONS = [15, 30, 45, 60, 90]

function endTime(start: string, minutes: number): string {
  const [h, m] = start.split(':').map(Number) as [number, number]
  return format(addMinutes(new Date(2026, 0, 1, h, m), minutes), 'HH:mm')
}

type Draft = {
  id: string | null
  title: string
  days: number[]
  startTime: string
  durationMin: number
}
const EMPTY: Draft = {
  id: null,
  title: '',
  days: [1, 2, 3, 4, 5],
  startTime: '08:00',
  durationMin: 30,
}

export function RoutinesSection() {
  const routines = useRoutines()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const create = useCreateRoutine()
  const update = useUpdateRoutine()
  const remove = useDeleteRoutine()
  const restore = useRestoreRoutine()
  const { toast } = useToast()

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setError(null)
  }
  const toggleDay = (day: number) =>
    set({
      days: draft.days.includes(day)
        ? draft.days.filter((d) => d !== day)
        : [...draft.days, day].sort((a, b) => a - b),
    })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.title.trim()) return setError('Ad boş')
    if (!draft.days.length) return setError('En az bir gün seç')
    const { id, ...fields } = draft
    const opts = {
      onSuccess: () => setDraft(EMPTY),
      onError: (e: unknown) => setError(errorText(e)),
    }
    if (id) update.mutate({ id, ...fields }, opts)
    else create.mutate(fields, opts)
  }

  function onDelete(r: Routine) {
    remove.mutate(r.id, {
      onSuccess: () => {
        if (draft.id === r.id) setDraft(EMPTY)
        toast({
          message: `${r.title} rutini silindi.`,
          action: { label: 'Geri al', onClick: () => restore.mutate(r.id) },
        })
      },
    })
  }

  return (
    <section className="flex max-w-[720px] flex-col gap-4 pt-4">
      <SectionHeader title="Rutinler" />
      <span className="-mt-2 text-[14px] text-ink2">
        Her gün aynı saatte tekrarlanan bloklar. Bugün'ün akış bandında sabit blok olarak yer
        alırlar; görevler etraflarına yerleşir.
      </span>

      {routines.isPending && <Skeleton lines={2} />}
      <div className="flex flex-col gap-1.5">
        {routines.data?.map((r) => (
          <div
            key={r.id}
            className={cn(
              'flex items-center gap-3 rounded-[18px] bg-s2 py-2 pr-2 pl-4',
              !r.active && 'opacity-60',
              draft.id === r.id && 'outline-2 outline-ink',
            )}
          >
            <button
              type="button"
              onClick={() => {
                const { id, title, days, startTime, durationMin } = r
                setDraft({ id, title, days, startTime, durationMin })
              }}
              className="flex min-w-0 grow cursor-pointer items-baseline gap-3 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo"
            >
              <span className="x w-[104px] shrink-0 font-extrabold">
                {r.startTime}–{endTime(r.startTime, r.durationMin)}
              </span>
              <span className="truncate font-bold">{r.title}</span>
              <span className="text-[13px] font-semibold text-ink3">
                {formatRule({ kind: 'weekly', days: r.days })} · {formatMinutes(r.durationMin)}
              </span>
            </button>
            <Chip
              selected={r.active}
              onClick={() => update.mutate({ id: r.id, active: !r.active })}
              className="h-[30px]"
            >
              {r.active ? 'Açık' : 'Kapalı'}
            </Chip>
            <IconButton
              label="Sil"
              icon={Trash2}
              onClick={() => onDelete(r)}
              className="size-[30px]"
            />
          </div>
        ))}
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-[28px] bg-s2 p-5 [--btn-soft:var(--bg)]"
      >
        <div className="flex items-end gap-3">
          <Field label={draft.id ? 'Rutini düzenle' : 'Yeni rutin'} error={error} className="grow">
            <Input
              value={draft.title}
              maxLength={120}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Yürüyüş"
              className="bg-bg"
            />
          </Field>
          <Field label="Başlangıç">
            <Input
              type="time"
              required
              value={draft.startTime}
              onChange={(e) => e.target.value && set({ startTime: e.target.value })}
              className="w-32 bg-bg"
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {WEEK.map((label, i) => (
            <Chip
              key={label}
              selected={draft.days.includes(i + 1)}
              onClick={() => toggleDay(i + 1)}
              className={draft.days.includes(i + 1) ? '' : 'bg-bg'}
            >
              {label}
            </Chip>
          ))}
          <span className="w-3" />
          {DURATIONS.map((m) => (
            <Chip
              key={m}
              selected={draft.durationMin === m}
              onClick={() => set({ durationMin: m })}
              className={draft.durationMin === m ? '' : 'bg-bg'}
            >
              {formatMinutes(m)}
            </Chip>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          {draft.id && (
            <Button type="button" variant="secondary" onClick={() => setDraft(EMPTY)}>
              Vazgeç
            </Button>
          )}
          <Button type="submit" loading={create.isPending || update.isPending}>
            {draft.id ? 'Kaydet' : 'Rutin ekle'}
          </Button>
        </div>
      </form>
    </section>
  )
}
