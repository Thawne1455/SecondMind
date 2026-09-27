import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { Check } from 'lucide-react'
import { cn } from './cn'

export type MenuItem = { id: string; label: ReactNode; description?: ReactNode }

type MenuListProps = {
  items: readonly MenuItem[]
  /** Seçili öğe amber dolgulu ve tikli. */
  selectedId?: string
  onSelect: (id: string) => void
  /** Listenin altında ikincil satır ("5 döküm işlenecek"). */
  footer?: ReactNode
  label?: string
  id?: string
  className?: string
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  ref?: Ref<HTMLDivElement>
}

/** Açılır menünün görünüşü; /tasarim bunu satır içinde gösterir. */
export function MenuList({
  items,
  selectedId,
  onSelect,
  footer,
  label,
  id,
  className,
  onKeyDown,
  ref,
}: MenuListProps) {
  return (
    <div
      ref={ref}
      id={id}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'flex w-[270px] flex-col gap-1 rounded-[24px] bg-bg p-2 text-ink shadow-pop',
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.id === selectedId
        return (
          <button
            key={item.id}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            onClick={() => onSelect(item.id)}
            className={cn(
              'flex cursor-pointer flex-col items-start rounded-2xl px-3.5 py-2.5 text-left leading-[1.35]',
              'transition-colors duration-150 outline-none focus-visible:outline-3 focus-visible:outline-indigo',
              selected ? 'bg-amber text-fill-ink' : 'hover:bg-hover focus-visible:bg-hover',
            )}
          >
            <span className="cx flex items-center gap-1.5 text-[15px]">
              {item.label}
              {selected && <Check size={16} strokeWidth={2.5} aria-hidden />}
            </span>
            {item.description && (
              <span className={cn('text-[13px] font-semibold', !selected && 'text-ink3')}>
                {item.description}
              </span>
            )}
          </button>
        )
      })}
      {footer && (
        <span className="px-3.5 py-1.5 text-[13px] leading-[1.35] font-semibold text-ink3">
          {footer}
        </span>
      )}
    </div>
  )
}

export type MenuTriggerProps = {
  onClick: () => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string
  ref: Ref<HTMLButtonElement>
}

type MenuProps = Omit<MenuListProps, 'onKeyDown' | 'ref' | 'id'> & {
  /** Tetikleyici butonu çizer; verilen prop'ları butona yaymalı. */
  trigger: (props: MenuTriggerProps) => ReactNode
  align?: 'start' | 'end'
}

/** Tetikleyiciye bağlı açılır menü: ok tuşları, Esc ve dışarı tıklama kapatır. */
export function Menu({ trigger, align = 'start', onSelect, ...list }: MenuProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    // Açılınca seçili öğeye, yoksa ilk öğeye odaklan.
    const items = listRef.current?.querySelectorAll<HTMLElement>('[role^=menuitem]')
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-checked=true]')
    ;(selected ?? items?.[0])?.focus()
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [],
    )
    const current = items.indexOf(document.activeElement as HTMLElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    items[(current + step + items.length) % items.length]?.focus()
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      {trigger({
        onClick: () => setOpen((o) => !o),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
        ref: triggerRef,
      })}
      {open && (
        <MenuList
          {...list}
          id={id}
          ref={listRef}
          onKeyDown={onKeyDown}
          onSelect={(itemId) => {
            onSelect(itemId)
            close()
          }}
          className={cn(
            'absolute top-full z-40 mt-2',
            align === 'end' ? 'right-0' : 'left-0',
            list.className,
          )}
        />
      )}
    </div>
  )
}
