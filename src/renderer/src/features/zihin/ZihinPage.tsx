import { TopBar } from '../../app/TopBar'
import { EmptyState } from '../../ui'

// Zihin — "Nasılım, beni ne etkiliyor?" Kayıtlar Aşama 3'te, eğilimler Aşama 7'de.
export function ZihinPage() {
  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-6">
      <TopBar title="Zihin" />
      <EmptyState
        className="h-60 max-w-[640px]"
        title="Henüz kayıt yok"
        message="Bugün'deki Nasılsın? karosunu doldur; birkaç hafta sonra burada örüntüler görünecek."
      />
    </main>
  )
}
