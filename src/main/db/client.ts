import { app } from 'electron'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

let sqlite: Database.Database | null = null
let db: Db | null = null

// Geliştirmede kaynak klasörden okunur; paketlemede (Aşama 8) extraResources ile resources/migrations'a kopyalanır.
function migrationsFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(app.getAppPath(), 'src/main/db/migrations')
}

/** Tek bağlantıyı açar (WAL) ve bekleyen migration'ları uygular. */
export function openDb(file: string): Db {
  sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: migrationsFolder() })
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
