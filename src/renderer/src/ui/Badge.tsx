import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { DOMAIN_FILL, type Domain } from './domain'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  count: number
  tone?: Domain | 'ink'
  /** sm: 20px (kenar çubuğu), md: 24px. */
  size?: 'sm' | 'md'
}

/** Sayı rozeti. */
export function Badge({ count, tone = 'ink', size = 'md', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'x inline-flex shrink-0 items-center justify-center rounded-full text-[13px] leading-none font-extrabold',
        size === 'sm' ? 'h-5 min-w-5 px-[5px]' : 'h-6 min-w-6 px-1.5',
        tone === 'ink' ? 'bg-fill-ink text-white' : DOMAIN_FILL[tone],
        className,
      )}
      {...rest}
    >
      {count}
    </span>
  )
}

export type Status = 'active' | 'incubating' | 'late' | 'archived'

const STATUS: Record<Status, { className: string; label: string }> = {
  active: { className: 'bg-green text-fill-ink', label: 'Aktif' },
  incubating: { className: 'bg-teal text-fill-ink', label: 'Kuluçkada' },
  late: { className: 'bg-coral text-white', label: 'Gecikti' },
  archived: { className: 'bg-s3 text-ink2', label: 'Arşiv' },
}

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  status: Status
  /** Varsayılan metin yerine ("Kuluçkada · 5 gün"). */
  children?: ReactNode
}

/** Durum rozeti: geniş, büyük harf. */
export function StatusBadge({ status, className, children, ...rest }: StatusBadgeProps) {
  const s = STATUS[status]
  return (
    <span
      className={cn(
        'cx inline-flex h-7 shrink-0 items-center rounded-full px-3 whitespace-nowrap',
        s.className,
        className,
      )}
      {...rest}
    >
      {children ?? s.label}
    </span>
  )
}
