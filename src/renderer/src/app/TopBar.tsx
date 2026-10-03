import type { ReactNode } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { AiButton } from '../features/dokum/AiButton'
import { useLastScanAt, useProjects, useScan } from '../features/projeler/useProjects'
import { errorText } from '../lib/errors'
import { formatAgo } from '../lib/format'
import { useNow } from '../lib/useNow'
import { Button, cn, useToast } from '../ui'
import { useShell } from './shell-context'

type TopBarProps = {
  /** Sayfa başlığı ("Pazar 27 Eylül", "Döküm"); büyük harfe CSS çevirir (lang="tr"). */
  title: ReactNode
  /** Başlığın yanında durum rozeti (örn. kaçan hatırlatmalar). */
  status?: ReactNode
  className?: string
}

/** Üst çubuk: solda sayfa başlığı, sağda arama ve genel eylemler. Her sayfa kendisi yerleştirir. */
export function TopBar({ title, status, className }: TopBarProps) {
  const { openPalette, openQuickDump } = useShell()
  const scan = useUpdateButton()

  return (
    <header className={cn('flex h-[42px] shrink-0 items-center gap-2.5', className)}>
      <h1 className="x m-0 text-[16px] font-black tracking-[.03em] uppercase">{title}</h1>
      {status}
      <span className="grow" />

      <button
        type="button"
        onClick={openPalette}
        className={cn(
          'flex h-[42px] w-[250px] shrink-0 cursor-pointer items-center justify-between gap-2 rounded-full bg-s2 px-5 text-[15px] whitespace-nowrap',
          'font-medium text-ink2 transition-colors duration-150 hover:bg-s3',
          'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
        )}
      >
        Ara veya komut yaz…
        <span className="cx text-ink3">Ctrl K</span>
      </button>

      <Button
        variant="secondary"
        icon={RefreshCw}
        onClick={scan.run}
        loading={scan.loading}
        loadingLabel={scan.loadingLabel}
      >
        Güncelle
        {scan.ago && <span className="ml-2 text-[13px] font-medium text-ink3">{scan.ago}</span>}
      </Button>
      <AiButton />
      <Button icon={Plus} onClick={openQuickDump}>
        Döküm
      </Button>
    </header>
  )
}

/** Güncelle: bağlı klasörleri tarar, sonucu toast'la söyler. Yanında son tarama zamanı. */
function useUpdateButton() {
  const { toast } = useToast()
  const scan = useScan()
  const now = useNow(60_000)
  const lastScanAt = useLastScanAt()
  const folders = (useProjects().data ?? []).filter(
    (p) => p.folderPath && p.status !== 'archived',
  ).length

  function run() {
    scan.mutate(undefined, {
      onSuccess: (report) => {
        const errors = report.projects.flatMap((p) => p.errors.map((e) => `${p.name}: ${e}`))
        if (report.folders === 0)
          toast({ message: 'Taranacak klasör yok. Bir projeye klasör bağla.', domain: 'projects' })
        else
          toast({
            title: 'Tarama bitti',
            message: report.toast ?? 'Yeni bir şey yok.',
            variant: 'band',
            domain: 'projects',
          })
        if (errors.length) toast({ message: errors.join(' · '), domain: 'warning', duration: 0 })
      },
      onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
    })
  }

  return {
    run,
    loading: scan.isPending,
    loadingLabel: folders > 1 ? `${folders} klasör taranıyor…` : 'Taranıyor…',
    ago: lastScanAt === null ? null : formatAgo(lastScanAt, now),
  }
}
