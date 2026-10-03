import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AlignLeft, FileText, Image as ImageIcon, RotateCcw, Trash2 } from 'lucide-react'
import type { AiRun, DumpItem, DumpKind, DumpStatus } from '@shared/ipc'
import { TopBar } from '../../app/TopBar'
import { modelLabel, opLabel, progressLabel, resultStatusText } from '../../lib/aiText'
import { errorText } from '../../lib/errors'
import { formatAgo } from '../../lib/format'
import { useNow } from '../../lib/useNow'
import {
  Button,
  Chip,
  cn,
  DOMAIN_FILL,
  EmptyState,
  ErrorState,
  IconButton,
  ON_BAND,
  Skeleton,
  Tag,
  useToast,
} from '../../ui'
import { DumpComposer } from './DumpComposer'
import { useAiCancel, useAiStatus } from './useAi'
import { useDeleteDump, useDumps, useRequeueDump, useRestoreDump } from './useDumps'

// Döküm — "Aklımdakini nereye atayım?" Üstte geniş giriş alanı, altında sekmeli kuyruk: Bekleyenler (işlenenler
// iskeletle), İşlenenler (hangi önerilere dönüştü), Atlananlar (AI'ın gerekçesi, yeniden kuyruğa alma).
// "AI ile İşle" üst çubukta (AiButton); çalışırken burada ilerleme şeridi ve İptal.

type Tab = Extract<DumpStatus, 'pending' | 'processed' | 'skipped'>

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Bekleyenler' },
  { id: 'processed', label: 'İşlenenler' },
  { id: 'skipped', label: 'Atlananlar' },
]

const EMPTY: Record<Tab, { title: string; message: string }> = {
  pending: {
    title: 'Döküm boş',
    message: 'Aklına gelen her şeyi buraya at, gerisini SecondMind halleder.',
  },
  processed: {
    title: 'Henüz işlenen yok',
    message: "AI ile İşle'ye bastığında dökümler önerilere dönüşüp burada görünür.",
  },
  skipped: {
    title: 'Atlanan yok',
    message: "AI'ın ne yapacağını bilemediği dökümler burada durur.",
  },
}

export function DokumPage() {
  const now = useNow(60_000)
  const [tab, setTab] = useState<Tab>('pending')
  const dumps = useDumps(tab)
  const running = useAiStatus().data?.running ?? null

  return (
    <main className="flex min-h-full flex-col gap-8 px-8 pt-[22px] pb-6">
      <TopBar title="Döküm" />
      <div className="flex w-full max-w-[880px] flex-col gap-8">
        <DumpComposer id="dump-page" variant="page" />

        <section aria-label="Döküm kuyruğu" className="flex flex-col gap-4">
          {running && <ProgressBand run={running} />}
          <nav aria-label="Döküm sekmeleri" className="flex items-center gap-2">
            {TABS.map((t) => (
              <Chip
                key={t.id}
                selected={tab === t.id}
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </Chip>
            ))}
            {tab === 'pending' && dumps.data && dumps.data.length > 0 && (
              <span className="ml-2 text-[14px] font-medium text-ink3">
                {dumps.data.length} öğe
              </span>
            )}
          </nav>

          {dumps.isPending ? (
            <QueueSkeleton />
          ) : dumps.isError ? (
            <ErrorState
              title="Döküm okunamadı"
              detail="Veritabanından liste alınamadı."
              onRetry={() => void dumps.refetch()}
              retrying={dumps.isFetching}
            />
          ) : dumps.data.length === 0 ? (
            <EmptyState className="h-48" {...EMPTY[tab]} />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {dumps.data.map((item) => (
                <QueueRow key={item.id} item={item} now={now} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}

/** Siyah şerit: "İşleniyor 3/5 · Hızlı · Qwen yazıyor %40" + İptal. */
function ProgressBand({ run }: { run: AiRun }) {
  const { toast } = useToast()
  const cancel = useAiCancel()
  const stage = run.current
    ? [
        modelLabel(run.current.model),
        run.current.message,
        run.current.ratio !== null ? `%${Math.round(run.current.ratio * 100)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Hazırlanıyor'
  const share = run.total ? run.done / run.total : 0

  return (
    <div
      role="status"
      className={cn(
        'relative flex items-center gap-4 overflow-hidden rounded-block bg-band px-5 py-3',
        ON_BAND,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-amber/25 transition-[width] duration-300"
        style={{ width: `${Math.max(share, run.current?.ratio ? 0.02 : 0) * 100}%` }}
      />
      <span className="relative text-[15px] font-black tracking-[.03em] uppercase">
        {progressLabel(run)}
      </span>
      <span className="relative min-w-0 grow truncate text-[14px] font-medium text-white/70">
        {run.cancelling ? 'İptal ediliyor…' : stage}
      </span>
      <Button
        variant="onTileGhost"
        size="sm"
        className="relative"
        disabled={run.cancelling || cancel.isPending}
        onClick={() =>
          cancel.mutate(undefined, {
            onError: (e) => toast({ variant: 'band', domain: 'warning', message: errorText(e) }),
          })
        }
      >
        İptal
      </Button>
    </div>
  )
}

const KIND: Record<DumpKind, { label: string; icon: typeof AlignLeft }> = {
  text: { label: 'Metin', icon: AlignLeft },
  image: { label: 'Resim', icon: ImageIcon },
  file: { label: 'Dosya', icon: FileText },
}

function QueueRow({ item, now }: { item: DumpItem; now: number }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const del = useDeleteDump()
  const restore = useRestoreDump()
  const requeue = useRequeueDump()
  const { label, icon: Icon } = KIND[item.kind]
  const cover = item.attachments.find((a) => a.mime.startsWith('image/'))
  const title = item.content || item.attachments.map((a) => a.name).join(', ')
  const processing = item.status === 'processing'
  const meta = [
    label,
    item.attachments.length ? `${item.attachments.length} ek` : null,
    processing ? 'AI işliyor' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  function remove() {
    del.mutate(item.id, {
      onSuccess: () =>
        toast({
          variant: 'band',
          domain: 'dump',
          message: 'Döküm çöp kutusuna taşındı.',
          action: { label: 'Geri al', onClick: () => restore.mutate(item.id) },
        }),
    })
  }

  return (
    <li
      aria-busy={processing || undefined}
      className={cn(
        'group flex flex-col gap-2.5 rounded-block py-2.5 pr-3 pl-2.5',
        processing
          ? 'animate-shimmer bg-[linear-gradient(90deg,var(--s2)_0%,var(--s3)_50%,var(--s2)_100%)] bg-size-[200%_100%] motion-reduce:animate-none'
          : 'bg-s2',
      )}
    >
      <div className="flex items-center gap-4">
        <span
          className={`flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px] ${DOMAIN_FILL.dump}`}
        >
          {cover ? (
            <img src={cover.url} alt="" className="size-full object-cover" draggable={false} />
          ) : (
            <Icon size={20} strokeWidth={1.75} aria-hidden />
          )}
        </span>
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <p className="m-0 line-clamp-2 text-[16px] leading-[1.4] font-bold break-words whitespace-pre-line">
            {title}
          </p>
          <span className="text-[13px] font-medium text-ink3">{meta}</span>
        </div>
        <time
          dateTime={new Date(item.createdAt).toISOString()}
          className="shrink-0 text-[14px] font-medium text-ink2"
        >
          {formatAgo(item.createdAt, now)}
        </time>
        {item.status === 'skipped' && (
          <Button
            variant="secondary"
            size="sm"
            icon={RotateCcw}
            disabled={requeue.isPending}
            onClick={() => requeue.mutate(item.id)}
            className="bg-s3 enabled:hover:bg-bg"
          >
            Yeniden işle
          </Button>
        )}
        {processing ? (
          // Sil butonunun yeri korunur: işlenirken satır kaymasın.
          <span aria-hidden className="size-[34px] shrink-0" />
        ) : (
          <IconButton
            label="Dökümü sil"
            icon={Trash2}
            disabled={del.isPending}
            onClick={remove}
            className="bg-transparent opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-s3"
          />
        )}
      </div>

      {item.status === 'skipped' && (
        <p className="m-0 pl-20 text-[14px] leading-[1.45] font-medium text-ink2">
          <span className="font-bold text-ink">AI: </span>
          {item.skipReason ?? 'Gerekçe yok'}
        </p>
      )}

      {item.status === 'processed' && item.results.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 pl-20">
          {item.results.map((r) => (
            <li key={r.proposalId} className="flex min-w-0 items-center gap-2.5">
              <Tag className="bg-bg">{opLabel(r.op)}</Tag>
              <span
                className={cn(
                  'min-w-0 grow truncate text-[14px] font-semibold',
                  (r.status === 'rejected' || r.undone) && 'text-ink3 line-through',
                )}
              >
                {r.summary}
              </span>
              {r.status === 'pending' && !r.undone ? (
                <button
                  type="button"
                  onClick={() => void navigate('/onay')}
                  className="shrink-0 cursor-pointer text-[13px] font-bold text-ink2 underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo"
                >
                  {resultStatusText(r)}
                </button>
              ) : (
                <span className="shrink-0 text-[13px] font-medium text-ink3">
                  {resultStatusText(r)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function QueueSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-label="Yükleniyor" role="status">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[68px] w-full" shape="field" />
      ))}
    </div>
  )
}
