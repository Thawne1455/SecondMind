import { useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import type { LucideIcon } from 'lucide-react'
import { LoaderCircle } from 'lucide-react'
import { cn } from './cn'

export type ButtonVariant =
  'primary' | 'action' | 'secondary' | 'ai' | 'danger' | 'onTile' | 'onTileGhost'

type ButtonSize = 'lg' | 'md' | 'sm' | 'xs'

// Her türün hover rengi; /tasarim sayfası `data-force="hover|pressed"` ile aynı rengi sabitler.
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-on-ink enabled:hover:bg-[color-mix(in_srgb,var(--ink)_88%,var(--bg))] data-force:bg-[color-mix(in_srgb,var(--ink)_88%,var(--bg))]',
  action: 'bg-indigo text-white enabled:hover:bg-[#2B2BD9] data-force:bg-[#2B2BD9]',
  // Modal alt şeridi gibi s2 zeminlerde --btn-soft ile zemin rengi değişir.
  secondary: 'bg-[var(--btn-soft,var(--s2))] text-ink enabled:hover:bg-s3 data-force:bg-s3',
  ai: 'bg-amber text-fill-ink enabled:hover:bg-[#F2A300] data-force:bg-[#F2A300]',
  danger: 'bg-coral text-white enabled:hover:bg-[#BE2F1D] data-force:bg-[#BE2F1D]',
  onTile:
    'bg-[var(--ot-solid-bg,#131316)] text-[var(--ot-solid-fg,#FFFFFF)] enabled:hover:opacity-90 data-force:opacity-90',
  onTileGhost:
    'bg-[var(--ot-ghost-bg,rgba(19,19,22,.1))] text-[var(--ot-ghost-fg,#131316)] enabled:hover:brightness-95 data-force:brightness-95',
}

const SIZE: Record<ButtonSize, string> = {
  lg: 'h-12 px-7 text-[16px]',
  md: 'h-[42px] px-5 text-[15px]',
  sm: 'h-[34px] px-3.5 text-[14px]',
  // Bant ve rozet içindeki küçük eylemler (Bugüne al, Yeniden yerleştir).
  xs: 'h-[26px] px-2.5 text-[13px]',
}

const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-full font-bold whitespace-nowrap select-none ' +
  'transition-[transform,background-color,opacity,filter] duration-150 ease-out ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo ' +
  'enabled:active:scale-[.96] data-[force=pressed]:scale-[.96]'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  /** "AI ile İşle · 5" gibi metnin sonunda sayı. */
  count?: number
  loading?: boolean
  /** Yüklenirken gösterilecek metin ("3 klasör taranıyor…"); verilmezse normal metin kalır. */
  loadingLabel?: ReactNode
  children?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  count,
  loading = false,
  loadingLabel,
  disabled,
  className,
  children,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const iconSize = size === 'md' ? 18 : 16
  const own = useRef<HTMLButtonElement | null>(null)
  const idleWidth = useRef(0)

  // Yüklenirken buton daralmaz: son normal genişlik en küçük genişlik olur (uzun metinle büyüyebilir).
  useLayoutEffect(() => {
    const el = own.current
    if (!el) return
    if (loading) {
      el.style.minWidth = `${idleWidth.current}px`
    } else {
      el.style.minWidth = ''
      idleWidth.current = el.offsetWidth
    }
  })

  return (
    <button
      ref={(el) => {
        own.current = el
        if (typeof ref === 'function') return ref(el)
        if (ref) ref.current = el
      }}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        BASE,
        SIZE[size],
        VARIANT[variant],
        'gap-2',
        disabled && 'cursor-not-allowed opacity-[.38]',
        loading && 'cursor-progress',
        !disabled && !loading && 'cursor-pointer',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" aria-hidden />
          {loadingLabel ?? children}
        </>
      ) : (
        <>
          {Icon && <Icon size={iconSize} strokeWidth={1.75} aria-hidden />}
          <span className="inline-flex items-center">
            {children}
            {count !== undefined && <span className="ml-1 tabular-nums">· {count}</span>}
          </span>
        </>
      )}
    </button>
  )
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** Ekran okuyucu için zorunlu ad. */
  label: string
  icon: LucideIcon
  variant?: 'secondary' | 'onTileGhost'
  size?: ButtonSize
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  label,
  icon: Icon,
  variant = 'secondary',
  size = 'sm',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        BASE,
        VARIANT[variant],
        size === 'md' ? 'size-[42px]' : 'size-[34px]',
        'cursor-pointer disabled:cursor-not-allowed disabled:opacity-[.38]',
        className,
      )}
      {...rest}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
    </button>
  )
}
