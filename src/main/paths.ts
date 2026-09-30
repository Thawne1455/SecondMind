import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { defaultDataDir, isUnderOneDrive } from './domain/dataDir'

// Veri klasörünün yeri DB'nin içinde tutulamaz (DB onun içinde), bu yüzden userData/config.json'da.
const configSchema = z.object({ dataDir: z.string().min(1).optional() })

function readConfig(): z.infer<typeof configSchema> {
  const file = join(app.getPath('userData'), 'config.json')
  if (!existsSync(file)) return {}
  try {
    return configSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
  } catch (err) {
    console.error('config.json okunamadı, varsayılan kullanılıyor:', err)
    return {}
  }
}

export interface DataPaths {
  root: string
  db: string
  media: string
  ai: string
  /** Yerel AI modeli (Aşama 4, ilk kullanımda indirilir). */
  models: string
  backups: string
  onOneDrive: boolean
}

/** Veri klasörünü bulur ve alt klasörleri oluşturur. */
export function ensureDataPaths(): DataPaths {
  const root = readConfig().dataDir ?? defaultDataDir(app.getPath('home'))
  const paths: DataPaths = {
    root,
    db: join(root, 'secondmind.db'),
    media: join(root, 'media'),
    ai: join(root, 'ai'),
    models: join(root, 'models'),
    backups: join(root, 'backups'),
    onOneDrive: isUnderOneDrive(root, process.env),
  }
  for (const dir of [paths.root, paths.media, paths.ai]) mkdirSync(dir, { recursive: true })
  if (paths.onOneDrive) {
    console.warn(`Veri klasörü OneDrive altında (${root}). Senkron SQLite dosyasını bozabilir.`)
  }
  return paths
}
