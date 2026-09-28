import { TriangleAlert } from 'lucide-react'
import { TopBar } from '../../app/TopBar'
import { useAppInfo } from '../../lib/app'
import { useSetSetting, useSetting } from '../../lib/settings'
import { Chip, ErrorState, SectionHeader, Skeleton } from '../../ui'
import { RoutinesSection } from './RoutinesSection'

// Ayarlar iskeleti: görünüm, rutinler (3a) ve veri klasörü. Diğer bölümler ilgili aşamalarda eklenir.
export function AyarlarPage() {
  const theme = useSetting('theme')
  const setTheme = useSetSetting('theme')
  const info = useAppInfo()

  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-6">
      <TopBar title="Ayarlar" />

      <section className="flex max-w-[720px] flex-col gap-4 pt-4">
        <SectionHeader title="Görünüm" />
        <div className="flex gap-2">
          <Chip selected={theme.data === 'light'} onClick={() => setTheme.mutate('light')}>
            Açık
          </Chip>
          <Chip selected={theme.data === 'dark'} onClick={() => setTheme.mutate('dark')}>
            Koyu
          </Chip>
        </div>
      </section>

      <RoutinesSection />

      <section className="flex max-w-[720px] flex-col gap-4 pt-4">
        <SectionHeader title="Veri klasörü" />
        {info.isPending && <Skeleton lines={2} className="w-96" />}
        {info.error && (
          <ErrorState
            title="Bilgi alınamadı"
            detail={String(info.error)}
            onRetry={() => void info.refetch()}
          />
        )}
        {info.data && (
          <div className="flex flex-col gap-1">
            <span className="x font-bold">{info.data.dataDir}</span>
            {info.data.dataDirOnOneDrive && (
              <span className="flex items-center gap-2 font-semibold text-t-coral">
                <TriangleAlert size={16} strokeWidth={1.75} aria-hidden />
                Bu klasör OneDrive ile senkronlanıyor, veritabanı bozulabilir. Başka bir yere taşı.
              </span>
            )}
            <span className="text-[13px] font-semibold text-ink3">Sürüm {info.data.version}</span>
          </div>
        )}
      </section>
    </main>
  )
}
