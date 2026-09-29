-- 0010_docs geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Dokümantasyon sayfaları, zaman makinesi kayıtları, Günlük notları ve varlık kayıtları silinir.
-- media/ dosyaları ve media satırları yerinde kalır; bağlı dosya sayfalarının asılları proje klasöründe durur.
DROP TRIGGER IF EXISTS `project_docs_fts_au`;
DROP TRIGGER IF EXISTS `project_docs_fts_ad`;
DROP TRIGGER IF EXISTS `project_docs_fts_ai`;
DROP TABLE IF EXISTS `project_docs_fts`;
ALTER TABLE `sessions` DROP COLUMN `shot_media_id`;
ALTER TABLE `projects` DROP COLUMN `count_rules_json`;
ALTER TABLE `project_folders` DROP COLUMN `image_dirs_json`;
DROP TABLE IF EXISTS `assets`;
DROP TABLE IF EXISTS `project_shots`;
DROP TABLE IF EXISTS `project_log_notes`;
DROP TABLE IF EXISTS `project_docs`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
