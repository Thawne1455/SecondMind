import { TopBar } from '../../app/TopBar'
import { EmptyState } from '../../ui'

// Onay Kutusu — "AI ne yapmak istiyor?" Öneriler ve fark karoları Aşama 4'te.
export function OnayPage() {
  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-6">
      <TopBar title="Onay Kutusu" />
      <EmptyState
        className="h-60 max-w-[640px]"
        title="Bekleyen öneri yok"
        message="Dökümleri AI ile işlediğinde öneriler burada onayını bekler."
      />
    </main>
  )
}
