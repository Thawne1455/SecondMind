import { createHash } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import type { Db } from './db/client'
import { media } from './db/schema'
import { mediaFileName } from './domain/media'

export type MediaInput = { name: string; mime: string; bytes: Uint8Array }
export type MediaRow = typeof media.$inferSelect

/**
 * Dosyayı içerik hash'iyle `media/` klasörüne yazar; aynı içerik zaten varsa mevcut satırı döner.
 * Dosya DB'den önce yazılır: yarım kalan işlemde en kötü ihtimalle sahipsiz bir dosya kalır.
 */
export function storeMedia(db: Db, mediaDir: string, input: MediaInput): MediaRow {
  const hash = createHash('sha256').update(input.bytes).digest('hex')
  const existing = db.select().from(media).where(eq(media.hash, hash)).get()
  if (existing) return existing

  const fileName = mediaFileName(hash, input.name, input.mime)
  const path = join(mediaDir, fileName)
  if (!existsSync(path)) writeFileSync(path, input.bytes)

  return db
    .insert(media)
    .values({
      id: ulid(),
      hash,
      fileName,
      mime: input.mime || 'application/octet-stream',
      size: input.bytes.byteLength,
      originalName: input.name,
    })
    .returning()
    .get()
}
