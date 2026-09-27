import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { id, timestamps } from './columns'

/**
 * Veri klasöründeki `media/` dosyaları. Dosya adı = içerik hash'i + uzantı; aynı içerik tek kez saklanır.
 * Satırlar silinmez (birden çok kayıt aynı dosyayı gösterebilir); sahipsiz dosya temizliği Aşama 8'de.
 */
export const media = sqliteTable('media', {
  id: id(),
  hash: text('hash').notNull().unique(),
  fileName: text('file_name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  originalName: text('original_name').notNull(),
  ...timestamps(),
})
