import { createContext, useContext, type ReactNode } from 'react'
import type { Domain } from './domain'

export type ToastOptions = {
  message: ReactNode
  /** Küçük etiket başlık ("Tarama bitti"); band türünde alan renginde. */
  title?: ReactNode
  /** band: koyu zemin, başlık alan renginde. fill: alan rengi dolgu. */
  variant?: 'band' | 'fill'
  domain?: Domain
  action?: { label: string; onClick: () => void }
  /** Milisaniye; 0 ise kendiliğinden kapanmaz. */
  duration?: number
}

export type ToastApi = { toast: (options: ToastOptions) => number; dismiss: (id: number) => void }

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast, ToastProvider içinde kullanılmalı')
  return api
}
