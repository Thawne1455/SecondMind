import type { ReactNode } from 'react'
import { cn } from './cn'

type KbdProps = {
  children: ReactNode
  /** surface: s3 zeminli (alt şerit ipuçları). onFill: dolgulu şeridin üstünde yarı saydam. */
  tone?: 'surface' | 'onFill'
  className?: string
}

/** Klavye kısayolu etiketi ("Ctrl N", "Enter"). */
export function Kbd({ children, tone = 'surface', className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'wide inline-flex h-6 items-center rounded-md px-2 font-sans text-[13px] font-extrabold tracking-[.02em] whitespace-nowrap',
        tone === 'surface' ? 'bg-s3 text-ink' : 'bg-[rgba(19,19,22,.1)] text-fill-ink',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
