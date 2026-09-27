import { useRef, type KeyboardEvent } from 'react'
import { cn } from './cn'
import { DOMAIN_FILL, type Domain } from './domain'

const VALUES = [1, 2, 3, 4, 5] as const
export type ScaleValue = (typeof VALUES)[number]

const STEP: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }

type ScaleProps = {
  value: ScaleValue | null
  onChange: (value: ScaleValue) => void
  /** Ekran okuyucu adı ("Ruh hâli"). */
  label: string
  /** Segment zemini alan renginde (örn. Zihin'de leylak). Verilmezse nötr s3. */
  domain?: Domain
  className?: string
}

/** 1–5 ölçek seçici. Klavyede ok tuşlarıyla değişir (radio grubu). */
export function Scale({ value, onChange, label, domain, className }: ScaleProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const focusIndex = value ? value - 1 : 0

  function onKeyDown(e: KeyboardEvent) {
    const delta = STEP[e.key]
    if (!delta) return
    e.preventDefault()
    const next = Math.min(VALUES.length - 1, Math.max(0, focusIndex + delta))
    onChange(VALUES[next] ?? 1)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'flex gap-1.5 rounded-field p-[3px]',
        domain ? DOMAIN_FILL[domain] : 'bg-s2',
        className,
      )}
    >
      {VALUES.map((v, i) => {
        const selected = v === value
        return (
          <button
            key={v}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === focusIndex ? 0 : -1}
            onClick={() => onChange(v)}
            className={cn(
              'wide h-10 grow cursor-pointer rounded-xl text-[15px] font-extrabold tabular-nums',
              'transition-[transform,background-color] duration-150 active:scale-[.96]',
              'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
              domain
                ? selected
                  ? 'bg-fill-ink text-white'
                  : 'bg-[rgba(19,19,22,.08)] text-fill-ink hover:bg-[rgba(19,19,22,.14)]'
                : selected
                  ? 'bg-ink text-on-ink'
                  : 'bg-s3 text-ink hover:bg-line',
            )}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}
