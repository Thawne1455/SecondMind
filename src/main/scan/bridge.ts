import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from '../db/client'
import { applySessionReport, bridgeContext, bridgeFolders } from '../db/bridge'
import { BRIDGE_DIR, parseSessionReport, REPORTS_DIR } from '../domain/bridge'
import { markReportProcessed, readReport, reportFiles, writeContextFiles } from './bridgeFiles'

// Köprünün tarama ve Başla anındaki işi (5e): oturum raporlarını Günlük'e ve oturumlara uygula, işleneni
// `islendi/`'ye taşı; BAGLAM.md'yi ve açık dokümanları yeniden yaz. Sadece köprüsü kurulu klasörde.

/** Klasördeki işlenmemiş raporlar; uygulanan rapor sayısı. Bozuk rapor klasörde kalır, diğerlerini durdurmaz. */
export function processReports(db: Db, projectId: string, root: string, now = new Date()): number {
  let applied = 0
  for (const name of reportFiles(root)) {
    try {
      const raw = readReport(root, name)
      const mtime = statSync(join(root, BRIDGE_DIR, REPORTS_DIR, name)).mtime
      if (applySessionReport(db, projectId, name, raw, parseSessionReport(raw), mtime, now))
        applied++
      markReportProcessed(root, name)
    } catch {
      // Okunamayan rapor bir sonraki Güncelle'de yeniden denenir.
    }
  }
  return applied
}

/** Projenin köprüsü kurulu bütün klasörlerine BAGLAM.md yazar. */
export function refreshContext(db: Db, projectId: string, now = new Date()): void {
  const folders = bridgeFolders(db, projectId).filter((f) => existsSync(f.path))
  if (!folders.length) return
  const { context, docs } = bridgeContext(db, projectId, now)
  for (const f of folders) writeContextFiles(f.path, context, docs)
}
