import type { ReactNode } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { usePendingDumpCount } from '../features/dokum/useDumps'
import { Badge, Button, cn } from '../ui'
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
  const dumpCount = usePendingDumpCount()

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

      {/* Tarama Aşama 5'te, AI akışı Aşama 4'te; şimdilik sadece görünüm. */}
      <Button variant="secondary" icon={RefreshCw}>
        Güncelle
        <span className="ml-2 text-[13px] font-medium text-ink3">2 sa önce</span>
      </Button>
      <Button variant="ai">
        AI ile İşle
        {dumpCount > 0 && <Badge count={dumpCount} className="ml-2" />}
      </Button>
      <Button icon={Plus} onClick={openQuickDump}>
        Döküm
      </Button>
    </header>
  )
}
