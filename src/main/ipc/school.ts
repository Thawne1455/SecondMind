import { shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getDb } from '../db/client'
import {
  activateTerm,
  addFlag,
  addInstructorNote,
  addMaterial,
  applyPlan,
  attendanceQuestions,
  clearPlan,
  getBoard,
  getCourseDetail,
  getExamPrep,
  gpaOverview,
  listCourses,
  listInstructors,
  listTerms,
  materialFile,
  moveCourse,
  previewPlan,
  restoreSchool,
  saveAssignment,
  saveComponent,
  saveCourse,
  saveExam,
  saveInstructor,
  saveTerm,
  saveTopic,
  setAttendance,
  setExamTopic,
  setFlagResolved,
  setGrade,
  setStudyStatus,
  setupSchool,
  setWeekTitle,
  softDelete,
  updateMaterial,
  weekNote,
} from '../db/school'
import { getSetting } from '../db/settings'
import { storeMedia } from '../media'
import type { DataPaths } from '../paths'
import { handle } from './handle'

// Okul (Aşama 6). Bütün hesaplar `db/school` ve `domain/school`'da; burası sadece bağlar.

const dailyMax = () => getSetting(getDb(), 'studyDailyMaxMin')

export function registerSchoolIpc(paths: DataPaths): void {
  handle('term:list', () => listTerms(getDb()))
  handle('term:save', (input) => saveTerm(getDb(), input))
  handle('term:activate', ({ id }) => activateTerm(getDb(), id))
  handle('school:setup', (input) => setupSchool(getDb(), input))
  handle('school:board', () => getBoard(getDb(), dailyMax()))
  handle('school:delete', ({ table, id }) => softDelete(getDb(), table, id))
  handle('school:restore', (input) => restoreSchool(getDb(), input))
  handle('course:list', ({ termId }) => listCourses(getDb(), termId))
  handle('course:get', ({ id }) => getCourseDetail(getDb(), id, dailyMax()))
  handle('course:save', (input) => saveCourse(getDb(), input))
  handle('course:move', ({ id, dir }) => moveCourse(getDb(), id, dir))
  handle('instructor:list', () => listInstructors(getDb()))
  handle('instructor:save', ({ courseId, ...input }) => saveInstructor(getDb(), input, courseId))
  handle('instructorNote:add', ({ courseId, text }) => addInstructorNote(getDb(), courseId, text))
  handle('week:setTitle', ({ courseId, weekNo, title }) => setWeekTitle(getDb(), courseId, weekNo, title))
  handle('week:note', ({ courseId, weekNo }) => weekNote(getDb(), courseId, weekNo))
  handle('topic:save', (input) => saveTopic(getDb(), input))
  handle('flag:add', ({ noteId, excerpt }) => addFlag(getDb(), noteId, excerpt))
  handle('flag:resolve', ({ id, resolved }) => setFlagResolved(getDb(), id, resolved))
  handle('material:add', ({ name, mime, bytes, courseId, weekNo, kind }) => {
    const file = storeMedia(getDb(), paths.media, { name, mime, bytes })
    return addMaterial(getDb(), { courseId, weekNo, kind, title: name.replace(/\.[^.]+$/, '') }, file)
  })
  handle('material:update', (input) => updateMaterial(getDb(), input))
  handle('material:open', async ({ id }) => {
    const err = await shell.openPath(join(paths.media, materialFile(getDb(), id).fileName))
    if (err) throw new Error(`Açılamadı: ${err}`)
  })
  handle('material:bytes', async ({ id }) => {
    const buf = await readFile(join(paths.media, materialFile(getDb(), id).fileName))
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  })
  handle('component:save', ({ courseId, ...input }) => saveComponent(getDb(), { courseId, ...input }))
  handle('grade:set', ({ componentId, score }) => setGrade(getDb(), componentId, score))
  handle('exam:save', (input) => saveExam(getDb(), input))
  handle('exam:prep', ({ id }) => getExamPrep(getDb(), id, dailyMax()))
  handle('examTopic:set', (input) => setExamTopic(getDb(), input))
  handle('exam:planPreview', ({ id }) => previewPlan(getDb(), id, dailyMax()))
  handle('exam:planApply', ({ id }) => applyPlan(getDb(), id, dailyMax()))
  handle('exam:planClear', ({ id }) => clearPlan(getDb(), id))
  handle('study:setStatus', ({ id, status }) => setStudyStatus(getDb(), id, status))
  handle('assignment:save', (input) => saveAssignment(getDb(), input))
  handle('attendance:set', (input) => setAttendance(getDb(), input))
  handle('attendance:questions', () => attendanceQuestions(getDb()))
  handle('gpa:overview', () => gpaOverview(getDb()))
}
