-- 0001_core geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Önce açılışta alınan backups/pre-migrate-*.db kopyasını tercih et; bu dosya veriyi siler.
DROP TABLE IF EXISTS `dump_attachments`;
DROP TABLE IF EXISTS `dump_items`;
DROP TABLE IF EXISTS `media`;
DROP TABLE IF EXISTS `activity_log`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
