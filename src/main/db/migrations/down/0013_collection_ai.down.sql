-- 0013_collection_ai geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Koleksiyon düzeyindeki "AI'a kapalı" işareti kaybolur; not başına işaretler yerinde kalır.
ALTER TABLE `collections` DROP COLUMN `ai_excluded`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
