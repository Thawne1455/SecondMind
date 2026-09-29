import { useState, type MouseEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import { FolderPlus, Star, Trash2, X } from 'lucide-react'
import type { ProjectSummary, Shot, TimeMachine as TimeMachineData } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, Chip, cn, IconButton, useToast } from '../../ui'
import { useBindImageDir, useUpdateShot } from './useAssets'

// Zaman makinesi (PROJELER.md > 6. Varlıklar, 5d-4): oyunun zaman içindeki kareleri. Üstte karşılaştırma
// (varsayılan ilk ↔ son; yan yana ya da sürgülü üst üste), altında gün şeridi (en yeni solda; tarih ve o günün
// baskın alanı). Tıklama sağ kareyi, Shift + tıklama sol kareyi seçer. Görüntü klasörleri bağlanır / kaldırılır.

export const SHOTS_EMPTY =
  "Henüz görüntü yok. Köprüyü kur: Play'e her gün ilk girişte bir kare kaydedilir."

const dayText = (day: string) => format(parseISO(day), 'd MMM', { locale: tr })

export function TimeMachine({ project, data }: { project: ProjectSummary; data: TimeMachineData }) {
  const shots = data.shots
  const [pick, setPick] = useState<{ left: string | null; right: string | null }>({
    left: null,
    right: null,
  })
  const [mode, setMode] = useState<'side' | 'slider'>('side')
  // Varsayılan: en eski ↔ en yeni.
  const left = shots.find((s) => s.id === pick.left) ?? shots[shots.length - 1] ?? null
  const right = shots.find((s) => s.id === pick.right) ?? shots[0] ?? null

  function onPick(e: MouseEvent, s: Shot) {
    setPick((p) => (e.shiftKey ? { ...p, left: s.id } : { ...p, right: s.id }))
  }

  return (
    <section aria-label="Zaman makinesi" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="cx m-0 grow">Zaman makinesi · {shots.length}</h2>
        {shots.length > 1 && (
          <>
            <Chip selected={mode === 'side'} onClick={() => setMode('side')}>
              Yan yana
            </Chip>
            <Chip selected={mode === 'slider'} onClick={() => setMode('slider')}>
              Sürgü
            </Chip>
          </>
        )}
      </div>

      <ImageDirs project={project} data={data} />

      {shots.length === 0 ? (
        <p className="m-0 rounded-tile bg-s2 px-6 py-6 text-[16px] font-bold">{SHOTS_EMPTY}</p>
      ) : (
        <>
          {left && right && left.id !== right.id ? (
            <Compare left={left} right={right} mode={mode} />
          ) : (
            right && (
              <img
                src={right.url}
                alt=""
                className="max-h-[420px] w-auto self-start rounded-tile"
              />
            )
          )}
          <span className="text-[13px] font-semibold text-ink3">
            Tıkla: sağdaki kare · Shift + tıkla: soldaki kare. Yıldızlılar devlog taslağına önce
            girer.
          </span>
          <ol className="m-0 flex list-none gap-3 overflow-x-auto p-0 pb-2" aria-label="Kareler">
            {shots.map((s) => (
              <ShotCard
                key={s.id}
                shot={s}
                side={s.id === left?.id ? 'Sol' : s.id === right?.id ? 'Sağ' : null}
                onPick={(e) => onPick(e, s)}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

function Compare({ left, right, mode }: { left: Shot; right: Shot; mode: 'side' | 'slider' }) {
  const [split, setSplit] = useState(50)
  const label = `${dayText(left.takenOn)} ↔ ${dayText(right.takenOn)}`
  if (mode === 'side')
    return (
      <figure className="m-0 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          {[left, right].map((s) => (
            <div key={s.id} className="flex flex-col gap-1.5">
              <img src={s.url} alt="" className="w-full rounded-tile bg-s2 object-contain" />
              <span className="cx text-ink2">
                {dayText(s.takenOn)}
                {s.area && ` · ${s.area}`}
              </span>
            </div>
          ))}
        </div>
        <figcaption className="x text-[20px] font-black">{label}</figcaption>
      </figure>
    )
  return (
    <figure className="m-0 flex max-w-[960px] flex-col gap-2">
      <div className="relative overflow-hidden rounded-tile bg-s2">
        <img src={right.url} alt="" className="block w-full" />
        <img
          src={left.url}
          alt=""
          className="absolute inset-0 block h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
        />
        <span
          className="pointer-events-none absolute inset-y-0 w-[3px] bg-white"
          style={{ left: `${split}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        aria-label="Sürgü"
        onChange={(e) => setSplit(Number(e.target.value))}
        className="accent-ink"
      />
      <figcaption className="x text-[20px] font-black">{label}</figcaption>
    </figure>
  )
}

function ShotCard({
  shot: s,
  side,
  onPick,
}: {
  shot: Shot
  side: 'Sol' | 'Sağ' | null
  onPick: (e: MouseEvent) => void
}) {
  const update = useUpdateShot()
  const { toast } = useToast()
  return (
    <li className="group/shot relative flex w-[180px] shrink-0 flex-col gap-1.5">
      <button
        type="button"
        onClick={onPick}
        aria-pressed={side !== null}
        aria-label={`${dayText(s.takenOn)} karesi`}
        className={cn(
          'aspect-video cursor-pointer overflow-hidden rounded-[18px] bg-s2 focus-visible:outline-3 focus-visible:outline-indigo',
          side && 'outline-3 outline-offset-2 outline-ink',
        )}
      >
        <img src={s.url} alt="" loading="lazy" className="h-full w-full object-cover" />
      </button>
      {side && (
        <span className="cx absolute top-2 left-2 rounded-full bg-ink px-2 py-0.5 text-on-ink">
          {side}
        </span>
      )}
      <div className="flex items-center gap-1">
        <span className="min-w-0 grow truncate text-[13px] font-bold">
          {dayText(s.takenOn)}
          {s.area && <span className="font-semibold text-ink3"> · {s.area}</span>}
        </span>
        <IconButton
          label={s.starred ? 'Yıldızı kaldır' : 'Yıldızla'}
          icon={Star}
          className={cn('size-7', s.starred && '[&_svg]:fill-amber [&_svg]:text-amber')}
          onClick={() => update.mutate({ id: s.id, starred: !s.starred })}
        />
        <IconButton
          label="Kareyi sil"
          icon={Trash2}
          className="size-7 opacity-0 group-hover/shot:opacity-100 focus-visible:opacity-100"
          onClick={() =>
            update.mutate(
              { id: s.id, deleted: true },
              {
                onSuccess: () =>
                  toast({
                    domain: 'projects',
                    message: 'Kare çöp kutusunda.',
                    action: {
                      label: 'Geri al',
                      onClick: () => update.mutate({ id: s.id, deleted: false }),
                    },
                  }),
              },
            )
          }
        />
      </div>
    </li>
  )
}

function ImageDirs({ project, data }: { project: ProjectSummary; data: TimeMachineData }) {
  const bind = useBindImageDir()
  const { toast } = useToast()
  if (!data.hasFolder) return null
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  if (!data.bound.length && !data.suggestions.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-semibold text-ink3">Görüntü klasörleri:</span>
      {data.bound.map((d) => (
        <span
          key={d.folderId + d.path}
          className="inline-flex h-[30px] items-center gap-1 rounded-full py-0 pr-1 pl-3 text-[13px] font-bold text-fill-ink"
          style={{ backgroundColor: project.color }}
        >
          {d.path} · {d.images}
          <IconButton
            label={`${d.path} bağını kaldır`}
            icon={X}
            variant="onTileGhost"
            className="size-6"
            onClick={() =>
              bind.mutate({ folderId: d.folderId, path: d.path, bound: false }, { onError })
            }
          />
        </span>
      ))}
      {data.suggestions.slice(0, 4).map((d) => (
        <Button
          key={d.folderId + d.path}
          size="sm"
          variant="secondary"
          icon={FolderPlus}
          loading={bind.isPending}
          title="Bağlanınca yeni görüntüler dosya tarihine göre eklenir"
          onClick={() =>
            bind.mutate(
              { folderId: d.folderId, path: d.path, bound: true },
              {
                onSuccess: (r) =>
                  toast({
                    domain: 'projects',
                    message: `${d.path} bağlandı · ${r.added} kare eklendi.`,
                  }),
                onError,
              },
            )
          }
        >
          {d.path} · {d.images}
        </Button>
      ))}
    </div>
  )
}
