import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@shared/ipc'
import { defaultParkProject, formatTimer, parseActual } from './labels'

describe('gerçek süre', () => {
  it('dakika, saat:dakika, ondalık saat', () => {
    expect(parseActual('90')).toBe(90)
    expect(parseActual('45 dk')).toBe(45)
    expect(parseActual('1:30')).toBe(90)
    expect(parseActual('1,5')).toBe(90)
    expect(parseActual('2 sa')).toBe(120)
    expect(parseActual('yarım')).toBeNull()
    expect(parseActual('0')).toBeNull()
  })
  it('sayaç', () => {
    expect(formatTimer(42 * 60_000)).toBe('0:42')
    expect(formatTimer(125 * 60_000 + 59_000)).toBe('2:05')
  })
})

describe('park projesi', () => {
  const p = (id: string, over: Partial<ProjectSummary> = {}) =>
    ({ id, status: 'active', activeSession: null, lastOpenedAt: null, ...over }) as ProjectSummary
  it('oturum > açık sayfa > son açılan > ilk; arşiv hariç', () => {
    const list = [
      p('a'),
      p('b', { lastOpenedAt: 5 }),
      p('c', { lastOpenedAt: 9, status: 'archived' }),
      p('d', { lastOpenedAt: 3 }),
    ]
    expect(defaultParkProject(list)?.id).toBe('b')
    expect(defaultParkProject(list, 'd')?.id).toBe('d')
    const withSession = [...list, p('e', { activeSession: {} as ProjectSummary['activeSession'] })]
    expect(defaultParkProject(withSession, 'd')?.id).toBe('e')
    expect(defaultParkProject([])).toBeUndefined()
  })
})
