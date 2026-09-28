import { useState, type FormEvent } from 'react'
import { addDays, format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import type { Task, TaskPriority } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatDayName, formatMinutes } from '../../lib/format'
import { parseQuickEntry } from '../../lib/quickEntry'
import { Button, Chip, Field, Input, Modal, Textarea, useToast } from '../../ui'
import { useCreateTask, useDeleteTask, useRestoreTask, useUpdateTask } from './usePlanning'

// Görev ekle / düzenle (Ctrl G, her ekrandan). Yeni görevde başlık hızlı giriş gibi ayrıştırılır:
// "raporu yaz yarın 45dk ! son cuma" alanları doldurur, başlığa "raporu yaz" kalır.

const ESTIMATES = [15, 30, 45, 60, 90, 120]
const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 1, label: 'Düşük' },
  { value: 2, label: 'Normal' },
  { value: 3, label: 'Yüksek' },
]

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')

type TaskModalProps = {
  open: boolean
  /** Düzenlenecek görev; yoksa yeni görev. */
  task: Task | null
  /** Yeni görevin başlangıç günü (Bugün'den açılınca bugün). */
  defaultPlanned?: string | null
  onClose: () => void
}

export function TaskModal({ open, task, defaultPlanned = null, onClose }: TaskModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      placement="top"
      title={task ? 'Görev' : 'Yeni görev'}
      domain="today"
      hints={
        task
          ? 'Enter kaydeder · Esc kapatır'
          : 'Başlığa "yarın", "cuma", "45dk", "!" (yüksek), "son 5 ekim" yazabilirsin.'
      }
      actions={
        <Button type="submit" form="task-form">
          {task ? 'Kaydet' : 'Ekle'}
        </Button>
      }
    >
      {/* Her açılışta form sıfırlansın. */}
      {open && (
        <TaskForm
          key={task?.id ?? 'new'}
          task={task}
          defaultPlanned={defaultPlanned}
          onDone={onClose}
        />
      )}
    </Modal>
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
          toast({ variant: 'fill', domain: 'today', message: `Görev eklendi: ${t.title}` })
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
          autoFocus
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

      <div className="grid grid-cols-2 gap-4">
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
