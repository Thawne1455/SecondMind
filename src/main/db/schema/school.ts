import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { deletedAt, id, timestamps } from './columns'
import { media } from './media'
import { notes } from './knowledge'

// Okul (Aşama 6, OKUL.md). Dönem → ders → hafta → konu. Gün alanları 'YYYY-MM-DD', saatler günün dakikası.
// Hafta tarih aralığı saklanmaz: dönem başlangıcından hesaplanır (`domain/school/term`).

export const terms = sqliteTable('terms', {
  id: id(),
  name: text('name').notNull(),
  /** Dönemin ilk günü (1. haftanın Pazartesi'si olmak zorunda değil). */
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  weekCount: integer('week_count').notNull().default(14),
  /** Tek aktif dönem; diğerleri arşiv (salt okunur, ortalamaya girer). */
  active: integer('active', { mode: 'boolean' })
    .notNull()
    .default(sql`0`),
  ...timestamps(),
  deletedAt: deletedAt(),
})

export const instructors = sqliteTable('instructors', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  room: text('room').notNull().default(''),
  officeHours: text('office_hours').notNull().default(''),
  ...timestamps(),
  deletedAt: deletedAt(),
})

export const courses = sqliteTable(
  'courses',
  {
    id: id(),
    termId: text('term_id')
      .notNull()
      .references(() => terms.id),
    name: text('name').notNull(),
    code: text('code').notNull().default(''),
    /** Kredi (AKTS ya da yerel kredi; ortalama bununla tartılır). */
    credit: real('credit').notNull().default(0),
    /** Gök mavisinin tonu (`#RRGGBB`). */
    tone: text('tone').notNull(),
    instructorId: text('instructor_id').references(() => instructors.id),
    /** Varsayılan derslik; saat satırı kendi dersliğini ezebilir. */
    room: text('room').notNull().default(''),
    /** Devam sınırı: `{kind:'percent'|'hours', value}`; null = sınır yok. */
    attendanceLimitJson: text('attendance_limit_json'),
    /** Harf tablosu `[{letter, min, points}]`; null = varsayılan. */
    letterTableJson: text('letter_table_json'),
    /** Elle harf (bağıl değerlendirme, geçmiş dönem dersi). Doluysa tahmini ezer. */
    letter: text('letter'),
    /** Hedef harf ("Finalde en az X"). */
    targetLetter: text('target_letter').notNull().default('BB'),
    sort: integer('sort').notNull().default(0),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('courses_term_idx').on(t.termId, t.sort)],
)

/** Haftalık program; soft delete yok (ayar), satır silmek log'lu. */
export const courseSlots = sqliteTable(
  'course_slots',
  {
    id: id(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    /** ISO hafta günü, 1 = Pzt. */
    weekday: integer('weekday').notNull(),
    startMin: integer('start_min').notNull(),
    endMin: integer('end_min').notNull(),
    room: text('room').notNull().default(''),
    ...timestamps(),
  },
  (t) => [index('course_slots_course_idx').on(t.courseId, t.weekday)],
)

export const instructorNotes = sqliteTable(
  'instructor_notes',
  {
    id: id(),
    instructorId: text('instructor_id')
      .notNull()
      .references(() => instructors.id),
    /** Hangi dersten yazıldığı; not hocanın bütün derslerinde görünür. */
    courseId: text('course_id'),
    text: text('text').notNull(),
    day: text('day').notNull(),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('instructor_notes_idx').on(t.instructorId, t.day)],
)

/** Ders oluşurken dönemin hafta sayısı kadar satır açılır. */
export const courseWeeks = sqliteTable(
  'course_weeks',
  {
    id: id(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    weekNo: integer('week_no').notNull(),
    title: text('title').notNull().default(''),
    ...timestamps(),
  },
  (t) => [uniqueIndex('course_weeks_no_idx').on(t.courseId, t.weekNo)],
)

export const topics = sqliteTable(
  'topics',
  {
    id: id(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    weekNo: integer('week_no'),
    name: text('name').notNull(),
    /** "Hoca vurguladı": sınav planında öncelik. */
    emphasized: integer('emphasized', { mode: 'boolean' })
      .notNull()
      .default(sql`0`),
    sort: integer('sort').notNull().default(0),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('topics_course_idx').on(t.courseId, t.weekNo, t.sort)],
)

/** Değerlendirme bileşeni ve (varsa) alınan puan: bileşen başına tek not. */
export const gradeComponents = sqliteTable(
  'grade_components',
  {
    id: id(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['midterm', 'final', 'homework', 'quiz', 'project', 'other'] })
      .notNull()
      .default('other'),
    /** Yüzde (0–100). */
    weight: real('weight').notNull(),
    /** 0–100; null = girilmedi. */
    score: real('score'),
    scoredOn: text('scored_on'),
    sort: integer('sort').notNull().default(0),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('grade_components_course_idx').on(t.courseId, t.sort)],
)

export const exams = sqliteTable(
  'exams',
  {
    id: id(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    /** Notun yazılacağı bileşen (Vize, Final). */
    componentId: text('component_id'),
    title: text('title').notNull(),
    day: text('day').notNull(),
    startMin: integer('start_min'),
    place: text('place').notNull().default(''),
    /** Kapsam: bu haftaların konuları (sonradan eklenenler dahil) sınava girer; null = elle seçilen konular. */
    weekFrom: integer('week_from'),
    weekTo: integer('week_to'),
    /** Sınav sonrası analiz (markdown): nerede kaybettim, bir dahakine ne yaparım. */
    reviewMd: text('review_md').notNull().default(''),
    /** Son yeniden dağıtmada sığmayan çalışma (dk). */
    unfitMin: integer('unfit_min').notNull().default(0),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('exams_course_idx').on(t.courseId, t.day)],
)

export const examTopics = sqliteTable(
  'exam_topics',
  {
    examId: text('exam_id')
      .notNull()
      .references(() => exams.id),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id),
    /** 0 Bilmiyorum · 1 Tanıdık · 2 Anladım · 3 Çözebiliyorum */
    level: integer('level').notNull().default(0),
    /** Elle tahmini süre (dk); null = seviyeden hesaplanır. */
    estimateMin: integer('estimate_min'),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.examId, t.topicId] })],
)

/** Onaylanmış sınav çalışma planının blokları (Bugün'de sabit blok). */
export const studyBlocks = sqliteTable(
  'study_blocks',
  {
    id: id(),
    examId: text('exam_id')
      .notNull()
      .references(() => exams.id),
    /** null = genel tekrar. */
    topicId: text('topic_id'),
    day: text('day').notNull(),
    startMin: integer('start_min').notNull(),
    endMin: integer('end_min').notNull(),
    status: text('status', { enum: ['planned', 'done', 'missed'] })
      .notNull()
      .default('planned'),
    ...timestamps(),
  },
  (t) => [index('study_blocks_day_idx').on(t.day, t.startMin), index('study_blocks_exam_idx').on(t.examId)],
)

export const assignments = sqliteTable(
  'assignments',
  {
    id: id(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    title: text('title').notNull(),
    /** Son teslim anı. */
    dueAt: integer('due_at', { mode: 'timestamp_ms' }).notNull(),
    status: text('status', { enum: ['todo', 'doing', 'submitted', 'graded'] })
      .notNull()
      .default('todo'),
    score: real('score'),
    weekNo: integer('week_no'),
    /** 48 saat kala kurulan hatırlatma. */
    reminderId: text('reminder_id'),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('assignments_course_idx').on(t.courseId, t.dueAt)],
)

/** Bir ders saatinin (slot) bir günkü yoklaması. Kayıt yoksa işaretlenmemiş. */
export const attendance = sqliteTable(
  'attendance',
  {
    id: id(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    slotId: text('slot_id').notNull(),
    day: text('day').notNull(),
    status: text('status', { enum: ['present', 'absent', 'cancelled'] }).notNull(),
    /** Slot silinse de devamsızlık hesabı değişmesin diye süre (dk) saklanır. */
    durationMin: integer('duration_min').notNull(),
    startMin: integer('start_min').notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('attendance_slot_day_idx').on(t.slotId, t.day), index('attendance_course_idx').on(t.courseId, t.day)],
)

export const courseMaterials = sqliteTable(
  'course_materials',
  {
    id: id(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    weekNo: integer('week_no'),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id),
    kind: text('kind', { enum: ['slide', 'board', 'syllabus', 'other'] })
      .notNull()
      .default('other'),
    title: text('title').notNull(),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('course_materials_idx').on(t.courseId, t.weekNo)],
)

/** Hafta notundaki "anlamadım" işaretleri: notta işaretlenen paragrafın metni. */
export const noteFlags = sqliteTable(
  'note_flags',
  {
    id: id(),
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id),
    courseId: text('course_id').notNull(),
    weekNo: integer('week_no').notNull(),
    kind: text('kind', { enum: ['confused'] })
      .notNull()
      .default('confused'),
    excerpt: text('excerpt').notNull(),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('note_flags_course_idx').on(t.courseId, t.weekNo)],
)
