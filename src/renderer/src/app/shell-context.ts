import { createContext, useContext } from 'react'
import type { Reminder, Task } from '@shared/ipc'

export type ShellApi = {
  openPalette: () => void
  openQuickDump: () => void
  /** Görev çalışma alanı (Ctrl G): solda tüm görevler, sağda form. Görev verilirse onu düzenler. */
  openTask: (task?: Task | null, planned?: string | null) => void
  /** Hatırlatma çalışma alanı (Ctrl H): solda tümü, sağda form. Verilirse onu düzenler. */
  openReminder: (reminder?: Reminder | null) => void
  /** Yeni proje (Ctrl Shift N): klasör seçiciyle açılır. */
  openProjectCreate: () => void
  /** Uygulama içi park çubuğu (P); verilen proje önce seçilir (süren oturum yoksa). */
  openPark: (projectId?: string | null) => void
  /**
   * Projede oturum açar. Başka projede süren oturum varsa önce onun kapanış modalı açılır,
   * kaydedilince yeni oturum başlar. `after` oturum açılınca çalışır (örn. görevi şimdiye çekmek).
   */
  startSession: (projectId: string, opts?: { taskId?: string | null; after?: () => void }) => void
  /** Süren oturumun kapanış modalı. */
  closeSession: () => void
}

export const ShellContext = createContext<ShellApi | null>(null)

/** Her ekrandan komut paleti (Ctrl K), Hızlı Döküm (Ctrl N), görev (Ctrl G), hatırlatma (Ctrl H), proje ve oturum. */
export function useShell(): ShellApi {
  const api = useContext(ShellContext)
  if (!api) throw new Error('useShell, AppShell içinde kullanılmalı')
  return api
}
