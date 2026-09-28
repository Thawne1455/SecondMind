import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addDays, addHours, format, getISODay, startOfHour } from 'date-fns'
import { Trash2, X } from 'lucide-react'
import type { Reminder, ReminderRule } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatReminderAt, formatRule } from '../../lib/format'
import { parseQuickEntry, toReminderRule, type RepeatSpec } from '../../lib/quickEntry'
import { useNow } from '../../lib/useNow'
import {
  Button,
  Chip,
  cn,
  DialogFrame,
  EmptyState,
  Field,
  IconButton,
  Input,
  ModalPanel,
  Skeleton,
  useToast,
} from '../../ui'
import {
  useCreateReminder,
  useDeleteReminder,
  useReminders,
  useResolveMissed,
  useRestoreReminder,
  useUpdateReminder,
} from './usePlanning'

// Hatırlatma çalışma alanı (Ctrl H, her ekrandan). Yeni hatırlatmada başlık ayrıştırılır:
// "yarın 10:00 kitabı iade et", "her pzt 09:00 haftalık plan", "hafta içi 8.30 ilaç".

type RepeatKind = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'
const REPEATS: { value: RepeatKind; label: string }[] = [
  { value: 'none', label: 'Tekrar yok' },
  { value: 'daily', label: 'Her gün' },
  { value: 'weekdays', label: 'Hafta içi' },
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' },
  { value: 'yearly', label: 'Yıllık' },
]
const WEEK = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const TIMES = ['09:00', '12:00', '18:00', '21:00']

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')
const at = (day: string, time: string) => new Date(`${day}T${time}`)

function repeatFromSpec(spec: RepeatSpec): { kind: RepeatKind; days?: number[] } {
  if (spec.kind !== 'weekly') return { kind: spec.kind }
  const days = spec.days.join(',')
  if (days === '1,2,3,4,5,6,7') return { kind: 'daily' }
  if (days === '1,2,3,4,5') return { kind: 'weekdays' }
  return { kind: 'weekly', days: spec.days }
}

function repeatFromRule(rule: ReminderRule | null): { kind: RepeatKind; days: number[] } {
  if (!rule) return { kind: 'none', days: [] }
  if (rule.kind !== 'weekly') return { kind: rule.kind, days: [] }
  const r = repeatFromSpec({ kind: 'weekly', days: rule.days })
  return { kind: r.kind, days: r.days ?? [] }
}

type ReminderWorkspaceProps = {
  open: boolean
  /** Açılışta sağda düzenlenecek hatırlatma; yoksa yeni hatırlatma formu. */
  reminder: Reminder | null
  onClose: () => void
}

/**
 * Hatırlatma çalışma alanı (Ctrl H, her ekrandan): solda tüm hatırlatmalar, sağda ekle / düzenle.
 * Ekleyince pencere kapanmaz, form boşalır.
 */
export function ReminderWorkspace({ open, reminder, onClose }: ReminderWorkspaceProps) {
  return (
    <DialogFrame open={open} onClose={onClose} label="Hatırlatmalar" width={1180} placement="high">
      <Workspace initial={reminder} onClose={onClose} />
    </DialogFrame>
  )
}

function Workspace({ initial, onClose }: { initial: Reminder | null; onClose: () => void }) {
  const [selected, setSelected] = useState<Reminder | null>(initial)
  const [round, setRound] = useState(0)
  const fresh = () => {
    setSelected(null)
    setRound((r) => r + 1)
  }

  return (
    <div className="flex items-start gap-4">
      <ReminderListPanel
        selectedId={selected?.id ?? null}
        onEdit={setSelected}
        className="min-w-0 grow"
      />
      <ModalPanel
        title={selected ? 'Hatırlatmayı düzenle' : 'Yeni hatırlatma'}
        domain="dump"
        onClose={onClose}
        className="w-[500px] shrink-0"
        headerClassName="min-h-[68px]"
        footerClassName="min-h-[76px]"
        hints={selected ? 'Enter kaydeder · Esc kapatır' : 'Ctrl H · Enter ekler, form boşalır'}
        bodyClassName="h-[62vh] overflow-y-auto"
        actions={
          <>
            {selected && (
              <Button variant="secondary" onClick={fresh}>
                Yeni
              </Button>
            )}
            <Button type="submit" form="reminder-form">
              {selected ? 'Kaydet' : 'Ekle'}
            </Button>
          </>
        }
      >
        <ReminderForm key={selected?.id ?? `new-${round}`} reminder={selected} onDone={fresh} />
      </ModalPanel>
    </div>
  )
}

type Group = { title: string; missed: boolean; items: Reminder[] }

/** Sol karo: kaçırılanlar (ele alınmamış), yaklaşan tek seferlikler, tekrarlayanlar. */
function ReminderListPanel({
  selectedId,
  onEdit,
  className,
}: {
  selectedId: string | null
  onEdit: (r: Reminder) => void
  className?: string
}) {
  const reminders = useReminders()
  const resolve = useResolveMissed()
  const { toast } = useToast()
  const now = useNow(60_000)
  const all = reminders.data ?? []
  const missed = all.filter((r) => r.missedAt !== null)
  const groups: Group[] = [
    { title: 'Kaçırılan', missed: true, items: missed },
    { title: 'Yaklaşan', missed: false, items: all.filter((r) => !r.rule && r.missedAt === null) },
    { title: 'Tekrarlayan', missed: false, items: all.filter((r) => r.rule) },
  ]
  const todayEnd = new Date(now).setHours(24, 0, 0, 0)
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })

  return (
    <ModalPanel
      title="Hatırlatmalar"
      domain="dump"
      className={className}
      headerClassName="min-h-[68px]"
      footerClassName="min-h-[76px]"
      hints={`${all.length - missed.length} kurulu${missed.length ? ` · ${missed.length} kaçırılan` : ''}`}
      bodyClassName="h-[62vh] gap-1.5 overflow-y-auto"
    >
      {reminders.isPending && <Skeleton lines={4} />}
      {reminders.data && !all.length && (
        <EmptyState
          title="Hatırlatma yok"
          message="Sağdaki karoya 'yarın 10:00 kitabı iade et' gibi yazabilirsin."
        />
      )}
      {groups
        .filter((g) => g.items.length)
        .map((g, gi) => (
          <div key={g.title} className="flex flex-col gap-1.5">
            <span className={cn('cx text-ink2', gi > 0 && 'pt-3')}>{g.title}</span>
            {g.items.map((r) => (
              <div
                key={r.id}
                className={cn(
                  'flex items-center gap-3 rounded-[18px] bg-s2 py-2 pr-2 pl-2',
                  r.id === selectedId && 'outline-2 outline-ink',
                )}
              >
                <button
                  type="button"
                  onClick={() => onEdit(r)}
                  className="flex min-w-0 grow cursor-pointer items-center gap-3 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo"
                >
                  <span
                    className={cn(
                      'x flex h-[28px] min-w-[104px] shrink-0 items-center justify-center rounded-full px-3 text-[13px] font-extrabold',
                      g.missed
                        ? 'bg-coral text-white'
                        : r.at < todayEnd
                          ? 'bg-amber text-fill-ink'
                          : 'bg-s3',
                    )}
                  >
                    {formatReminderAt(g.missed ? r.missedAt! : r.at, now)}
                  </span>
                  <span className="flex min-w-0 flex-col leading-[1.3]">
                    <span className="truncate font-bold">{r.title}</span>
                    {r.rule && (
                      <span className="truncate text-[13px] font-semibold text-ink3">
                        {formatRule(r.rule)} {r.rule.time}
                      </span>
                    )}
                  </span>
                </button>
                {g.missed && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="[--btn-soft:var(--bg)]"
                      onClick={() =>
                        resolve.mutate(
                          { ids: [r.id], action: 'today' },
                          {
                            onSuccess: () =>
                              toast({
                                variant: 'fill',
                                domain: 'today',
                                message: `Bugünkü görev oldu: ${r.title}`,
                              }),
                            onError,
                          },
                        )
                      }
                    >
                      Bugüne al
                    </Button>
                    <IconButton
                      label="Kapat"
                      icon={X}
                      className="size-[30px] [--btn-soft:var(--bg)]"
                      onClick={() =>
                        resolve.mutate({ ids: [r.id], action: 'dismiss' }, { onError })
                      }
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
    </ModalPanel>
  )
}

function ReminderForm({ reminder, onDone }: { reminder: Reminder | null; onDone: () => void }) {
  const now = new Date()
  // Yeni hatırlatma varsayılanı: bir sonraki tam saat.
  const start = reminder ? new Date(reminder.at) : startOfHour(addHours(now, 1))
  const initialRepeat = repeatFromRule(reminder?.rule ?? null)
  const [title, setTitle] = useState(reminder?.title ?? '')
  const [day, setDay] = useState(dayKey(start))
  const [time, setTime] = useState(format(start, 'HH:mm'))
  const [repeat, setRepeat] = useState<RepeatKind>(initialRepeat.kind)
  const [weekDays, setWeekDays] = useState<number[]>(
    initialRepeat.days.length ? initialRepeat.days : [getISODay(start)],
  )
  const [error, setError] = useState<string | null>(null)

  const create = useCreateReminder()
  const update = useUpdateReminder()
  const remove = useDeleteReminder()
  const restore = useRestoreReminder()
  const { toast } = useToast()
  const titleRef = useRef<HTMLInputElement>(null)
  // Yeni/seçilen form açılınca başlığa odak (ilk açılışta DialogFrame data-autofocus'la yapar).
  useEffect(() => titleRef.current?.focus(), [])

  const parsed = reminder ? null : parseQuickEntry(title, now, { clock: true })

  function onTitle(value: string) {
    setTitle(value)
    setError(null)
    if (reminder) return
    const p = parseQuickEntry(value, now, { clock: true })
    if (p.date) setDay(p.date)
    if (p.time) {
      setTime(p.time)
      // Sadece saat yazıldıysa ve bugün geçtiyse yarın.
      if (!p.date && !p.repeat && at(dayKey(now), p.time) <= now) setDay(dayKey(addDays(now, 1)))
      else if (!p.date && !p.repeat) setDay(dayKey(now))
    }
    if (p.repeat) {
      const r = repeatFromSpec(p.repeat)
      setRepeat(r.kind)
      if (r.days) setWeekDays(r.days)
    }
  }

  function rule(): ReminderRule | null {
    const d = at(day, time)
    switch (repeat) {
      case 'none':
        return null
      case 'daily':
        return { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7], time }
      case 'weekdays':
        return { kind: 'weekly', days: [1, 2, 3, 4, 5], time }
      case 'weekly':
        return { kind: 'weekly', days: weekDays, time }
      case 'monthly':
        return toReminderRule({ kind: 'monthly' }, time, d)
      case 'yearly':
        return toReminderRule({ kind: 'yearly' }, time, d)
    }
  }

  const r = rule()
  const when = at(day, time)
  const past = !r && when.getTime() < now.getTime() - 60_000
  const preview = r
    ? `${formatRule(r)} ${time}`
    : Number.isNaN(when.getTime())
      ? ''
      : formatReminderAt(when.getTime(), now.getTime())

  function submit(e: FormEvent) {
    e.preventDefault()
    const finalTitle = (parsed ? parsed.title : title).trim()
    if (!finalTitle) return setError('Başlık boş')
    if (repeat === 'weekly' && !weekDays.length) return setError('En az bir gün seç')
    if (past) return setError('Bu zaman geçti')
    const input = r ? { rule: r } : { at: when.getTime(), rule: null }
    const onError = (err: unknown) => setError(errorText(err))
    if (reminder) {
      update.mutate(
        { id: reminder.id, title: finalTitle, ...input },
        { onSuccess: onDone, onError },
      )
    } else {
      create.mutate(
        { title: finalTitle, ...input },
        {
          onSuccess: (x) => {
            toast({
              variant: 'fill',
              domain: 'dump',
              message: `${formatReminderAt(x.at, Date.now())} · ${x.title}`,
              title: 'Hatırlatma kuruldu',
            })
            onDone()
          },
          onError,
        },
      )
    }
  }

  function onDelete() {
    if (!reminder) return
    remove.mutate(reminder.id, {
      onSuccess: () => {
        toast({
          message: 'Hatırlatma çöp kutusuna taşındı.',
          action: { label: 'Geri al', onClick: () => restore.mutate(reminder.id) },
        })
        onDone()
      },
    })
  }

  const toggleDay = (d: number) =>
    setWeekDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()))

  const today = dayKey(now)
  const tomorrow = dayKey(addDays(now, 1))
  const showDay = repeat === 'none' || repeat === 'monthly' || repeat === 'yearly'

  return (
    <form id="reminder-form" onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Neyi hatırlatayım?" error={error}>
        <Input
          strong
          data-autofocus
          ref={titleRef}
          value={title}
          maxLength={300}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="yarın 10:00 kitabı iade et"
        />
      </Field>

      <Field label="Tekrar">
        <div className="flex flex-wrap gap-1.5">
          {REPEATS.map((x) => (
            <Chip key={x.value} selected={repeat === x.value} onClick={() => setRepeat(x.value)}>
              {x.label}
            </Chip>
          ))}
        </div>
        {repeat === 'weekly' && (
          <div className="flex gap-1.5 pt-1">
            {WEEK.map((label, i) => (
              <Chip
                key={label}
                selected={weekDays.includes(i + 1)}
                onClick={() => toggleDay(i + 1)}
              >
                {label}
              </Chip>
            ))}
          </div>
        )}
      </Field>

      <div className="flex flex-wrap items-end gap-4">
        {showDay && (
          <Field label={repeat === 'none' ? 'Gün' : 'Hangi gün'}>
            <div className="flex items-center gap-1.5">
              {repeat === 'none' && (
                <>
                  <Chip selected={day === today} onClick={() => setDay(today)}>
                    Bugün
                  </Chip>
                  <Chip selected={day === tomorrow} onClick={() => setDay(tomorrow)}>
                    Yarın
                  </Chip>
                </>
              )}
              <Input
                type="date"
                aria-label="Gün"
                required
                value={day}
                onChange={(e) => e.target.value && setDay(e.target.value)}
                className="h-9 w-44"
              />
            </div>
          </Field>
        )}
        <Field label="Saat">
          <div className="flex items-center gap-1.5">
            {TIMES.map((t) => (
              <Chip key={t} selected={time === t} onClick={() => setTime(t)}>
                {t}
              </Chip>
            ))}
            <Input
              type="time"
              aria-label="Saat"
              required
              value={time}
              onChange={(e) => e.target.value && setTime(e.target.value)}
              className="h-9 w-32"
            />
          </div>
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={cn(
            'x flex h-[30px] items-center rounded-full px-3.5 text-[14px] font-extrabold',
            past ? 'bg-coral text-white' : 'bg-amber text-fill-ink',
          )}
        >
          {past ? 'Geçmiş zaman' : preview}
        </span>
        {parsed && parsed.title !== title.trim() && parsed.title && (
          <span className="min-w-0 truncate text-[14px] font-semibold">{parsed.title}</span>
        )}
        <span className="grow" />
        {reminder && (
          <Button type="button" variant="secondary" size="sm" icon={Trash2} onClick={onDelete}>
            Sil
          </Button>
        )}
      </div>
    </form>
  )
}
