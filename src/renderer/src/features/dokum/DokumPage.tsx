import { Plus } from 'lucide-react'
import { TopBar } from '../../app/TopBar'
import { useShell } from '../../app/shell-context'
import { EmptyState } from '../../ui'

// Döküm — "Aklımdakini nereye atayım?" Giriş alanı ve kuyruk Aşama 2'de.
export function DokumPage() {
  const { openQuickDump } = useShell()
  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-6">
      <TopBar title="Döküm" />
      <EmptyState
        className="h-60 max-w-[640px]"
        title="Döküm boş"
        message="Aklına gelen her şeyi buraya at, gerisini SecondMind halleder."
        action={{ label: 'Döküm', icon: Plus, onClick: openQuickDump }}
      />
    </main>
  )
}
