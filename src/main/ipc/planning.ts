import { getDb } from '../db/client'
import {
  createReminder,
  createRoutine,
  createTask,
  deleteReminder,
  deleteRoutine,
  deleteTask,
  listReminders,
  listRoutines,
  listTasks,
  resolveMissedReminders,
  restoreReminder,
  restoreRoutine,
  restoreTask,
  setTaskDone,
  splitTask,
  updateReminder,
  updateRoutine,
  updateTask,
} from '../db/planning'
import { handle } from './handle'

export function registerPlanningIpc(): void {
  handle('task:list', ({ status }) => listTasks(getDb(), status))
  handle('task:create', (input) => createTask(getDb(), input))
  handle('task:update', (input) => updateTask(getDb(), input))
  handle('task:setDone', ({ id, done }) => setTaskDone(getDb(), id, done))
  handle('task:delete', ({ id }) => deleteTask(getDb(), id))
  handle('task:restore', ({ id }) => restoreTask(getDb(), id))
  handle('task:split', ({ id, titles }) => splitTask(getDb(), id, titles))

  handle('reminder:list', () => listReminders(getDb()))
  handle('reminder:create', (input) => createReminder(getDb(), input))
  handle('reminder:update', (input) => updateReminder(getDb(), input))
  handle('reminder:delete', ({ id }) => deleteReminder(getDb(), id))
  handle('reminder:restore', ({ id }) => restoreReminder(getDb(), id))
  handle('reminder:resolveMissed', ({ ids, action }) =>
    resolveMissedReminders(getDb(), ids, action),
  )

  handle('routine:list', () => listRoutines(getDb()))
  handle('routine:create', (input) => createRoutine(getDb(), input))
  handle('routine:update', (input) => updateRoutine(getDb(), input))
  handle('routine:delete', ({ id }) => deleteRoutine(getDb(), id))
  handle('routine:restore', ({ id }) => restoreRoutine(getDb(), id))
}
