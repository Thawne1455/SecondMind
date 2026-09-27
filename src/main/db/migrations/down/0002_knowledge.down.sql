-- 0002_knowledge geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Önce açılışta alınan backups/pre-migrate-*.db kopyasını tercih et; bu dosya notları siler.
DROP TRIGGER IF EXISTS `notes_fts_au`;
DROP TRIGGER IF EXISTS `notes_fts_ad`;
DROP TRIGGER IF EXISTS `notes_fts_ai`;
DROP TABLE IF EXISTS `notes_fts`;
DROP TABLE IF EXISTS `note_tags`;
DROP TABLE IF EXISTS `tags`;
DROP TABLE IF EXISTS `notes`;
DROP TABLE IF EXISTS `collections`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
