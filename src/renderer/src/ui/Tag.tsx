import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { customFill, DOMAIN_FILL, type Domain } from './domain'

const PILL =
  'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold whitespace-nowrap'

type TagProps = HTMLAttributes<HTMLSpanElement> & {
  /** Alan etiketi; verilmezse işlem türü etiketi (s2). */
  domain?: Domain
  /** Proje veya ders rengi gibi özel dolgu. */
  fill?: string
  children: ReactNode
}

export function Tag({ domain, fill, className, style, children, ...rest }: TagProps) {
  let surface = domain ? DOMAIN_FILL[domain] : 'bg-s2 text-ink'
  let surfaceStyle: CSSProperties | undefined = style
  if (fill) {
    const custom = customFill(fill)
    surface = custom.className
    surfaceStyle = { ...custom.style, ...style }
  }
  return (
    <span className={cn(PILL, surface, className)} style={surfaceStyle} {...rest}>
      {children}
    </span>
  )
}

type ChipProps = Omit<HTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  selected: boolean
  onClick: () => void
  children: ReactNode
}

/** Filtre chip'i: seçili olan ink dolgulu. */
export function Chip({ selected, onClick, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex h-[34px] cursor-pointer items-center rounded-full px-3.5 text-[14px] font-bold whitespace-nowrap',
        'transition-[transform,background-color] duration-150 active:scale-[.96]',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
        selected ? 'bg-ink text-on-ink' : 'bg-s2 text-ink hover:bg-s3',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
