-- 0003_ideas geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Fikirlerin notları kalır (sıradan not olur); sadece kuluçka durumu silinir.
DROP INDEX IF EXISTS `ideas_status_idx`;
DROP INDEX IF EXISTS `ideas_note_id_unique`;
DROP TABLE IF EXISTS `ideas`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
