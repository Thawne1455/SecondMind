import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addDays, format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import type { Task, TaskPriority } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatDayName, formatMinutes } from '../../lib/format'
import { parseQuickEntry } from '../../lib/quickEntry'
import { Button, Chip, DialogFrame, Field, Input, ModalPanel, Textarea, useToast } from '../../ui'
import { TaskListPanel } from './TaskList'
import { useCreateTask, useDeleteTask, useRestoreTask, useUpdateTask } from './usePlanning'

// Görev çalışma alanı (Ctrl G, her ekrandan). Yeni görevde başlık hızlı giriş gibi ayrıştırılır:
// "raporu yaz yarın 45dk ! son cuma" alanları doldurur, başlığa "raporu yaz" kalır.

const ESTIMATES = [15, 30, 45, 60, 90, 120]
const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 1, label: 'Düşük' },
  { value: 2, label: 'Normal' },
  { value: 3, label: 'Yüksek' },
]

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')

type TaskWorkspaceProps = {
  open: boolean
  /** Açılışta sağda düzenlenecek görev; yoksa yeni görev formu. */
  task: Task | null
  /** Yeni görevin başlangıç günü. */
  defaultPlanned?: string | null
  onClose: () => void
}

/**
 * Görev çalışma alanı (Ctrl G, her ekrandan): solda tüm görevler, sağda ekle / düzenle.
 * Ekleyince pencere kapanmaz, form boşalır: arka arkaya görev girilir. Listeden seçilen sağda açılır.
 */
export function TaskWorkspace({ open, task, defaultPlanned = null, onClose }: TaskWorkspaceProps) {
  return (
    <DialogFrame open={open} onClose={onClose} label="Görevler" width={1180} placement="high">
      <Workspace initial={task} defaultPlanned={defaultPlanned} onClose={onClose} />
    </DialogFrame>
  )
}

function Workspace({
  initial,
  defaultPlanned,
  onClose,
}: {
  initial: Task | null
  defaultPlanned: string | null
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Task | null>(initial)
  // Her kayıttan sonra yeni ve boş form.
  const [round, setRound] = useState(0)
  const fresh = () => {
    setSelected(null)
    setRound((r) => r + 1)
  }

  return (
    <div className="flex items-start gap-4">
      <TaskListPanel
        selectedId={selected?.id ?? null}
        onEdit={setSelected}
        className="min-w-0 grow"
      />
      <ModalPanel
        title={selected ? 'Görevi düzenle' : 'Yeni görev'}
        domain="today"
        onClose={onClose}
        className="w-[500px] shrink-0"
        headerClassName="min-h-[68px]"
        footerClassName="min-h-[76px]"
        hints={selected ? 'Enter kaydeder · Esc kapatır' : 'Ctrl G · Enter ekler, form boşalır'}
        bodyClassName="h-[62vh] overflow-y-auto"
        actions={
          <>
            {selected && (
              <Button variant="secondary" onClick={fresh}>
                Yeni
              </Button>
            )}
            <Button type="submit" form="task-form">
              {selected ? 'Kaydet' : 'Ekle'}
            </Button>
          </>
        }
      >
        <TaskForm
          key={selected?.id ?? `new-${round}`}
          task={selected}
          defaultPlanned={defaultPlanned}
          onDone={fresh}
        />
      </ModalPanel>
    </div>
  )
}

function TaskForm({
  task,
  defaultPlanned,
  onDone,
}: {
  task: Task | null
  defaultPlanned: string | null
  onDone: () => void
}) {
  const now = new Date()
  const today = dayKey(now)
  const tomorrow = dayKey(addDays(now, 1))
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [planned, setPlanned] = useState<string | null>(task ? task.plannedDate : defaultPlanned)
  const [due, setDue] = useState<string | null>(task?.dueDate ?? null)
  const [estimate, setEstimate] = useState<number | null>(task?.estimateMin ?? null)
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 2)
  const [error, setError] = useState<string | null>(null)

  const create = useCreateTask()
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const restore = useRestoreTask()
  const { toast } = useToast()
  const titleRef = useRef<HTMLInputElement>(null)
  // Yeni/seçilen form açılınca başlığa odak (ilk açılışta DialogFrame data-autofocus'la yapar).
  useEffect(() => titleRef.current?.focus(), [])

  // Yeni görevde başlık yazılırken tanınan kelimeler alanlara geçer.
  const parsed = task ? null : parseQuickEntry(title, now)
  function onTitle(value: string) {
    setTitle(value)
    setError(null)
    if (task) return
    const p = parseQuickEntry(value, now)
    if (p.date) setPlanned(p.date)
    if (p.dueDate) setDue(p.dueDate)
    if (p.estimateMin) setEstimate(p.estimateMin)
    if (p.priority) setPriority(p.priority)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const finalTitle = (parsed ? parsed.title : title).trim()
    if (!finalTitle) return setError('Başlık boş')
    const fields = {
      title: finalTitle,
      notes,
      plannedDate: planned,
      dueDate: due,
      estimateMin: estimate,
      priority,
    }
    const onError = (err: unknown) => setError(errorText(err))
    if (task) update.mutate({ id: task.id, ...fields }, { onSuccess: onDone, onError })
    else
      create.mutate(fields, {
        onSuccess: (t) => {
          toast({ variant: 'fill', domain: 'today', message: `Eklendi: ${t.title}` })
          onDone()
        },
        onError,
      })
  }

  function onDelete() {
    if (!task) return
    remove.mutate(task.id, {
      onSuccess: () => {
        toast({
          message: 'Görev çöp kutusuna taşındı.',
          action: { label: 'Geri al', onClick: () => restore.mutate(task.id) },
        })
        onDone()
      },
    })
  }

  const plannedOther = planned !== null && planned !== today && planned !== tomorrow

  return (
    <form id="task-form" onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Ne yapılacak?" error={error}>
        <Input
          strong
          data-autofocus
          ref={titleRef}
          value={title}
          maxLength={300}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Menü müziğini kırp yarın 45dk"
        />
      </Field>
      {parsed && parsed.title !== title.trim() && parsed.title && (
        <span className="-mt-2 text-[13px] font-semibold text-ink3">
          Kaydedilecek başlık: <span className="text-ink">{parsed.title}</span>
        </span>
      )}

      <Field label="Ne zaman?">
        <div className="flex flex-wrap items-center gap-2">
          <Chip selected={planned === today} onClick={() => setPlanned(today)}>
            Bugün
          </Chip>
          <Chip selected={planned === tomorrow} onClick={() => setPlanned(tomorrow)}>
            Yarın
          </Chip>
          <Chip selected={planned === null} onClick={() => setPlanned(null)}>
            Sonra
          </Chip>
          <Input
            type="date"
            aria-label="Gün seç"
            value={planned ?? ''}
            onChange={(e) => setPlanned(e.target.value || null)}
            className={plannedOther ? 'h-9 w-44 border-ink' : 'h-9 w-44'}
          />
        </div>
      </Field>

      <div className="flex flex-col gap-4">
        <Field label="Süre" optional>
          <div className="flex flex-wrap gap-1.5">
            {ESTIMATES.map((m) => (
              <Chip
                key={m}
                selected={estimate === m}
                onClick={() => setEstimate(estimate === m ? null : m)}
              >
                {formatMinutes(m)}
              </Chip>
            ))}
            {estimate !== null && !ESTIMATES.includes(estimate) && (
              <Chip selected onClick={() => setEstimate(null)}>
                {formatMinutes(estimate)}
              </Chip>
            )}
          </div>
        </Field>
        <Field label="Öncelik">
          <div className="flex gap-1.5">
            {PRIORITIES.map((p) => (
              <Chip
                key={p.value}
                selected={priority === p.value}
                onClick={() => setPriority(p.value)}
              >
                {p.label}
              </Chip>
            ))}
          </div>
        </Field>
      </div>

      <Field
        label="Son tarih"
        optional
        hint={due ? `${formatDayName(new Date(`${due}T00:00`), now)} bitmeli` : undefined}
      >
        <Input
          type="date"
          value={due ?? ''}
          onChange={(e) => setDue(e.target.value || null)}
          className="w-44"
        />
      </Field>

      <Field label="Not" optional>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {task && (
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" icon={Trash2} onClick={onDelete}>
            Sil
          </Button>
        </div>
      )}
    </form>
  )
}
