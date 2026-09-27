import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { customFill, DOMAIN_FILL, type Domain } from './domain'

export type TileVariant = 'featured' | 'standard' | 'alert' | 'question'

type TileProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  variant: TileVariant
  /** `question` türünün dolgu alanı. */
  domain?: Domain
  /** Proje rengi gibi özel dolgu (domain'i ezer). */
  fill?: string
  /** Üstte küçük etiket satırı (cx stili). */
  eyebrow?: ReactNode
  title?: ReactNode
  titleClassName?: string
  /** `alert` türünde büyük sayı + yanındaki etiket ("16 GÜN SESSİZ"). */
  metric?: { value: ReactNode; label: ReactNode }
  /** Karo en fazla iki eylem taşır. */
  actions?: readonly [ReactNode, ReactNode?]
}

const SURFACE: Record<TileVariant, string> = {
  featured: 'bg-bg text-ink border-3 border-ink justify-end',
  standard: 'bg-s2 text-ink',
  alert: DOMAIN_FILL.warning,
  question: '',
}

const TITLE: Record<TileVariant, string> = {
  featured: 'x text-[34px] leading-[.95] font-black uppercase',
  standard: 'text-[20px] leading-[1.2] font-extrabold',
  alert: 'font-bold',
  question: 'text-[18px] leading-[1.2] font-extrabold',
}

export function Tile({
  variant,
  domain = 'projects',
  fill,
  eyebrow,
  title,
  titleClassName,
  metric,
  actions,
  className,
  style,
  children,
  ...rest
}: TileProps) {
  let surface = SURFACE[variant]
  let surfaceStyle: CSSProperties | undefined = style
  if (variant === 'question') {
    if (fill) {
      const custom = customFill(fill)
      surface = custom.className
      surfaceStyle = { ...custom.style, ...style }
    } else {
      surface = DOMAIN_FILL[domain]
    }
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col gap-2 rounded-tile px-5 py-[18px]',
        'transition-transform duration-[180ms] ease-out hover:-translate-y-0.5',
        surface,
        className,
      )}
      style={surfaceStyle}
      {...rest}
    >
      {eyebrow && (
        <span className={cn('cx flex items-center gap-2', variant === 'featured' && 'text-ink2')}>
          {eyebrow}
        </span>
      )}
      {metric && (
        <div className="flex items-end gap-2.5">
          <span className="x text-[56px] leading-[.9] font-black">{metric.value}</span>
          <span className="cx pb-[5px]">{metric.label}</span>
        </div>
      )}
      {title && <span className={cn(TITLE[variant], titleClassName)}>{title}</span>}
      {children}
      {actions && (
        <div className={cn('flex gap-2', variant === 'featured' ? 'pt-1' : 'mt-auto')}>
          {actions}
        </div>
      )}
    </div>
  )
}
