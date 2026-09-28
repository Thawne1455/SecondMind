import { createContext, useContext } from 'react'
import type { Reminder, Task } from '@shared/ipc'

export type ShellApi = {
  openPalette: () => void
  openQuickDump: () => void
  /** Görev modalı (Ctrl G): görev verilirse düzenler; `planned` yeni görevin günü. */
  openTask: (task?: Task | null, planned?: string | null) => void
  /** Tüm görevler listesi. */
  openTasks: () => void
  /** Hatırlatma modalı (Ctrl H): verilirse düzenler. */
  openReminder: (reminder?: Reminder | null) => void
}

export const ShellContext = createContext<ShellApi | null>(null)

/** Her ekrandan komut paleti (Ctrl K), Hızlı Döküm (Ctrl N), görev (Ctrl G), hatırlatma (Ctrl H). */
export function useShell(): ShellApi {
  const api = useContext(ShellContext)
  if (!api) throw new Error('useShell, AppShell içinde kullanılmalı')
  return api
}
