import { getDb } from '../db/client'
import { getTodaySchedule, moveBlock, rescheduleToday, startTask, unpinBlock } from '../db/schedule'
import { handle } from './handle'

export function registerScheduleIpc(): void {
  handle('schedule:today', () => getTodaySchedule(getDb()))
  handle('schedule:reschedule', () => rescheduleToday(getDb()))
  handle('schedule:move', ({ id, start }) => moveBlock(getDb(), id, start))
  handle('schedule:unpin', ({ id }) => unpinBlock(getDb(), id))
  handle('schedule:start', ({ taskId }) => startTask(getDb(), taskId))
}
