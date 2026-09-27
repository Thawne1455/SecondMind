import { Plus } from 'lucide-react'
import { TopBar } from '../../app/TopBar'
import { EmptyState, useToast } from '../../ui'

// Bilgi — "Şunu nereye yazmıştım?" Üç panelli arşiv Aşama 2'de.
export function BilgiPage() {
  const { toast } = useToast()
  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-6">
      <TopBar title="Bilgi" />
      <EmptyState
        className="h-60 max-w-[640px]"
        title="Henüz not yok"
        message="İlk notunu yaz ya da bir döküm at; SecondMind doğru koleksiyona yerleştirir."
        action={{
          label: 'Yeni not',
          icon: Plus,
          onClick: () => toast({ message: "Notlar Aşama 2'de gelecek.", domain: 'knowledge' }),
        }}
      />
    </main>
  )
}
