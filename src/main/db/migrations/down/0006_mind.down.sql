-- 0006_mind geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Günlük kayıtlar (ruh hâli, enerji, uyku) silinir: önce backups/ altındaki migration öncesi kopyayı kontrol et.
DROP INDEX IF EXISTS `checkins_day_unique`;
DROP TABLE IF EXISTS `checkins`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
