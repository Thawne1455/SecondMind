-- 0012_ai geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- AI işleri ve öneriler silinir. Onaylanıp uygulanmış öneriler (görev, not, hatırlatma...) yerinde kalır.
DROP TABLE IF EXISTS `proposals`;
DROP TABLE IF EXISTS `ai_jobs`;
ALTER TABLE `dump_items` DROP COLUMN `skip_reason`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
