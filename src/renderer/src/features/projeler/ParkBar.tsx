import { useRef, useState, type KeyboardEvent } from 'react'
import { Check, CornerDownLeft } from 'lucide-react'
import { PARKING_TEXT_MAX, type ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { cn } from '../../ui'
import { defaultParkProject } from './labels'
import { useAddParking } from './useProjects'

// Park çubuğu (PROJELER.md "Park alanı"): siyah bant, solda proje çipi, tek satır. Tab projeyi
// değiştirir, Enter park eder, Esc vazgeçer. Küresel pencere (Ctrl Alt P) ve uygulama içi P aynı çubuğu kullanır.
// Her açılışta yeniden bağlanır (key), alan boş ve proje varsayılana dönmüş gelir.

type Props = {
  projects: readonly ProjectSummary[]
  /** Açık sayfanın projesi (uygulama içinde). */
  preferredId?: string | null
  source: 'shortcut' | 'app'
  /** Park edildi ya da vazgeçildi. */
  onDone: (parked: boolean) => void
  className?: string
}

export function ParkBar({ projects, preferredId, source, onDone, className }: Props) {
  const live = projects.filter((p) => p.status !== 'archived')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const add = useAddParking()

  const project =
    live.find((p) => p.id === projectId) ?? defaultParkProject(live, preferredId ?? null)

  function cycle(step: number) {
    if (!project || live.length < 2) return
    const i = live.findIndex((p) => p.id === project.id)
    setProjectId(live[(i + step + live.length) % live.length]!.id)
  }

  function submit() {
    const value = text.trim()
    if (!value || !project || add.isPending) return
    add.mutate(
      { projectId: project.id, text: value, source },
      {
        onSuccess: () => {
          setFlash(project.name)
          setText('')
          // Onay bir an görünsün, sonra kaybolsun.
          setTimeout(() => onDone(true), 380)
        },
        onError: (e) => setError(errorText(e)),
      },
    )
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      cycle(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onDone(false)
    }
  }

  if (!project) {
    return (
      <div
        className={cn(
          'flex h-full items-center bg-band px-6 text-[16px] font-semibold text-white/70',
          className,
        )}
      >
        Önce bir proje oluştur; park alanı projeye bağlıdır.
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col justify-center gap-1.5 bg-band px-4 text-white',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          tabIndex={-1}
          title="Tab: proje değiştir"
          onClick={() => {
            cycle(1)
            input.current?.focus()
          }}
          className="cx flex h-10 max-w-[200px] shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-fill-ink"
          style={{ backgroundColor: project.color }}
        >
          <span className="truncate">{project.name}</span>
          {live.length > 1 && <span className="opacity-60">⇥</span>}
        </button>
        {flash ? (
          <span
            className="flex grow items-center gap-2 text-[20px] font-extrabold"
            style={{ color: project.color }}
          >
            <Check size={22} strokeWidth={3} aria-hidden />
            {flash} · Sonra listesine atıldı
          </span>
        ) : (
          <input
            ref={input}
            autoFocus
            data-autofocus
            value={text}
            maxLength={PARKING_TEXT_MAX}
            aria-label={`${project.name} projesine park et`}
            placeholder="Aklına geleni at, akışını bozma…"
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            onKeyDown={onKeyDown}
            className="h-10 min-w-0 grow bg-transparent text-[20px] font-bold text-white outline-none placeholder:text-white/40"
          />
        )}
        <span
          aria-hidden
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
            text.trim() ? 'bg-white text-fill-ink' : 'bg-white/10 text-white/50',
          )}
        >
          <CornerDownLeft size={17} strokeWidth={2.25} />
        </span>
      </div>
      <span
        className={cn('pl-1 text-[13px] font-semibold', error ? 'text-[#FF8A7A]' : 'text-white/45')}
      >
        {error ?? 'Enter park eder · Tab proje değiştirir · Esc kapatır'}
      </span>
    </div>
  )
}
