import { Plus } from 'lucide-react'
import { TopBar } from '../../app/TopBar'
import { EmptyState, useToast } from '../../ui'

// Okul — "Bu dönem nasıl gidiyor?" Dönem panosu Aşama 6'da.
export function OkulPage() {
  const { toast } = useToast()
  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-6">
      <TopBar title="Okul" />
      <EmptyState
        className="h-60 max-w-[640px]"
        title="Dönem tanımlanmadı"
        message="Derslerini ve programını gir, SecondMind haftanı kursun."
        action={{
          label: 'Dönem oluştur',
          icon: Plus,
          onClick: () => toast({ message: "Dönem kurulumu Aşama 6'da gelecek.", domain: 'school' }),
        }}
      />
    </main>
  )
}
