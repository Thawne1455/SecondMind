import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { CalendarPlus, Trash2, X } from 'lucide-react'
import {
  REPRO_MAX,
  TASK_TITLE_MAX,
  type Milestone,
  type Task,
  type TaskKind,
  type TaskPriority,
  type TaskSeverity,
  type TaskUpdateInput,
} from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatAgo, formatMinutes } from '../../lib/format'
import { useNow } from '../../lib/useNow'
import { Button, Chip, cn, DOMAIN_FILL, Field, IconButton, Input, Select, Textarea } from '../../ui'
import { useToast } from '../../ui'
import {
  useDeleteTask,
  useMoveBlock,
  useRestoreTask,
  useSchedule,
  useSplitTask,
  useUpdateTask,
} from '../bugun/usePlanning'
import {
  COLUMNS,
  columnOf,
  KIND_ICON,
  KIND_LABEL,
  POSTPONE_BADGE_AT,
  SEVERITY_LABEL,
  SOURCE_LABEL,
} from './board'

// Kartın sağ paneli (sayfa içinde, modal değil): başlık, tür, önem ve "nasıl tekrarlanır" (hata),
// taş, süre, öncelik, Bugüne al, sil. Seçimler hemen kaydedilir; yazı alanları odaktan çıkınca ya da Esc'te.
// Erteleme sayacı eşiği geçtiyse üstte mercan şerit: Böl · Sil · Bugün yap.

const ESTIMATES = [15, 30, 45, 60, 90, 120]
const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 1, label: 'Düşük' },
  { value: 2, label: 'Normal' },
  { value: 3, label: 'Yüksek' },
]
const SEVERITIES: TaskSeverity[] = ['critical', 'major', 'minor']
const KINDS: TaskKind[] = ['task', 'bug', 'research']

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')

type TaskPanelProps = {
  task: Task
  milestones: Milestone[]
  onClose: () => void
  className?: string
}

export function TaskPanel({ task: t, milestones, onClose, className }: TaskPanelProps) {
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const restore = useRestoreTask()
  const { toast } = useToast()
  const [title, setTitle] = useState(t.title)
  const [repro, setRepro] = useState(t.reproSteps)
  const today = dayKey(new Date())
  const plannedToday = t.plannedDate !== null && t.plannedDate <= today
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const save = (patch: Omit<TaskUpdateInput, 'id'>) =>
    update.mutate({ id: t.id, ...patch }, { onError })

  const now = useNow(60_000)

  // Yazı alanları odaktan çıkınca kaydedilir; panelin içindeyken Esc önce kaydeder
  // (kapanan panelde odaktan çıkma olayı gelmez).
  function flush() {
    const value = title.trim()
    if (value && value !== t.title) save({ title: value })
    else if (!value) setTitle(t.title)
    if (t.kind === 'bug' && repro !== t.reproSteps) save({ reproSteps: repro })
  }

  // Odak panelin dışındayken (kartta) Esc de kapatır; içerideki Esc aşağıda yakalanır.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function doDelete() {
    remove.mutate(t.id, {
      onSuccess: () => {
        onClose()
        toast({
          message: `Silindi: ${t.title}`,
          domain: 'projects',
          action: { label: 'Geri al', onClick: () => restore.mutate(t.id) },
        })
      },
      onError,
    })
  }

  const planToday = () =>
    update.mutate(
      { id: t.id, plannedDate: today },
      {
        onSuccess: () =>
          toast({ message: `Bugüne alındı: ${t.title}`, domain: 'today', variant: 'fill' }),
        onError,
      },
    )

  const source = SOURCE_LABEL[t.source]
  const column = COLUMNS.find((c) => c.id === columnOf(t))!.label

  return (
    <aside
      aria-label="Görev ayrıntısı"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        flush()
        onClose()
      }}
      className={cn('flex flex-col gap-5 rounded-tile bg-s2 px-5 pt-4 pb-5', className)}
    >
      <div className="flex items-center gap-2">
        <span className="cx grow text-ink2">
          {column}
          {source && ` · ${source}`} · {formatAgo(t.createdAt, now)}
        </span>
        <IconButton
          label="Kapat (Esc)"
          icon={X}
          className="[--btn-soft:var(--bg)]"
          onClick={onClose}
        />
      </div>

      {t.status === 'open' && t.postponeCount >= POSTPONE_BADGE_AT && (
        <PostponeStrip task={t} onPlanToday={planToday} onDelete={doDelete} onDone={onClose} />
      )}

      <Field label="Başlık">
        <Input
          strong
          value={title}
          maxLength={TASK_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => flush()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              flush()
            }
          }}
          className="bg-bg"
        />
      </Field>

      <Field label="Tür">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => {
            const Icon = KIND_ICON[k]
            return (
              <Chip
                key={k}
                selected={t.kind === k}
                onClick={() => t.kind !== k && save({ kind: k })}
              >
                <Icon size={15} strokeWidth={1.75} aria-hidden className="mr-1.5" />
                {KIND_LABEL[k]}
              </Chip>
            )
          })}
        </div>
      </Field>

      {t.kind === 'bug' && (
        <>
          <Field label="Önem">
            <div className="flex flex-wrap gap-1.5">
              {SEVERITIES.map((s) => (
                <Chip
                  key={s}
                  selected={t.severity === s}
                  onClick={() => save({ severity: t.severity === s ? null : s })}
                  className={cn(t.severity === s && s === 'critical' && DOMAIN_FILL.warning)}
                >
                  {SEVERITY_LABEL[s]}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Nasıl tekrarlanır" optional>
            <Textarea
              rows={5}
              value={repro}
              maxLength={REPRO_MAX}
              placeholder={'1. Oyunu aç\n2. …\nBeklenen / olan'}
              onChange={(e) => setRepro(e.target.value)}
              onBlur={() => flush()}
              className="bg-bg"
            />
          </Field>
        </>
      )}

      <Field
        label="Kilometre taşı"
        hint={milestones.length ? undefined : 'Bu projede henüz kilometre taşı yok.'}
      >
        <Select
          value={t.milestoneId ?? ''}
          disabled={!milestones.length}
          onChange={(e) => save({ milestoneId: e.target.value || null })}
          className="bg-bg"
        >
          <option value="">Taşsız</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Süre" optional>
        <div className="flex flex-wrap gap-1.5">
          {ESTIMATES.map((m) => (
            <Chip
              key={m}
              selected={t.estimateMin === m}
              onClick={() => save({ estimateMin: t.estimateMin === m ? null : m })}
              className={t.estimateMin === m ? undefined : 'bg-bg'}
            >
              {formatMinutes(m)}
            </Chip>
          ))}
          {t.estimateMin !== null && !ESTIMATES.includes(t.estimateMin) && (
            <Chip selected onClick={() => save({ estimateMin: null })}>
              {formatMinutes(t.estimateMin)}
            </Chip>
          )}
        </div>
      </Field>

      <Field label="Öncelik">
        <div className="flex gap-1.5">
          {PRIORITIES.map((p) => (
            <Chip
              key={p.value}
              selected={t.priority === p.value}
              onClick={() => save({ priority: p.value })}
              className={t.priority === p.value ? undefined : 'bg-bg'}
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </Field>

      <div className="flex items-center gap-2 pt-1">
        {t.status === 'open' && (
          <Button
            variant="secondary"
            icon={CalendarPlus}
            className="[--btn-soft:var(--bg)]"
            disabled={plannedToday}
            loading={update.isPending && update.variables?.plannedDate === today}
            onClick={planToday}
          >
            {plannedToday ? 'Bugün planlı' : 'Bugüne al'}
          </Button>
        )}
        <span className="grow" />
        <IconButton
          label="Çöp kutusuna at"
          icon={Trash2}
          className="[--btn-soft:var(--bg)]"
          disabled={remove.isPending}
          onClick={doDelete}
        />
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------- erteleme şeridi

type PostponeStripProps = {
  task: Task
  /** Bantta bloğu yoksa (sığmadı ya da başka gün) Bugün yap bununla bugüne alır. */
  onPlanToday: () => void
  onDelete: () => void
  /** Bölününce asıl görev çöp kutusuna gider; panel kapanır. */
  onDone: () => void
}

/**
 * Bugün'deki erteleme sorusunun kanban hali: Böl (parçalar bugüne) · Sil · Bugün yap. Ertelenen görev zaten
 * bugüne kaymıştır; Bugün yap, Bugün'deki gibi bantaki bloğunu o güne sabitler (sabit blok bir daha sormaz).
 */
function PostponeStrip({ task: t, onPlanToday, onDelete, onDone }: PostponeStripProps) {
  const block = useSchedule().data?.blocks.find((b) => b.kind === 'task' && b.sourceId === t.id)
  const move = useMoveBlock()
  const split = useSplitTask()
  const { toast } = useToast()
  const [splitting, setSplitting] = useState(false)
  const [parts, setParts] = useState('')
  const titles = parts
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  function doSplit() {
    if (!titles.length || split.isPending) return
    split.mutate(
      { id: t.id, titles },
      {
        onSuccess: () => {
          onDone()
          toast({
            variant: 'fill',
            domain: 'today',
            message: `${t.title} → ${titles.length} parça, bugüne eklendi.`,
          })
        },
        onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
      },
    )
  }

  return (
    <div className={cn('flex flex-col gap-3 rounded-[20px] px-4 py-3.5', DOMAIN_FILL.warning)}>
      <span className="cx">Bu {t.postponeCount}. erteleme</span>
      {splitting ? (
        <>
          <textarea
            autoFocus
            rows={3}
            value={parts}
            aria-label="Parçalar, her satır bir parça"
            placeholder={'İlk küçük adım\nİkinci adım'}
            onChange={(e) => setParts(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                doSplit()
              }
            }}
            className="w-full resize-none rounded-field bg-bg px-3 py-2 text-[15px] font-medium text-ink outline-none placeholder:text-ink3"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="onTileGhost" onClick={() => setSplitting(false)}>
              Vazgeç
            </Button>
            <Button
              size="sm"
              variant="onTile"
              disabled={!titles.length}
              loading={split.isPending}
              onClick={doSplit}
            >
              {titles.length > 1 ? `${titles.length} parçaya böl` : 'Böl'}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="onTileGhost" onClick={() => setSplitting(true)}>
            Böl
          </Button>
          <Button size="sm" variant="onTileGhost" onClick={onDelete}>
            Sil
          </Button>
          <Button
            size="sm"
            variant="onTile"
            disabled={block?.pinned}
            loading={move.isPending}
            onClick={() =>
              block
                ? move.mutate(
                    { id: block.id, start: block.start },
                    {
                      onSuccess: () =>
                        toast({ message: `Bugün sabitlendi: ${t.title}`, domain: 'today' }),
                      onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
                    },
                  )
                : onPlanToday()
            }
          >
            {block?.pinned ? 'Bugün sabit' : 'Bugün yap'}
          </Button>
        </div>
      )}
    </div>
  )
}
