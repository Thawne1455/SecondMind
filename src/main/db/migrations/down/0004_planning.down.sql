-- 0004_planning geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Görevler, hatırlatmalar ve rutinler silinir: önce backups/ altındaki migration öncesi kopyayı kontrol et.
DROP INDEX IF EXISTS `tasks_completed_idx`;
DROP INDEX IF EXISTS `tasks_status_idx`;
DROP TABLE IF EXISTS `tasks`;
DROP TABLE IF EXISTS `routines`;
DROP INDEX IF EXISTS `reminders_at_idx`;
DROP TABLE IF EXISTS `reminders`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
