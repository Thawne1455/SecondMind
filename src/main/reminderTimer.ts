import { Notification, powerMonitor, type BrowserWindow } from 'electron'
import type { IpcEvent } from '@shared/ipc'
import { getDb } from './db/client'
import { sweepDueReminders } from './db/planning'

// Hatırlatma zamanlayıcısı (MIMARI.md Hatırlatmalar). Sadece uygulama açıkken çalışır: dakika başlarında
// ve uykudan dönüşte kontrol eder. Açılıştaki ilk kontrol, kapalıyken geçenleri `missed` işaretler.

type Options = {
  window: () => BrowserWindow | null
}

export function startReminderTimer({ window }: Options): () => void {
  const send = (event: IpcEvent) => window()?.webContents.send(event)

  function showWindow() {
    const win = window()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    send('nav:today')
  }

  function check() {
    let result: ReturnType<typeof sweepDueReminders>
    try {
      result = sweepDueReminders(getDb())
    } catch (e) {
      console.error('Hatırlatma kontrolü başarısız', e)
      return
    }
    for (const r of result.fired) {
      if (!Notification.isSupported()) break
      const n = new Notification({ title: 'Hatırlatma', body: r.title, silent: false })
      n.on('click', showWindow)
      n.show()
    }
    if (result.fired.length || result.missed) send('reminders:changed')
  }

  check()
  let interval: NodeJS.Timeout | undefined
  // Dakika başına hizala: 20:00 hatırlatması 20:00:59'da değil, 20:00:00'da çalsın.
  const align = setTimeout(
    () => {
      check()
      interval = setInterval(check, 60_000)
    },
    60_000 - (Date.now() % 60_000) + 50,
  )
  powerMonitor.on('resume', check)

  return () => {
    clearTimeout(align)
    clearInterval(interval)
    powerMonitor.off('resume', check)
  }
}
