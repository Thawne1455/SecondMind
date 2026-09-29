-- 0008_scan geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Sadece tarama verisi silinir (commit'ler, koddaki notlar, anlık görüntüler); bir sonraki Güncelle hepsini yeniden üretir.
-- Göreve çevrilmiş kod notlarının görevleri yerinde kalır.
DROP TABLE IF EXISTS `scan_snapshots`;
DROP TABLE IF EXISTS `code_todos`;
DROP TABLE IF EXISTS `commits`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
