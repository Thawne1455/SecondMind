import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from './Button'
import { cn } from './cn'
import { DOMAIN_FILL } from './domain'

type SkeletonProps = {
  /** Boyut ve konum buradan verilir (örn. "h-[34px] w-24"). */
  className?: string
  shape?: 'block' | 'pill' | 'tile' | 'field'
  /** Verilirse bu kadar metin satırı çizer; sonuncusu kısa. */
  lines?: number
}

const SHAPE = {
  block: 'rounded-xl',
  pill: 'rounded-full',
  tile: 'rounded-tile',
  field: 'rounded-field',
} as const

const SHIMMER =
  'animate-shimmer bg-[linear-gradient(90deg,var(--s2)_0%,var(--s3)_50%,var(--s2)_100%)] bg-size-[200%_100%] motion-reduce:animate-none'

/** Yükleniyor = iskelet (shimmer), spinner değil. */
export function Skeleton({ className, shape = 'block', lines }: SkeletonProps) {
  if (lines) {
    return (
      <div className={cn('flex flex-col gap-2', className)} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cn(SHIMMER, 'h-4 rounded-md', i === lines - 1 ? 'w-3/5' : 'w-full')}
          />
        ))}
      </div>
    )
  }
  return <div className={cn(SHIMMER, SHAPE[shape], className)} aria-hidden />
}

const STATE_TILE = 'flex flex-col justify-end gap-2.5 rounded-tile px-5 py-[18px]'
const STATE_TITLE = 'x text-[30px] leading-none font-black uppercase'

type EmptyStateProps = {
  title: ReactNode
  /** Tek cümle. */
  message?: ReactNode
  /** Tek eylem. */
  action?: { label: string; icon?: LucideIcon; onClick: () => void }
  /** İstisnai ikinci yol (Okul: "Programdan doldur", AI ile); amber. */
  aiAction?: { label: string; icon?: LucideIcon; onClick: () => void }
  className?: string
}

export function EmptyState({ title, message, action, aiAction, className }: EmptyStateProps) {
  return (
    <div className={cn(STATE_TILE, 'bg-s2 text-ink', className)}>
      <span className={STATE_TITLE}>{title}</span>
      {message && <span className="text-ink2">{message}</span>}
      {(action || aiAction) && (
        <div className="flex flex-wrap gap-2.5">
          {action && (
            <Button icon={action.icon} onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {aiAction && (
            <Button variant="ai" icon={aiAction.icon} onClick={aiAction.onClick}>
              {aiAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

type ErrorStateProps = {
  /** Ne oldu ("Tarama olmadı"). */
  title: ReactNode
  /** Neden ve ne yapmalı. */
  detail?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  retrying?: boolean
  className?: string
}

export function ErrorState({
  title,
  detail,
  onRetry,
  retryLabel = 'Tekrar dene',
  retrying,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cn(STATE_TILE, DOMAIN_FILL.warning, className)}>
      <span className={STATE_TITLE}>{title}</span>
      {detail && <span className="font-semibold">{detail}</span>}
      {onRetry && (
        <div>
          <Button variant="onTile" loading={retrying} onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  )
}

type SectionHeaderProps = { title: ReactNode; description?: ReactNode; className?: string }

/** Bölüm başlığı: 28/900 geniş büyük harf, yanında açıklama, altında 3px ink çizgi. */
export function SectionHeader({ title, description, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-baseline gap-5 border-b-3 border-ink pb-3.5', className)}>
      <h2 className="x m-0 text-[28px] leading-[1.1] font-black uppercase">{title}</h2>
      {description && <p className="m-0 text-ink2">{description}</p>}
    </div>
  )
}
