import { useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { Bug, ChevronDown, ChevronRight, ClipboardPaste, ListPlus, Lock, Split } from 'lucide-react'
import type { PlaytestCluster, PlaytestPoint, ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, cn, EmptyState, IconButton, Kbd, Skeleton, useToast } from '../../ui'
import { COLUMNS, KIND_LABEL } from './board'
import { formatShortDay } from './roadmapText'
import {
  useConvertCluster,
  useMovePoint,
  usePlaytest,
  useSplitPoint,
  useUndoPlaytest,
} from './usePlaytest'

// Görevler > Playtest (PROJELER.md > Playtest kutusu, 5c-4). "Test edenler ne diyor, en çok neye takılıyorlar?"
// Kanbanın kopyası değil: kolon yok, tek sütunda kişi sayısına göre sıralı kümeler. Solda büyük "3/5",
// başlık kümenin en kısa noktası, altında alıntılar. Alıntı başka kümeye sürüklenir ya da ayrılır (kilitlenir).
// Tek noktalı kümeler altta katlı "Tek bildirim" bölümünde.

const POINT_DRAG_TYPE = 'application/x-secondmind-point'
const POINTS_VISIBLE = 5

export const PLAYTEST_EMPTY =
  'Test edenlerin mesajlarını olduğu gibi yapıştır. Benzer olanları SecondMind gruplar ve sayar.'

export function PlaytestView({
  project,
  onPaste,
}: {
  project: ProjectSummary
  onPaste: () => void
}) {
  const { data, isPending } = usePlaytest(project.id)
  const [singlesOpen, setSinglesOpen] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)

  if (isPending)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[160px] rounded-tile" />
        <Skeleton className="h-[160px] rounded-tile" />
      </div>
    )
  const clusters = data?.clusters ?? []
  const testers = data?.testers ?? []
  if (!clusters.length)
    return (
      <EmptyState
        className="max-w-[720px]"
        title={PLAYTEST_EMPTY}
        action={{ label: 'Yapıştır', icon: ClipboardPaste, onClick: onPaste }}
      />
    )

  const main = clusters.filter((c) => c.points.length > 1 || c.task)
  const singles = clusters.filter((c) => !main.includes(c))
  const Chevron = singlesOpen ? ChevronDown : ChevronRight
  const card = (c: PlaytestCluster) => (
    <ClusterCard
      key={c.id}
      project={project}
      cluster={c}
      dragging={dragging}
      setDragging={setDragging}
    />
  )

  return (
    <section aria-label="Playtest" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="cx text-ink2">Son 30 günde {testers.length} test eden</span>
        {testers.slice(0, 12).map((t) => (
          <span key={t} className="rounded-full bg-s2 px-3 py-1 text-[13px] font-bold">
            {t}
          </span>
        ))}
        <span className="grow" />
        <span className="text-[13px] font-semibold text-ink3">
          Alıntıyı başka kümeye sürükle ya da ayır
        </span>
      </div>

      {main.map(card)}

      {singles.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={singlesOpen}
            onClick={() => setSinglesOpen(!singlesOpen)}
            // Sürüklenen alıntı katlı bölümün üstünde bekleyince açılır.
            onDragEnter={() => dragging && setSinglesOpen(true)}
            className="flex cursor-pointer items-center gap-1.5 self-start rounded-full px-3 py-1.5 hover:bg-hover focus-visible:outline-3 focus-visible:outline-indigo"
          >
            <Chevron size={16} strokeWidth={1.75} aria-hidden />
            <span className="cx">Tek bildirim · {singles.length}</span>
          </button>
          {singlesOpen && singles.map(card)}
        </div>
      )}
      <p className="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-ink3">
        <Kbd>Ctrl Shift V</Kbd> projenin her yerinde yapıştırır
      </p>
    </section>
  )
}

type CardProps = {
  project: ProjectSummary
  cluster: PlaytestCluster
  dragging: string | null
  setDragging: (id: string | null) => void
}

function ClusterCard({ project, cluster: c, dragging, setDragging }: CardProps) {
  const navigate = useNavigate()
  const move = useMovePoint()
  const convert = useConvertCluster()
  const undo = useUndoPlaytest()
  const { toast } = useToast()
  const [over, setOver] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const own = dragging !== null && c.points.some((p) => p.id === dragging)
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(POINT_DRAG_TYPE) && !own
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const visible = showAll ? c.points : c.points.slice(0, POINTS_VISIBLE)
  const single = c.points.length === 1

  function doConvert(kind: 'bug' | 'task') {
    convert.mutate(
      { clusterId: c.id, kind },
      {
        onSuccess: (r) =>
          toast({
            variant: 'fill',
            domain: 'projects',
            message: `${kind === 'bug' ? 'Hata' : 'Görev'} oldu: ${c.title}`,
            action: { label: 'Geri al', onClick: () => undo.mutate(r.groupId) },
          }),
        onError,
      },
    )
  }

  const column = c.task?.kanbanStatus
    ? COLUMNS.find((col) => col.id === c.task!.kanbanStatus)?.label
    : null

  return (
    <article
      aria-label={`${c.countLabel}: ${c.title}`}
      onDragOver={(e) => {
        if (!accepts(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        setOver(false)
        const pointId = e.dataTransfer.getData(POINT_DRAG_TYPE)
        if (!pointId || own) return
        e.preventDefault()
        move.mutate(
          { pointId, clusterId: c.id },
          {
            onSuccess: (r) =>
              toast({
                domain: 'projects',
                message: 'Alıntı taşındı; bu kümede kalacak.',
                action: { label: 'Geri al', onClick: () => undo.mutate(r.groupId) },
              }),
            onError,
          },
        )
      }}
      className={cn(
        'grid grid-cols-[112px_minmax(0,1fr)_auto] gap-x-5 gap-y-3 rounded-tile bg-s2 px-5 py-[18px]',
        'outline-offset-2 transition-[outline-color,background-color] duration-150',
        over ? 'bg-amber/25 outline-3 outline-amber' : 'outline-3 outline-transparent',
        single && 'py-3.5',
      )}
    >
      <div className="row-span-2 flex flex-col leading-none" aria-hidden>
        <span className="flex items-baseline">
          <span className={cn('x font-black', single ? 'text-[34px]' : 'text-[56px]')}>
            {c.people}
          </span>
          <span className="x text-[22px] font-black text-ink3">/{c.of}</span>
        </span>
        <span className="cx pt-1.5 text-ink3">kişi</span>
      </div>

      <h3
        className={cn(
          'm-0 self-center leading-[1.2] font-extrabold break-words',
          single ? 'text-[17px]' : 'text-[20px]',
        )}
      >
        {c.title}
      </h3>

      <div className="flex items-start justify-end gap-2">
        {c.task ? (
          <>
            <span
              className="cx inline-flex h-[34px] items-center rounded-full px-3 text-fill-ink"
              style={{ backgroundColor: project.color }}
            >
              {KIND_LABEL[c.task.kind]}
              {column && ` · ${column}`}
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="[--btn-soft:var(--bg)]"
              onClick={() => void navigate(`/projeler/${project.id}/gorevler?kart=${c.task!.id}`)}
            >
              Karta git
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              icon={Bug}
              loading={convert.isPending}
              onClick={() => doConvert('bug')}
            >
              Hataya çevir
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={ListPlus}
              className="[--btn-soft:var(--bg)]"
              onClick={() => doConvert('task')}
            >
              Görev
            </Button>
          </>
        )}
      </div>

      <ul className="col-span-2 m-0 flex list-none flex-col gap-1.5 p-0">
        {visible.map((p) => (
          <PointRow
            key={p.id}
            point={p}
            canSplit={!single}
            dragging={dragging === p.id}
            onDragStart={() => setDragging(p.id)}
            onDragEnd={() => setDragging(null)}
          />
        ))}
        {c.points.length > POINTS_VISIBLE && (
          <li>
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="cursor-pointer rounded-full px-2.5 py-1 text-[13px] font-bold text-ink2 hover:bg-hover focus-visible:outline-3 focus-visible:outline-indigo"
            >
              {showAll ? 'Daha az' : `${c.points.length - POINTS_VISIBLE} alıntı daha`}
            </button>
          </li>
        )}
      </ul>
    </article>
  )
}

function PointRow({
  point: p,
  canSplit,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  point: PlaytestPoint
  canSplit: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const split = useSplitPoint()
  const undo = useUndoPlaytest()
  const { toast } = useToast()
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(POINT_DRAG_TYPE, p.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group/point flex cursor-grab items-center gap-3 rounded-[14px] bg-bg py-1.5 pr-1.5 pl-3.5 active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <span className="flex w-[124px] shrink-0 flex-col leading-tight">
        <span className="truncate text-[14px] font-bold">{p.tester || '—'}</span>
        <span className="text-[13px] font-semibold text-ink3 tabular-nums">
          {formatShortDay(p.receivedOn)}
        </span>
      </span>
      <span className="min-w-0 grow text-[15px] leading-[1.4] break-words">{p.text}</span>
      {p.locked && (
        <Lock
          size={14}
          strokeWidth={1.75}
          aria-label="Elle yerleşti"
          className="shrink-0 text-ink3"
        />
      )}
      {canSplit && (
        <IconButton
          label="Ayır"
          icon={Split}
          className="size-8 opacity-0 group-hover/point:opacity-100 focus-visible:opacity-100"
          onClick={() =>
            split.mutate(p.id, {
              onSuccess: (r) =>
                toast({
                  domain: 'projects',
                  message: 'Ayrıldı; kendi kümesinde kalacak.',
                  action: { label: 'Geri al', onClick: () => undo.mutate(r.groupId) },
                }),
              onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
            })
          }
        />
      )}
    </li>
  )
}
