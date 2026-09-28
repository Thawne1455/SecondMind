import { describe, expect, it } from 'vitest'
import { compareTasks, isForToday, type TaskOrderFields } from './tasks'

const t = (id: string, over: Partial<TaskOrderFields> = {}): TaskOrderFields => ({
  id,
  priority: 2,
  dueDate: null,
  plannedDate: null,
  postponeCount: 0,
  createdAt: new Date(2026, 8, 1),
  ...over,
})

const order = (tasks: TaskOrderFields[]) =>
  [...tasks].sort(compareTasks('2026-09-28')).map((x) => x.id)

describe('görev sırası', () => {
  it('bugüne alınmış (ya da geçmişte planlanmış) önce, ileri tarihli değil', () => {
    expect(isForToday(t('a', { plannedDate: '2026-09-27' }), '2026-09-28')).toBe(true)
    expect(isForToday(t('a', { plannedDate: '2026-09-29' }), '2026-09-28')).toBe(false)
    expect(
      order([t('later', { plannedDate: '2026-10-01' }), t('today', { plannedDate: '2026-09-28' })]),
    ).toEqual(['today', 'later'])
  })

  it('son tarih yakın → öncelik → erteleme → eski', () => {
    expect(
      order([
        t('none'),
        t('due-late', { dueDate: '2026-10-10' }),
        t('due-soon', { dueDate: '2026-09-30' }),
      ]),
    ).toEqual(['due-soon', 'due-late', 'none'])
    expect(order([t('normal'), t('high', { priority: 3 }), t('low', { priority: 1 })])).toEqual([
      'high',
      'normal',
      'low',
    ])
    expect(order([t('p0'), t('p3', { postponeCount: 3 })])).toEqual(['p3', 'p0'])
    expect(order([t('new', { createdAt: new Date(2026, 8, 5) }), t('old')])).toEqual(['old', 'new'])
  })
})
