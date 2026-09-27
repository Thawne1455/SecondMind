import { Plus } from 'lucide-react'
import { TopBar } from '../../app/TopBar'
import { EmptyState, useToast } from '../../ui'

// Projeler — "Nerede kaldım, sırada ne var?" Şeritler ve kokpit Aşama 5'te.
export function ProjelerPage() {
  const { toast } = useToast()
  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-6">
      <TopBar title="Projeler" />
      <EmptyState
        className="h-60 max-w-[640px]"
        title="Henüz proje yok"
        message="Bir klasör bağla, SecondMind takibe başlasın."
        action={{
          label: 'Klasör bağla',
          icon: Plus,
          onClick: () =>
            toast({ message: "Klasör bağlama Aşama 5'te gelecek.", domain: 'projects' }),
        }}
      />
    </main>
  )
}
