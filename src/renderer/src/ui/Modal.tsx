import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './Button'
import { cn } from './cn'
import { customFill, DOMAIN_FILL, type Domain } from './domain'

type ModalPanelProps = {
  title: ReactNode
  /** Üst şeridin alanı. */
  domain?: Domain
  /** Proje rengi gibi özel üst şerit (domain'i ezer). */
  fill?: string
  onClose: () => void
  /** Başlıkla kapat arasında (örn. kısayol etiketi). */
  headerExtra?: ReactNode
  /** Alt şeridin solu: klavye ipuçları ("Enter kaydeder"). */
  hints?: ReactNode
  /** Alt şeridin sağı: butonlar. */
  actions?: ReactNode
  className?: string
  /** Çizilmiş özel modallar (Hızlı Döküm) için bölüm ölçülerini ezer. */
  headerClassName?: string
  bodyClassName?: string
  footerClassName?: string
  children: ReactNode
}

/** Modalın görünüşü; /tasarim bunu satır içinde gösterir. */
export function ModalPanel({
  title,
  domain = 'dump',
  fill,
  onClose,
  headerExtra,
  hints,
  actions,
  className,
  headerClassName,
  bodyClassName,
  footerClassName,
  children,
}: ModalPanelProps) {
  let header = DOMAIN_FILL[domain]
  let headerStyle: CSSProperties | undefined
  if (fill) {
    const custom = customFill(fill)
    header = custom.className
    headerStyle = custom.style
  }

  return (
    <div className={cn('overflow-hidden rounded-modal bg-bg text-ink shadow-modal', className)}>
      <div
        className={cn('flex items-center gap-3 py-4 pr-4 pl-6', header, headerClassName)}
        style={headerStyle}
      >
        <h2 className="x m-0 grow text-[20px] leading-tight font-black uppercase">{title}</h2>
        {headerExtra}
        <IconButton
          label="Kapat"
          icon={X}
          variant="onTileGhost"
          onClick={onClose}
          className="size-9"
        />
      </div>
      <div className={cn('flex flex-col gap-4 px-6 py-5', bodyClassName)}>{children}</div>
      {(hints || actions) && (
        <div
          className={cn(
            'flex items-center gap-2 bg-s2 px-6 py-3.5 [--btn-soft:var(--bg)]',
            footerClassName,
          )}
        >
          <span className="grow text-[13px] leading-[1.35] font-semibold text-ink3">{hints}</span>
          {actions}
        </div>
      )}
    </div>
  )
}

type ModalProps = ModalPanelProps & {
  open: boolean
  width?: number
  /** center: dikeyde ortada. top: üstten %19 (Hızlı Döküm). */
  placement?: 'center' | 'top'
}

/**
 * Native <dialog>: odak tuzağı, Esc ve arka planın etkisizleşmesi tarayıcıdan gelir.
 * Arka plana tıklamak kapatır.
 */
export function Modal({ open, width = 560, placement = 'center', onClose, ...panel }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal ilk odaklanabilir öğeye (kapat) gider; içerik isterse kendi alanını işaretler.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={typeof panel.title === 'string' ? panel.title : undefined}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={cn(
        'max-w-[calc(100vw-64px)] overflow-visible bg-transparent p-0 text-ink',
        placement === 'top' ? 'mx-auto mt-[19vh]' : 'm-auto',
      )}
      style={{ width }}
    >
      {open && <ModalPanel onClose={onClose} {...panel} />}
    </dialog>
  )
}
