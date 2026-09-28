import { useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, FolderPlus, Plus } from 'lucide-react'
import { TopBar } from '../../app/TopBar'
import { useShell } from '../../app/shell-context'
import { formatMinutes } from '../../lib/format'
import { useNow } from '../../lib/useNow'
import { Button, EmptyState, ErrorState, Kbd, Skeleton } from '../../ui'
import { ProjectStrip } from './ProjectStrip'
import { useProjects } from './useProjects'

// Projeler — "Nerede kaldım, sırada ne var, proje nereye gidiyor?" Liste = tam genişlikte şeritler:
// aktifler (oturumu süren önce, sonra son etkinlik), altında duraklatılmışlar, en altta katlı arşiv.
export function ProjelerPage() {
  const { data, isPending, isError, refetch } = useProjects()
  const { openProjectCreate } = useShell()
  const now = useNow(30_000)
  const [showArchive, setShowArchive] = useState(false)
  const strips = useRef<(HTMLElement | null)[]>([])

  const projects = data ?? []
  const active = projects.filter((p) => p.status === 'active')
  const paused = projects.filter((p) => p.status === 'paused')
  const archived = projects.filter((p) => p.status === 'archived')
  const visible = [...active, ...paused, ...(showArchive ? archived : [])]
  const week = active.reduce((sum, p) => sum + p.weekMinutes, 0)

  // ↑ ↓ şeritler arasında gezer.
  function move(e: KeyboardEvent<HTMLElement>, index: number) {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    strips.current[Math.min(visible.length - 1, Math.max(0, index + step))]?.focus()
  }

  const strip = (p: (typeof projects)[number]) => {
    const i = visible.indexOf(p)
    return (
      <ProjectStrip
        key={p.id}
        project={p}
        now={now}
        ref={(el) => {
          strips.current[i] = el
        }}
        onKeyDown={(e) => move(e, i)}
      />
    )
  }

  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-8">
      <TopBar title="Projeler" />

      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[148px] rounded-tile" />
          <Skeleton className="h-[148px] rounded-tile" />
        </div>
      ) : isError ? (
        <ErrorState
          title="Projeler okunamadı."
          onRetry={() => void refetch()}
          className="max-w-[640px]"
        />
      ) : projects.length === 0 ? (
        <EmptyState
          className="h-60 max-w-[640px]"
          title="Henüz proje yok"
          message="Bir klasör bağla, SecondMind takibe başlasın."
          action={{ label: 'Klasör bağla', icon: FolderPlus, onClick: openProjectCreate }}
        />
      ) : (
        <>
          <div className="flex items-end gap-4 border-b-3 border-ink pb-3">
            <h2 className="x m-0 text-[28px] leading-none font-black uppercase">
              {active.length} aktif
            </h2>
            <span className="pb-0.5 text-[15px] font-semibold text-ink2">
              Bu hafta {formatMinutes(week)} çalıştın
            </span>
            <span className="grow" />
            <span className="hidden items-center gap-1.5 pb-1 text-[13px] font-semibold text-ink3 xl:flex">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> seç · <Kbd>B</Kbd> başla · <Kbd>P</Kbd> park · <Kbd>Ctrl Alt P</Kbd> her
              yerden park
            </span>
            <Button icon={Plus} onClick={openProjectCreate} title="Ctrl Shift N">
              Proje
            </Button>
          </div>

          <div className="flex flex-col gap-3">{active.map(strip)}</div>

          {paused.length > 0 && (
            <>
              <h3 className="cx m-0 pt-2 text-ink3">Duraklatılmış · {paused.length}</h3>
              <div className="flex flex-col gap-3">{paused.map(strip)}</div>
            </>
          )}

          {archived.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={showArchive}
                onClick={() => setShowArchive((v) => !v)}
                className="cx flex w-fit cursor-pointer items-center gap-1.5 pt-2 text-ink3 hover:text-ink focus-visible:outline-3 focus-visible:outline-indigo"
              >
                <ChevronDown
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                  className={showArchive ? 'rotate-180' : undefined}
                />
                Arşiv · {archived.length}
              </button>
              {showArchive && <div className="flex flex-col gap-3">{archived.map(strip)}</div>}
            </>
          )}
        </>
      )}
    </main>
  )
}
