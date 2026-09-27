import { sql } from 'drizzle-orm'
import { integer, text } from 'drizzle-orm/sqlite-core'

// Her tablonun ortak kolonları (MIMARI.md: id ulid, created_at, updated_at; silinebilenlerde deleted_at).
export const id = () => text('id').primaryKey()

export const timestamps = () => ({
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

/** Soft delete: dolu ise öğe çöp kutusunda. */
export const deletedAt = () => integer('deleted_at', { mode: 'timestamp_ms' })
