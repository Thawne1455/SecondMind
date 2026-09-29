import { describe, expect, it } from 'vitest'
import type { IdeaToday, ProjectSummary } from '@shared/ipc'
import { pickRadar } from './radar'

const project = (name: string, silentDays: number, over: Partial<ProjectSummary> = {}) =>
  ({ id: name, name, status: 'active', silentDays, activeSession: null, ...over }) as ProjectSummary
const idea = (days: number) =>
  ({ noteId: 'n', title: 'Fikir', days }) as NonNullable<IdeaToday['radar']>

describe('radar', () => {
  it('en uzun süredir sessiz olan; eşitlikte proje', () => {
    expect(pickRadar(idea(30), [project('Albüm', 17)])).toMatchObject({ kind: 'idea', days: 30 })
    expect(pickRadar(idea(30), [project('Albüm', 40)])).toMatchObject({ kind: 'project', days: 40 })
    expect(pickRadar(idea(30), [project('Albüm', 30)])).toMatchObject({ kind: 'project' })
  })

  it('14 günden az, duraklatılmış ya da oturumu süren proje sayılmaz', () => {
    const running = { id: 's' } as ProjectSummary['activeSession']
    expect(
      pickRadar(null, [
        project('a', 13),
        project('b', 90, { status: 'paused' }),
        project('c', 90, { activeSession: running }),
      ]),
    ).toBeNull()
    expect(pickRadar(undefined, [project('a', 14), project('b', 20)])).toMatchObject({
      kind: 'project',
      project: { name: 'b' },
    })
  })
})
