-- 0005_schedule geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Sadece günün yerleşimi silinir (türetilmiş veri); açılışta yeniden yerleşir. Elle sabitlenen bloklar kaybolur.
DROP INDEX IF EXISTS `schedule_blocks_day_idx`;
DROP TABLE IF EXISTS `schedule_blocks`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
