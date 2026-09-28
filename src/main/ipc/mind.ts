import { getDb } from '../db/client'
import { getTodayCheckin, getWeekAchievements, setTodayCheckin } from '../db/mind'
import { handle } from './handle'

export function registerMindIpc(): void {
  handle('checkin:today', () => getTodayCheckin(getDb()))
  handle('checkin:set', (input) => setTodayCheckin(getDb(), input))
  handle('achievement:week', () => getWeekAchievements(getDb()))
}
