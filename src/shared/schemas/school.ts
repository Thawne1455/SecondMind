import { z } from 'zod'
import { dayKeySchema } from './planning'

// Okul kanallarının şemaları (Aşama 6, OKUL.md). Sözleşme `ipc.ts`'te.

export const TERM_NAME_MAX = 80
export const COURSE_NAME_MAX = 120
export const SCHOOL_TEXT_MAX = 2000
export const REVIEW_MAX = 20_000
export const LETTER_MAX = 4

const dayMin = z.number().int().min(0).max(24 * 60)
const score = z.number().min(0).max(100)
const nameText = (max: number) => z.string().trim().min(1, 'Boş olamaz').max(max)

export const letterRowSchema = z.object({
  letter: z.string().trim().min(1).max(LETTER_MAX),
  min: score,
  points: z.number().min(0).max(10),
})
export const letterTableSchema = z.array(letterRowSchema).min(1).max(20)

export const attendanceLimitSchema = z.object({
  kind: z.enum(['percent', 'hours']),
  value: z.number().min(0).max(1000),
})

export const termSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: dayKeySchema,
  endDate: dayKeySchema,
  weekCount: z.number(),
  active: z.boolean(),
})

export const termSaveInputSchema = z
  .object({
    id: z.string().optional(),
    name: nameText(TERM_NAME_MAX),
    startDate: dayKeySchema,
    weekCount: z.number().int().min(1).max(30),
    /** Verilmezse başlangıç + hafta sayısından. */
    endDate: dayKeySchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((t) => !t.endDate || t.endDate >= t.startDate, 'Bitiş başlangıçtan önce olamaz')

export const slotSchema = z.object({
  id: z.string(),
  weekday: z.number().int().min(1).max(7),
  startMin: dayMin,
  endMin: dayMin,
  room: z.string(),
})

export const slotInputSchema = z
  .object({
    id: z.string().optional(),
    weekday: z.number().int().min(1).max(7),
    startMin: dayMin,
    endMin: dayMin,
    room: z.string().trim().max(60).default(''),
  })
  .refine((s) => s.endMin > s.startMin, 'Bitiş saati başlangıçtan sonra olmalı')

export const instructorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  room: z.string(),
  officeHours: z.string(),
})

export const instructorSaveInputSchema = z.object({
  id: z.string().optional(),
  name: nameText(120),
  email: z.string().trim().max(200).default(''),
  room: z.string().trim().max(60).default(''),
  officeHours: z.string().trim().max(300).default(''),
})

export const courseSchema = z.object({
  id: z.string(),
  termId: z.string(),
  name: z.string(),
  code: z.string(),
  credit: z.number(),
  tone: z.string(),
  instructorId: z.string().nullable(),
  room: z.string(),
  attendanceLimit: attendanceLimitSchema.nullable(),
  letterTable: letterTableSchema.nullable(),
  letter: z.string().nullable(),
  targetLetter: z.string(),
  slots: z.array(slotSchema),
})

export const componentKindSchema = z.enum(['midterm', 'final', 'homework', 'quiz', 'project', 'other'])

export const componentInputSchema = z.object({
  id: z.string().optional(),
  name: nameText(60),
  kind: componentKindSchema,
  weight: z.number().min(0).max(100),
})

export const courseSaveInputSchema = z.object({
  id: z.string().optional(),
  termId: z.string(),
  name: nameText(COURSE_NAME_MAX),
  code: z.string().trim().max(30).optional(),
  credit: z.number().min(0).max(60).optional(),
  room: z.string().trim().max(60).optional(),
  /** Hoca adı: aynı adlı hoca varsa ona bağlanır, yoksa oluşur; boş = hocasız. */
  instructorName: z.string().trim().max(120).optional(),
  attendanceLimit: attendanceLimitSchema.nullable().optional(),
  letterTable: letterTableSchema.nullable().optional(),
  letter: z.string().trim().max(LETTER_MAX).nullable().optional(),
  targetLetter: z.string().trim().min(1).max(LETTER_MAX).optional(),
  tone: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  /** Verilirse haftalık program bununla değiştirilir. */
  slots: z.array(slotInputSchema).max(20).optional(),
  /** Sadece oluştururken: değerlendirme şeması. */
  components: z.array(componentInputSchema).max(20).optional(),
})

/** İlk kurulum sihirbazı: dönem + dersler tek seferde. */
export const schoolSetupInputSchema = z.object({
  term: termSaveInputSchema,
  courses: z.array(courseSaveInputSchema.omit({ termId: true })).max(20),
})

export const requiredScoresSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('final'), score: z.number(), letter: z.string(), reached: z.boolean() }),
  z.object({ status: z.literal('needs'), min: z.number(), remaining: z.array(z.string()) }),
  z.object({ status: z.literal('secured'), remaining: z.array(z.string()) }),
  z.object({
    status: z.literal('impossible'),
    best: z.number(),
    bestLetter: z.string(),
    remaining: z.array(z.string()),
  }),
])

export const attendanceStatusSchema = z.object({
  used: z.number(),
  limit: z.number().nullable(),
  remaining: z.number().nullable(),
  state: z.enum(['none', 'ok', 'warn', 'over']),
  total: z.number(),
})

export const courseScoreSchema = z.object({
  earned: z.number(),
  current: z.number().nullable(),
  completedWeight: z.number(),
  totalWeight: z.number(),
  /** Elle girilen harf ya da gidişatın harfi; hiç not yoksa null. */
  letter: z.string().nullable(),
  letterManual: z.boolean(),
  required: requiredScoresSchema,
})

export const examCardSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  courseName: z.string(),
  tone: z.string(),
  title: z.string(),
  day: dayKeySchema,
  startMin: z.number().nullable(),
  place: z.string(),
  daysLeft: z.number(),
  readiness: z.number().nullable(),
  topicCount: z.number(),
  plannedMin: z.number(),
  doneMin: z.number(),
})

/** Panodaki ders satırının hafta karesi: içerik (not, materyal, konu, başlık) var mı, açık "anlamadım" sayısı. */
export const boardWeekSchema = z.object({
  weekNo: z.number(),
  title: z.string(),
  filled: z.boolean(),
  openFlags: z.number(),
})

export const nextClassSchema = z.object({
  day: dayKeySchema,
  startMin: z.number(),
  endMin: z.number(),
  room: z.string(),
})

export const boardCourseSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  credit: z.number(),
  tone: z.string(),
  targetLetter: z.string(),
  score: courseScoreSchema,
  attendance: attendanceStatusSchema,
  weeks: z.array(boardWeekSchema),
  nextClass: nextClassSchema.nullable(),
})

export const attendanceMarkSchema = z.enum(['present', 'absent', 'cancelled'])

export const weekClassSchema = z.object({
  slotId: z.string(),
  courseId: z.string(),
  name: z.string(),
  code: z.string(),
  tone: z.string(),
  room: z.string(),
  day: dayKeySchema,
  startMin: z.number(),
  endMin: z.number(),
  attendance: attendanceMarkSchema.nullable(),
})

export const studyBlockStatusSchema = z.enum(['planned', 'done', 'missed'])

export const weekStudySchema = z.object({
  id: z.string(),
  examId: z.string(),
  courseId: z.string(),
  tone: z.string(),
  title: z.string(),
  day: dayKeySchema,
  startMin: z.number(),
  endMin: z.number(),
  status: studyBlockStatusSchema,
})

export const assignmentStatusSchema = z.enum(['todo', 'doing', 'submitted', 'graded'])

export const assignmentSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  dueAt: z.number(),
  status: assignmentStatusSchema,
  score: z.number().nullable(),
  weekNo: z.number().nullable(),
})

export const boardAssignmentSchema = assignmentSchema.extend({
  courseName: z.string(),
  tone: z.string(),
})

export const schoolBoardSchema = z.object({
  term: termSchema.nullable(),
  today: dayKeySchema,
  week: z.number(),
  progress: z.number(),
  termGpa: z.number().nullable(),
  overallGpa: z.number().nullable(),
  courses: z.array(boardCourseSchema),
  exams: z.array(examCardSchema),
  weekStart: dayKeySchema,
  classes: z.array(weekClassSchema),
  study: z.array(weekStudySchema),
  dueThisWeek: z.array(boardAssignmentSchema),
  /** Bugün / Yarın şeridi: iki günün dersleri ve çalışma blokları, 48 saat içindeki (ve gecikmiş) açık teslimler. */
  tomorrow: dayKeySchema,
  soonClasses: z.array(weekClassSchema),
  soonStudy: z.array(weekStudySchema),
  dueSoon: z.array(boardAssignmentSchema),
})

export const topicSchema = z.object({
  id: z.string(),
  weekNo: z.number().nullable(),
  name: z.string(),
  emphasized: z.boolean(),
})

export const materialKindSchema = z.enum(['slide', 'board', 'syllabus', 'other'])

export const materialSchema = z.object({
  id: z.string(),
  weekNo: z.number().nullable(),
  kind: materialKindSchema,
  title: z.string(),
  url: z.string(),
  mime: z.string(),
})

export const flagSchema = z.object({
  id: z.string(),
  weekNo: z.number(),
  noteId: z.string(),
  excerpt: z.string(),
  resolved: z.boolean(),
  createdAt: z.number(),
})

export const courseWeekSchema = z.object({
  weekNo: z.number(),
  id: z.string(),
  title: z.string(),
  start: dayKeySchema,
  end: dayKeySchema,
  noteId: z.string().nullable(),
  /** Notun gövdesi boş değil. */
  hasNote: z.boolean(),
  materialCount: z.number(),
  openFlags: z.number(),
  topics: z.array(topicSchema),
})

export const componentSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: componentKindSchema,
  weight: z.number(),
  score: z.number().nullable(),
  scoredOn: dayKeySchema.nullable(),
})

export const examSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  day: dayKeySchema,
  startMin: z.number().nullable(),
  place: z.string(),
  componentId: z.string().nullable(),
  /** Bileşene girilen puan. */
  score: z.number().nullable(),
  reviewMd: z.string(),
  topicIds: z.array(z.string()),
  weekFrom: z.number().nullable(),
  weekTo: z.number().nullable(),
  readiness: z.number().nullable(),
})

export const instructorNoteSchema = z.object({
  id: z.string(),
  text: z.string(),
  day: dayKeySchema,
  courseId: z.string().nullable(),
  courseName: z.string().nullable(),
})

export const attendanceSessionSchema = z.object({
  slotId: z.string(),
  day: dayKeySchema,
  startMin: z.number(),
  endMin: z.number(),
  status: attendanceMarkSchema.nullable(),
  past: z.boolean(),
})

export const courseDetailSchema = z.object({
  course: courseSchema,
  term: termSchema,
  /** Arşiv dönemin dersi: salt okunur. */
  readOnly: z.boolean(),
  instructor: instructorSchema.nullable(),
  instructorNotes: z.array(instructorNoteSchema),
  currentWeek: z.number(),
  weeks: z.array(courseWeekSchema),
  components: z.array(componentSchema),
  score: courseScoreSchema,
  exams: z.array(examSummarySchema),
  assignments: z.array(assignmentSchema),
  attendance: attendanceStatusSchema,
  sessions: z.array(attendanceSessionSchema),
  materials: z.array(materialSchema),
  flags: z.array(flagSchema),
  nextExamDays: z.number().nullable(),
})

export const courseListItemSchema = courseSchema.extend({
  instructorName: z.string().nullable(),
})

export const examSaveInputSchema = z.object({
  id: z.string().optional(),
  courseId: z.string(),
  title: nameText(120),
  day: dayKeySchema,
  startMin: dayMin.nullable().default(null),
  place: z.string().trim().max(120).default(''),
  componentId: z.string().nullable().optional(),
  /** Kapsam haftaları: verilirse sınavın konuları bu haftaların konuları olur. */
  weekFrom: z.number().int().min(1).max(30).nullable().optional(),
  weekTo: z.number().int().min(1).max(30).nullable().optional(),
  topicIds: z.array(z.string()).max(200).optional(),
  reviewMd: z.string().max(REVIEW_MAX).optional(),
})

export const prepTopicSchema = z.object({
  topicId: z.string(),
  name: z.string(),
  weekNo: z.number().nullable(),
  emphasized: z.boolean(),
  included: z.boolean(),
  level: z.number(),
  estimateMin: z.number().nullable(),
  minutes: z.number(),
  openFlags: z.array(z.object({ id: z.string(), excerpt: z.string() })),
})

export const prepBlockSchema = z.object({
  id: z.string(),
  day: dayKeySchema,
  startMin: z.number(),
  endMin: z.number(),
  topicId: z.string().nullable(),
  topicName: z.string(),
  status: studyBlockStatusSchema,
})

export const examPrepSchema = z.object({
  exam: examSummarySchema,
  courseId: z.string(),
  courseName: z.string(),
  tone: z.string(),
  daysLeft: z.number(),
  readOnly: z.boolean(),
  topics: z.array(prepTopicSchema),
  blocks: z.array(prepBlockSchema),
  plannedMin: z.number(),
  doneMin: z.number(),
  unfitMin: z.number(),
  dailyMaxMin: z.number(),
  reviews: z.array(z.object({ id: z.string(), title: z.string(), day: dayKeySchema, reviewMd: z.string() })),
})

export const planPreviewSchema = z.object({
  blocks: z.array(
    z.object({
      day: dayKeySchema,
      startMin: z.number(),
      endMin: z.number(),
      topicId: z.string().nullable(),
      topicName: z.string(),
    }),
  ),
  totalMin: z.number(),
  reviewMin: z.number(),
  unfitMin: z.number(),
  /** Yerine geçecek (henüz yapılmamış) blok sayısı. */
  replaces: z.number(),
})

export const examTopicSetInputSchema = z.object({
  examId: z.string(),
  topicId: z.string(),
  included: z.boolean().optional(),
  level: z.number().int().min(0).max(3).optional(),
  estimateMin: z.number().int().min(0).max(40 * 60).nullable().optional(),
})

export const assignmentSaveInputSchema = z.object({
  id: z.string().optional(),
  courseId: z.string(),
  title: nameText(200),
  dueAt: z.number(),
  status: assignmentStatusSchema.optional(),
  score: score.nullable().optional(),
  weekNo: z.number().int().min(1).max(30).nullable().optional(),
})

export const topicSaveInputSchema = z.object({
  id: z.string().optional(),
  courseId: z.string(),
  weekNo: z.number().int().min(1).max(30).nullable().optional(),
  name: nameText(200),
  emphasized: z.boolean().optional(),
})

export const gpaOverviewSchema = z.object({
  terms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      active: z.boolean(),
      order: z.number(),
      courses: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          code: z.string(),
          credit: z.number(),
          letter: z.string().nullable(),
          estimated: z.boolean(),
          letterTable: letterTableSchema,
        }),
      ),
    }),
  ),
})

/** Bugün'deki "Derse katıldın mı?" soruları: bugün biten, işaretlenmemiş dersler. */
export const attendanceQuestionSchema = z.object({
  slotId: z.string(),
  courseId: z.string(),
  name: z.string(),
  tone: z.string(),
  day: dayKeySchema,
  startMin: z.number(),
  endMin: z.number(),
})

export const schoolRestoreInputSchema = z.object({
  table: z.enum([
    'terms',
    'courses',
    'topics',
    'grade_components',
    'exams',
    'assignments',
    'course_materials',
    'instructor_notes',
    'note_flags',
  ]),
  id: z.string(),
})

export type LetterRow = z.infer<typeof letterRowSchema>
export type AttendanceLimit = z.infer<typeof attendanceLimitSchema>
export type Term = z.infer<typeof termSchema>
export type TermSaveInput = z.input<typeof termSaveInputSchema>
export type Slot = z.infer<typeof slotSchema>
export type SlotInput = z.input<typeof slotInputSchema>
export type Instructor = z.infer<typeof instructorSchema>
export type Course = z.infer<typeof courseSchema>
export type CourseListItem = z.infer<typeof courseListItemSchema>
export type CourseSaveInput = z.input<typeof courseSaveInputSchema>
export type ComponentInput = z.input<typeof componentInputSchema>
export type ComponentKind = z.infer<typeof componentKindSchema>
export type SchoolSetupInput = z.input<typeof schoolSetupInputSchema>
export type RequiredScoresOut = z.infer<typeof requiredScoresSchema>
export type AttendanceStatusOut = z.infer<typeof attendanceStatusSchema>
export type CourseScore = z.infer<typeof courseScoreSchema>
export type ExamCard = z.infer<typeof examCardSchema>
export type BoardCourse = z.infer<typeof boardCourseSchema>
export type BoardWeek = z.infer<typeof boardWeekSchema>
export type NextClass = z.infer<typeof nextClassSchema>
export type AttendanceMark = z.infer<typeof attendanceMarkSchema>
export type WeekClass = z.infer<typeof weekClassSchema>
export type WeekStudy = z.infer<typeof weekStudySchema>
export type StudyBlockStatus = z.infer<typeof studyBlockStatusSchema>
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>
export type Assignment = z.infer<typeof assignmentSchema>
export type BoardAssignment = z.infer<typeof boardAssignmentSchema>
export type SchoolBoard = z.infer<typeof schoolBoardSchema>
export type Topic = z.infer<typeof topicSchema>
export type MaterialKind = z.infer<typeof materialKindSchema>
export type Material = z.infer<typeof materialSchema>
export type Flag = z.infer<typeof flagSchema>
export type CourseWeek = z.infer<typeof courseWeekSchema>
export type GradeComponent = z.infer<typeof componentSchema>
export type ExamSummary = z.infer<typeof examSummarySchema>
export type InstructorNote = z.infer<typeof instructorNoteSchema>
export type AttendanceSession = z.infer<typeof attendanceSessionSchema>
export type CourseDetail = z.infer<typeof courseDetailSchema>
export type ExamSaveInput = z.input<typeof examSaveInputSchema>
export type PrepTopic = z.infer<typeof prepTopicSchema>
export type PrepBlock = z.infer<typeof prepBlockSchema>
export type ExamPrep = z.infer<typeof examPrepSchema>
export type PlanPreview = z.infer<typeof planPreviewSchema>
export type ExamTopicSetInput = z.input<typeof examTopicSetInputSchema>
export type AssignmentSaveInput = z.input<typeof assignmentSaveInputSchema>
export type TopicSaveInput = z.input<typeof topicSaveInputSchema>
export type GpaOverview = z.infer<typeof gpaOverviewSchema>
export type AttendanceQuestion = z.infer<typeof attendanceQuestionSchema>
export type SchoolRestoreInput = z.infer<typeof schoolRestoreInputSchema>
