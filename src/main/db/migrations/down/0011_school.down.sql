-- 0011_school geri dönüşü. Otomatik çalışmaz; gerekirse elle, uygulama kapalıyken çalıştırılır.
-- Okul verisi (dönemler, dersler, notlar, sınavlar, yoklama) silinir. Hafta notları `notes`'ta kalır
-- (course_id / week_id dolu, bağlamsız notlar olarak); media/ dosyaları yerinde kalır.
DELETE FROM `schedule_blocks` WHERE `kind` IN ('class', 'study');
DROP TABLE IF EXISTS `note_flags`;
DROP TABLE IF EXISTS `course_materials`;
DROP TABLE IF EXISTS `attendance`;
DROP TABLE IF EXISTS `assignments`;
DROP TABLE IF EXISTS `study_blocks`;
DROP TABLE IF EXISTS `exam_topics`;
DROP TABLE IF EXISTS `exams`;
DROP TABLE IF EXISTS `grade_components`;
DROP TABLE IF EXISTS `topics`;
DROP TABLE IF EXISTS `course_weeks`;
DROP TABLE IF EXISTS `instructor_notes`;
DROP TABLE IF EXISTS `course_slots`;
DROP TABLE IF EXISTS `courses`;
DROP TABLE IF EXISTS `instructors`;
DROP TABLE IF EXISTS `terms`;
DELETE FROM `__drizzle_migrations` WHERE `id` = (SELECT MAX(`id`) FROM `__drizzle_migrations`);
