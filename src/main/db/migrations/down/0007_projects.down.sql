-- 0007_projects geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Projeler, oturumlar ve park alanı silinir: önce backups/ altındaki migration öncesi kopyayı kontrol et.
-- Görevlerdeki `project_id` değerleri yerinde kalır (FK yok); proje tabloları geri gelince yeniden eşleşir.
DROP TABLE IF EXISTS `parking`;
DROP TABLE IF EXISTS `sessions`;
DROP TABLE IF EXISTS `project_folders`;
DROP TABLE IF EXISTS `projects`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
