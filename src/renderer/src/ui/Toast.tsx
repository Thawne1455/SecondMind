import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { cn } from './cn'
import { DOMAIN_FILL, DOMAIN_TEXT, ON_BAND } from './domain'
import { ToastContext, type ToastOptions } from './toast-context'

type ToastCardProps = Omit<ToastOptions, 'duration'> & { className?: string }

/** Bildirimin görünüşü; /tasarim bunu satır içinde gösterir. */
export function ToastCard({
  message,
  title,
  variant = 'band',
  domain = 'projects',
  action,
  className,
}: ToastCardProps) {
  const band = variant === 'band'
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[22px] pl-5',
        band
          ? cn('bg-fill-ink py-3.5 pr-3.5 dark:bg-band', ON_BAND)
          : cn('py-3 pr-3', DOMAIN_FILL[domain]),
        className,
      )}
      style={{ boxShadow: `0 16px 40px rgba(19,19,22,${band ? 0.22 : 0.16})` }}
    >
      <span className="flex grow flex-col leading-[1.4]">
        {title && <span className={cn('cx', band && DOMAIN_TEXT[domain])}>{title}</span>}
        <span className={title ? 'font-semibold' : 'font-extrabold'}>{message}</span>
      </span>
      {action && (
        <Button size="sm" variant={band ? 'onTileGhost' : 'onTile'} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

type Entry = ToastOptions & { id: number }

/** Bildirimler sağ altta yığılır; en yenisi altta. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setEntries((list) => list.filter((e) => e.id !== id))
  }, [])

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++
      setEntries((list) => [...list, { ...options, id }])
      const duration = options.duration ?? 5000
      if (duration > 0) setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss],
  )

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-6 bottom-6 z-50 flex w-[420px] flex-col gap-2.5"
      >
        {entries.map(({ id, action, ...entry }) => (
          <ToastCard
            key={id}
            {...entry}
            action={
              action && {
                label: action.label,
                onClick: () => {
                  action.onClick()
                  dismiss(id)
                },
              }
            }
            className="pointer-events-auto animate-toast-in"
          />
        ))}
      </div>
    </ToastContext>
  )
}
