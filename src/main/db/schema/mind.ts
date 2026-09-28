import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { id, timestamps } from './columns'

// Zihin (Aşama 3c: günlük kayıt). Günlük, kararlar ve eğilimler Aşama 7'de.

/**
 * Günde bir kayıt (Bugün'deki Nasılsın? karosu). Alanlar tek tek dolar; boş alan null.
 * Silme arayüzü yok, bu yüzden soft delete de yok: alan boşaltmak null yazmaktır.
 */
export const checkins = sqliteTable('checkins', {
  id: id(),
  /** 'YYYY-MM-DD', günde tek satır. */
  day: text('day').notNull().unique(),
  /** 1–5 */
  mood: integer('mood'),
  /** 1–5 */
  energy: integer('energy'),
  /** Uyku süresi (dk). */
  sleepMin: integer('sleep_min'),
  note: text('note').notNull().default(''),
  ...timestamps(),
})
