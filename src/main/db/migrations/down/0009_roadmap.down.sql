-- 0009_roadmap geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Kilometre taşları ve playtest verisi silinir; görevler yerinde kalır, sadece 5c kolonları düşer
-- (görevin taşa bağı `milestone_id` 0001'den beri var, kalır ama işaret ettiği taş gider).
DROP INDEX IF EXISTS `tasks_project_idx`;
ALTER TABLE `tasks` DROP COLUMN `source_id`;
ALTER TABLE `tasks` DROP COLUMN `source`;
ALTER TABLE `tasks` DROP COLUMN `milestone_set_at`;
ALTER TABLE `tasks` DROP COLUMN `repro_steps`;
ALTER TABLE `tasks` DROP COLUMN `severity`;
ALTER TABLE `tasks` DROP COLUMN `kanban_status`;
DROP TABLE IF EXISTS `playtest_points`;
DROP TABLE IF EXISTS `playtest_feedback`;
DROP TABLE IF EXISTS `playtest_clusters`;
DROP TABLE IF EXISTS `milestones`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
