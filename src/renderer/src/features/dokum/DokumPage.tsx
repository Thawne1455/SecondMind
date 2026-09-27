import { AlignLeft, FileText, Image as ImageIcon, Trash2 } from 'lucide-react'
import type { DumpItem, DumpKind } from '@shared/ipc'
import { TopBar } from '../../app/TopBar'
import { formatAgo } from '../../lib/format'
import { useNow } from '../../lib/useNow'
import {
  DOMAIN_FILL,
  EmptyState,
  ErrorState,
  IconButton,
  SectionHeader,
  Skeleton,
  useToast,
} from '../../ui'
import { DumpComposer } from './DumpComposer'
import { useDeleteDump, useDumps, useRestoreDump } from './useDumps'

// Döküm — "Aklımdakini nereye atayım?" Üstte geniş giriş alanı, altında bekleyenler kuyruğu.
// AI ile İşle ve İşlenenler / Atlananlar sekmeleri Aşama 4'te.
export function DokumPage() {
  const now = useNow(60_000)
  const dumps = useDumps('pending')

  return (
    <main className="flex min-h-full flex-col gap-8 px-8 pt-[22px] pb-6">
      <TopBar title="Döküm" />
      <div className="flex w-full max-w-[880px] flex-col gap-8">
        <DumpComposer id="dump-page" variant="page" />

        <section aria-labelledby="dump-queue" className="flex flex-col gap-4">
          <SectionHeader
            title={<span id="dump-queue">Bekleyenler</span>}
            description={
              dumps.data?.length ? `${dumps.data.length} öğe AI ile işlenmeyi bekliyor` : undefined
            }
          />
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
            <EmptyState
              className="h-48"
              title="Döküm boş"
              message="Aklına gelen her şeyi buraya at, gerisini SecondMind halleder."
            />
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

const KIND: Record<DumpKind, { label: string; icon: typeof AlignLeft }> = {
  text: { label: 'Metin', icon: AlignLeft },
  image: { label: 'Resim', icon: ImageIcon },
  file: { label: 'Dosya', icon: FileText },
}

function QueueRow({ item, now }: { item: DumpItem; now: number }) {
  const { toast } = useToast()
  const del = useDeleteDump()
  const restore = useRestoreDump()
  const { label, icon: Icon } = KIND[item.kind]
  const cover = item.attachments.find((a) => a.mime.startsWith('image/'))
  const title = item.content || item.attachments.map((a) => a.name).join(', ')
  const meta = [label, item.attachments.length ? `${item.attachments.length} ek` : null]
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
    <li className="group flex items-center gap-4 rounded-block bg-s2 py-2.5 pr-3 pl-2.5">
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
      <IconButton
        label="Dökümü sil"
        icon={Trash2}
        disabled={del.isPending}
        onClick={remove}
        className="bg-transparent opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-s3"
      />
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
