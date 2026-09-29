import { describe, expect, it } from 'vitest'
import type { Task } from '@shared/ipc'
import { columnOf, groupTasks, neighborColumn } from './board'

const task = (over: Partial<Task>): Task => ({
  id: 't',
  title: 'Görev',
  notes: '',
  status: 'open',
  priority: 2,
  estimateMin: null,
  dueDate: null,
  plannedDate: null,
  postponeCount: 0,
  completedAt: null,
  createdAt: 0,
  projectId: 'p',
  kind: 'task',
  kanbanStatus: 'todo',
  severity: null,
  reproSteps: '',
  milestoneId: null,
  source: 'taha',
  ...over,
})

describe('columnOf', () => {
  it('kanban durumunu kullanır, yoksa durumdan türetir', () => {
    expect(columnOf(task({ kanbanStatus: 'testing' }))).toBe('testing')
    expect(columnOf(task({ kanbanStatus: null, status: 'done' }))).toBe('done')
    expect(columnOf(task({ kanbanStatus: null }))).toBe('todo')
  })
})

describe('neighborColumn', () => {
  it('kenarda null döner', () => {
    expect(neighborColumn('todo', -1)).toBeNull()
    expect(neighborColumn('todo', 1)).toBe('doing')
    expect(neighborColumn('testing', 1)).toBe('done')
    expect(neighborColumn('done', 1)).toBeNull()
  })
})

describe('groupTasks', () => {
  const list = [
    task({ id: 'a', kind: 'bug', milestoneId: 'm1' }),
    task({ id: 'b', kanbanStatus: 'doing' }),
    task({ id: 'c', kanbanStatus: 'done', status: 'done', milestoneId: 'm1' }),
  ]

  it('filtresizken hepsini kolonlarına ayırır, sırayı korur', () => {
    const g = groupTasks(list, { milestoneId: null, kind: null })
    expect(g.todo.map((t) => t.id)).toEqual(['a'])
    expect(g.doing.map((t) => t.id)).toEqual(['b'])
    expect(g.testing).toEqual([])
    expect(g.done.map((t) => t.id)).toEqual(['c'])
  })

  it('taşa ve türe göre süzer; "none" taşsızları seçer', () => {
    expect(groupTasks(list, { milestoneId: 'm1', kind: 'bug' }).todo.map((t) => t.id)).toEqual([
      'a',
    ])
    expect(groupTasks(list, { milestoneId: 'm1', kind: null }).done).toHaveLength(1)
    const none = groupTasks(list, { milestoneId: 'none', kind: null })
    expect([...none.todo, ...none.doing, ...none.done].map((t) => t.id)).toEqual(['b'])
  })
})
