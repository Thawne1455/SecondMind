import { useState } from 'react'
import { format, startOfDay } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Undo2 } from 'lucide-react'
import type { ActivityActorName, ActivityEntry, ActivityFilter } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatDayName } from '../../lib/format'
import { Button, Chip, cn, EmptyState, ErrorState, Skeleton, useToast } from '../../ui'
import { useActivity, useUndoActivity } from './useOnay'

// İşlem günlüğü: uygulanmış değişiklikler gün gün, kim yaptı (AI / Taha / tarama / sistem). Geri al sadece AI'ın ve
// Taha'nın gruplu işlemlerinde (tekil düzenlemeler listelenir ama geri alınmaz). Varsayılan filtre AI.

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'ai', label: 'AI' },
  { id: 'taha', label: 'Taha' },
  { id: 'scan', label: 'Tarama' },
  { id: 'all', label: 'Hepsi' },
]

const ACTOR: Record<ActivityActorName, { label: string; className: string }> = {
  ai: { label: 'AI', className: 'bg-amber text-fill-ink' },
  taha: { label: 'Taha', className: 'bg-ink text-on-ink' },
  scan: { label: 'Tarama', className: 'bg-green text-fill-ink' },
  system: { label: 'Sistem', className: 'bg-s3 text-ink2' },
}

const PAGE_DAYS = 30

export function ActivityLog() {
  const [actor, setActor] = useState<ActivityFilter>('ai')
  const [days, setDays] = useState(PAGE_DAYS)
  const list = useActivity(actor, days)
  const now = new Date()

  return (
    <section aria-label="İşlem günlüğü" className="flex flex-col gap-5">
      <nav aria-label="Kim yaptı" className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            selected={actor === f.id}
            onClick={() => {
              setActor(f.id)
              setDays(PAGE_DAYS)
            }}
          >
            {f.label}
          </Chip>
        ))}
        <span className="ml-2 text-[13px] font-semibold text-ink3">Son {days} gün</span>
      </nav>

      {list.isPending ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} shape="field" className="h-12" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState
          title="Günlük okunamadı"
          detail="Veritabanından kayıtlar alınamadı."
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : list.data.entries.length === 0 ? (
        <EmptyState
          className="h-44"
          title="Bu aralıkta kayıt yok"
          message={
            actor === 'ai'
              ? 'Onayladığın öneriler burada görünür, istersen geri alırsın.'
              : 'Bu filtreye uyan değişiklik yok.'
          }
          action={
            list.data.hasMore
              ? { label: 'Daha eski', onClick: () => setDays((d) => d + PAGE_DAYS) }
              : undefined
          }
        />
      ) : (
        <>
          {byDay(list.data.entries).map(([day, entries]) => (
            <div key={day} className="flex flex-col gap-1">
              <h3 className="cx m-0 pb-1.5 text-ink3">{dayLabel(Number(day), now)}</h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {entries.map((e) => (
                  <EntryRow key={e.key} entry={e} />
                ))}
              </ul>
            </div>
          ))}
          {list.data.hasMore && (
            <Button
              variant="secondary"
              className="self-start"
              loading={list.isFetching}
              onClick={() => setDays((d) => d + PAGE_DAYS)}
            >
              Daha eski
            </Button>
          )}
        </>
      )}
    </section>
  )
}

function byDay(entries: ActivityEntry[]): [string, ActivityEntry[]][] {
  const out = new Map<string, ActivityEntry[]>()
  for (const e of entries) {
    const key = String(startOfDay(e.at).getTime())
    out.set(key, [...(out.get(key) ?? []), e])
  }
  return [...out.entries()]
}

/** "Bugün · 3 Eki", "Dün · 2 Eki", "Pazartesi 28 Eyl". */
function dayLabel(day: number, now: Date): string {
  const d = new Date(day)
  const near = formatDayName(d, now)
  const date = format(d, d.getFullYear() === now.getFullYear() ? 'd MMM' : 'd MMM yyyy', {
    locale: tr,
  })
  return near === 'Bugün' || near === 'Dün'
    ? `${near} · ${date}`
    : `${format(d, 'EEEE', { locale: tr })} ${date}`
}

function EntryRow({ entry }: { entry: ActivityEntry }) {
  const { toast } = useToast()
  const undo = useUndoActivity()
  const actor = ACTOR[entry.actor]
  const [first, ...rest] = entry.lines

  return (
    <li
      className={cn(
        'flex items-start gap-4 rounded-block px-4 py-2.5 transition-colors duration-150 hover:bg-s2',
        entry.undone && 'opacity-60',
      )}
    >
      <span className="x w-12 shrink-0 pt-0.5 text-[14px] font-semibold text-ink3">
        {format(entry.at, 'HH:mm')}
      </span>
      <span
        className={cn(
          'cx inline-flex h-6 w-[74px] shrink-0 items-center justify-center rounded-full text-[12px]',
          actor.className,
        )}
      >
        {actor.label}
      </span>
      <div className="flex min-w-0 grow flex-col gap-0.5 pt-px">
        <span className={cn('truncate font-bold', entry.undone && 'line-through')}>
          {entry.isUndo && <span className="font-semibold text-ink3">Geri alma · </span>}
          {first}
        </span>
        {rest.map((line, i) => (
          <span key={i} className="truncate text-[14px] text-ink2">
            {line}
          </span>
        ))}
        {entry.more > 0 && (
          <span className="text-[13px] font-semibold text-ink3">+{entry.more} değişiklik daha</span>
        )}
      </div>
      {entry.undone ? (
        <span className="shrink-0 pt-0.5 text-[13px] font-semibold text-ink3">Geri alındı</span>
      ) : (
        entry.undoable &&
        entry.groupId && (
          <Button
            variant="secondary"
            size="xs"
            icon={Undo2}
            className="shrink-0 [--btn-soft:var(--s3)]"
            loading={undo.isPending}
            onClick={() =>
              undo.mutate(entry.groupId!, {
                onError: (e) =>
                  toast({
                    variant: 'band',
                    domain: 'warning',
                    title: 'Geri alınamadı',
                    message: errorText(e),
                  }),
              })
            }
          >
            Geri al
          </Button>
        )
      )}
    </li>
  )
}
