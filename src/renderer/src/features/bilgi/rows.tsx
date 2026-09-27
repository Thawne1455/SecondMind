import type { ReactNode } from 'react'
import { cn, Skeleton } from '../../ui'

// Not ve fikir listelerinin ortak satır parçaları.

export const UNTITLED = 'Adsız not'

export function Title({ text, fallback = UNTITLED }: { text: string; fallback?: string }) {
  return (
    <span
      className={cn('truncate text-[16px] leading-[1.3] font-extrabold', !text && 'opacity-50')}
    >
      {text || fallback}
    </span>
  )
}

export function Preview({ text, selected }: { text: ReactNode; selected: boolean }) {
  return (
    <p
      className={cn(
        'm-0 line-clamp-2 text-[14px] leading-[1.4]',
        selected ? 'text-fill-ink/75' : 'text-ink2',
      )}
    >
      {text}
    </p>
  )
}

/** Satırdaki küçük hap: etiket, "Fikir", durum. Seçili satırın teal zemininde nötr kalır. */
export function Pill({
  selected,
  className,
  children,
}: {
  selected: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[12px] font-bold',
        selected ? 'bg-fill-ink/10' : (className ?? 'bg-teal text-fill-ink'),
      )}
    >
      {children}
    </span>
  )
}

export function RowButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-current={selected || undefined}
      onClick={onClick}
      className={cn(
        'flex w-full shrink-0 cursor-pointer flex-col gap-2 rounded-[22px] px-4 py-3.5 text-left transition-colors duration-150',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
        selected ? 'bg-teal text-fill-ink' : 'text-ink hover:bg-s2',
      )}
    >
      {children}
    </button>
  )
}

export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} lines={3} />
      ))}
    </div>
  )
}
