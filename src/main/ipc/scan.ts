import { getDb } from '../db/client'
import { runScan } from '../scan'
import { handle } from './handle'
import { broadcast } from './projects'

// Güncelle ve Tara (Aşama 5b). Tarama sadece bu çağrıyla çalışır; zamanlayıcı ya da arka plan yok.

let running: ReturnType<typeof runScan> | null = null

export function registerScanIpc(): void {
  handle('scan:run', async ({ projectId }) => {
    // Üst üste basılırsa ikinci tarama başlamaz, süren taramanın sonucunu bekler.
    running ??= runScan(getDb(), projectId).finally(() => {
      running = null
    })
    const report = await running
    broadcast('projects:changed')
    return report
  })
}
