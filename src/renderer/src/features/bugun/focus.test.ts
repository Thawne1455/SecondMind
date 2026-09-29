import { describe, expect, it } from 'vitest'
import type { ProjectSummary, ScheduleBlock, ScheduleDay, Task } from '@shared/ipc'
import { pickFocus } from './focus'

const task = (id: string, projectId: string | null = null) => ({ id, projectId, title: id }) as Task
const block = (id: string, start: number, end: number, over: Partial<ScheduleBlock> = {}) =>
  ({ id, start, end, kind: 'task', done: false, sourceId: id, title: id, ...over }) as ScheduleBlock
const day = (blocks: ScheduleBlock[]) => ({ blocks, freeGaps: [] }) as unknown as ScheduleDay
const top = (taskId: string | null) =>
  ({ topStep: { title: 't', reason: 'r', taskId } }) as Pick<ProjectSummary, 'topStep'>
const none = new Map<string, Pick<ProjectSummary, 'topStep'>>()

describe('Şimdi odağı', () => {
  it('şu anki blok, yoksa sıradaki blok; görevlerden önce gelir', () => {
    const open = [task('a')]
    expect(pickFocus(day([block('b1', 600, 660)]), 630, open, none, null)).toMatchObject({
      kind: 'current',
      block: { id: 'b1' },
    })
    expect(pickFocus(day([block('b1', 700, 760)]), 630, open, none, null)).toMatchObject({
      kind: 'next',
      block: { id: 'b1' },
    })
    expect(
      pickFocus(day([block('b1', 600, 660, { done: true })]), 630, open, none, null),
    ).toMatchObject({ kind: 'task', task: { id: 'a' } })
  })

  it('aynı anda rutin ve görev bloğu: görev öne', () => {
    const blocks = [block('r', 600, 700, { kind: 'routine' }), block('g', 620, 680)]
    expect(pickFocus(day(blocks), 630, [], none, null)).toMatchObject({ block: { id: 'g' } })
  })

  it('görev yoksa boş', () => {
    expect(pickFocus(undefined, 630, [], none, null)).toEqual({ kind: 'empty' })
  })

  it('en öndeki proje dışı görev olduğu gibi kalır', () => {
    const open = [task('a'), task('p2', 'P')]
    const projects = new Map([['P', top('p2')]])
    expect(pickFocus(undefined, 0, open, projects, null)).toMatchObject({ task: { id: 'a' } })
  })

  it('en öndeki proje görevi → o projenin motor 1. adımının görevi', () => {
    const open = [task('p1', 'P'), task('a'), task('p2', 'P')]
    const projects = new Map([['P', top('p2')]])
    expect(pickFocus(undefined, 0, open, projects, null)).toMatchObject({ task: { id: 'p2' } })
  })

  it('motorun adımı görev değilse ya da açık görevlerde yoksa en öndeki kalır', () => {
    const open = [task('p1', 'P')]
    expect(pickFocus(undefined, 0, open, new Map([['P', top(null)]]), null)).toMatchObject({
      task: { id: 'p1' },
    })
    expect(pickFocus(undefined, 0, open, new Map([['P', top('yok')]]), null)).toMatchObject({
      task: { id: 'p1' },
    })
    const noStep = new Map([['P', { topStep: null }]])
    expect(pickFocus(undefined, 0, open, noStep, null)).toMatchObject({ task: { id: 'p1' } })
  })

  it('oturum süren projenin 1. adımı en öndeki görevden önce gelir', () => {
    const open = [task('a'), task('p1', 'P'), task('q1', 'Q')]
    const projects = new Map([
      ['P', top('p1')],
      ['Q', top('q1')],
    ])
    expect(pickFocus(undefined, 0, open, projects, 'Q')).toMatchObject({ task: { id: 'q1' } })
  })

  it('oturum süren projenin adımı yoksa normal akışa döner', () => {
    const open = [task('p1', 'P'), task('p2', 'P')]
    const projects = new Map([
      ['P', top('p2')],
      ['Q', top(null)],
    ])
    expect(pickFocus(undefined, 0, open, projects, 'Q')).toMatchObject({ task: { id: 'p2' } })
  })

  it('bloklar varken motor devreye girmez', () => {
    const open = [task('p1', 'P')]
    const projects = new Map([['P', top('p1')]])
    expect(pickFocus(day([block('b1', 700, 760)]), 0, open, projects, 'P')).toMatchObject({
      kind: 'next',
    })
  })
})
