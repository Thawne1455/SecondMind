import { app } from 'electron'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0]

let sqlite: Database.Database | null = null
let db: Db | null = null

// Geliştirmede kaynak klasörden okunur; paketlemede (Aşama 8) extraResources ile resources/migrations'a kopyalanır.
function migrationsFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(app.getAppPath(), 'src/main/db/migrations')
}

/** Uygulanmış migration sayısı; tablo yoksa (yeni DB) null. */
function appliedMigrations(conn: Database.Database): number | null {
  const table = conn
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get()
  if (!table) return null
  return (conn.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as { n: number }).n
}

/** Bekleyen migration varsa mevcut DB'nin kopyasını alır: geri dönüşün ilk yolu bu kopyadır. */
function backupBeforeMigrate(conn: Database.Database, folder: string, backupDir: string): void {
  const applied = appliedMigrations(conn)
  if (applied === null) return
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
    entries: unknown[]
  }
  if (journal.entries.length <= applied) return
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = join(backupDir, `pre-migrate-${applied}-${stamp}.db`)
  if (!existsSync(target)) conn.prepare('VACUUM INTO ?').run(target)
}

/** Tek bağlantıyı açar (WAL) ve bekleyen migration'ları uygular (önce yedek alarak). */
export function openDb(file: string, backupDir: string): Db {
  sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  const folder = migrationsFolder()
  backupBeforeMigrate(sqlite, folder, backupDir)
  migrate(db, { migrationsFolder: folder })
  return db
}

export function getDb(): Db {
  if (!db) throw new Error('Veritabanı açılmadı')
  return db
}

export function closeDb(): void {
  sqlite?.close()
  sqlite = null
  db = null
}
