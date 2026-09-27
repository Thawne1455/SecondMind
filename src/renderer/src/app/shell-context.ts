import { createContext, useContext } from 'react'

export type ShellApi = {
  openPalette: () => void
  openQuickDump: () => void
}

export const ShellContext = createContext<ShellApi | null>(null)

/** Her ekrandan komut paleti (Ctrl K) ve Hızlı Döküm (Ctrl N) açmak için. */
export function useShell(): ShellApi {
  const api = useContext(ShellContext)
  if (!api) throw new Error('useShell, AppShell içinde kullanılmalı')
  return api
}
