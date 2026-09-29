import { describe, expect, it } from 'vitest'
import type { MilestoneScope } from '@shared/ipc'
import { activeMilestone, daysLeftText, finishText, lateLabel, trendText } from './roadmapText'

const scope = (over: Partial<MilestoneScope['finish']> = {}, openTasks = 3): MilestoneScope => ({
  milestoneId: 'm',
  weeks: [],
  trend: { added: 14, done: 3, state: 'growing' },
  finish: {
    remainingMin: 750,
    dailyPace: 40,
    finishOn: '2026-11-03',
    notFinishing: false,
    late: false,
    ...over,
  },
  openTasks,
  doneTasks: 1,
})

describe('roadmapText', () => {
  it('kalan gün', () => {
    expect(daysLeftText('2026-10-11', '2026-09-29')).toBe('12 gün kaldı')
    expect(daysLeftText('2026-09-29', '2026-09-29')).toBe('Bugün')
    expect(daysLeftText('2026-09-26', '2026-09-29')).toBe('3 gün geçti')
  })

  it('aktif taş: tamamlanmamış, en yakın hedef, tarihsiz sona', () => {
    const m = (id: string, targetDate: string | null, doneAt: number | null = null) => ({
      id,
      targetDate,
      doneAt,
    })
    expect(activeMilestone([m('a', null), m('b', '2026-11-01'), m('c', '2026-10-01', 1)])?.id).toBe(
      'b',
    )
    expect(activeMilestone([m('a', null), m('c', '2026-10-01', 1)])?.id).toBe('a')
    expect(activeMilestone([m('c', '2026-10-01', 1)])).toBeNull()
  })

  it('eğilim cümlesi', () => {
    expect(trendText({ added: 14, done: 3, state: 'growing' })).toBe(
      'son 2 haftada 14 eklendi, 3 bitti · kapsam büyüyor',
    )
  })

  it('bitiş cümlesi', () => {
    expect(finishText(scope(), '2026-12-01')).toBe(
      'Gerçekçi tahmin 3 Kas · kalan ~12 sa 30 dk iş, günde ~40 dk',
    )
    expect(finishText(scope({ late: true }), '2026-10-20')).toMatch(
      /^Hedef 20 Eki · gerçekçi tahmin 3 Kas/,
    )
    expect(finishText(scope({ notFinishing: true, late: true }), '2026-10-20')).toMatch(
      /^Bu hızla bitmiyor/,
    )
    expect(finishText(scope({ finishOn: null, dailyPace: 0 }), null)).toMatch(/oturum yok/)
    expect(finishText(scope({}, 0), null)).toBe('Açık görev yok.')
  })

  it('geç taş etiketi', () => {
    expect(lateLabel('2026-10-20', scope({ late: true }))).toBe('Hedef 20 Eki · tahmin 3 Kas')
    expect(lateLabel('2026-10-20', scope({ notFinishing: true }))).toBe(
      'Hedef 20 Eki · bu hızla bitmiyor',
    )
  })
})
