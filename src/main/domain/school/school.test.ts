import { describe, expect, it } from 'vitest'
import { attendanceStatus, sessionHours } from './attendance'
import {
  buildStudyPlan,
  dayFreeSlots,
  examReadiness,
  redistribute,
  topicMinutes,
  type FreeSlot,
  type StudyTopic,
} from './studyPlan'
import {
  COURSE_TONES,
  defaultEndDate,
  nextOccurrence,
  nextTone,
  slotOccurrences,
  termProgress,
  termWeek,
  weekRange,
} from './term'

// 2026-09-21 Pazartesi
const term = { startDate: '2026-09-21', endDate: '2026-12-27', weekCount: 14 }

describe('term', () => {
  it('hafta numarası', () => {
    expect(termWeek(term, '2026-09-20')).toBe(0)
    expect(termWeek(term, '2026-09-21')).toBe(1)
    expect(termWeek(term, '2026-09-27')).toBe(1)
    expect(termWeek(term, '2026-09-28')).toBe(2)
    expect(termWeek(term, '2026-12-27')).toBe(14)
    expect(termWeek(term, '2027-01-10')).toBe(15)
  })
  it('dönem hafta ortasında başlarsa o hafta 1. hafta', () => {
    expect(termWeek({ ...term, startDate: '2026-09-23' }, '2026-09-21')).toBe(1)
    expect(weekRange({ startDate: '2026-09-23' }, 2)).toEqual({ start: '2026-09-28', end: '2026-10-04' })
  })
  it('bitiş ve ilerleme', () => {
    expect(defaultEndDate('2026-09-21', 14)).toBe('2026-12-27')
    expect(termProgress(term, '2026-09-20')).toBe(0)
    expect(termProgress(term, '2026-12-27')).toBe(1)
    expect(termProgress(term, '2026-11-08')).toBeCloseTo(49 / 98)
  })
  it('ton: kullanılmayan ilk, sonra en az kullanılan', () => {
    expect(nextTone([])).toBe(COURSE_TONES[0])
    expect(nextTone([COURSE_TONES[0], COURSE_TONES[1]])).toBe(COURSE_TONES[2])
    expect(nextTone([...COURSE_TONES, COURSE_TONES[0]])).toBe(COURSE_TONES[1])
  })
  it('oturumlar', () => {
    const occ = slotOccurrences(term, [
      { id: 'a', weekday: 1, startMin: 540, endMin: 650 },
      { id: 'b', weekday: 3, startMin: 600, endMin: 720 },
    ])
    expect(occ).toHaveLength(28)
    expect(occ[0]).toEqual({ slotId: 'a', day: '2026-09-21', startMin: 540, endMin: 650 })
    expect(slotOccurrences(term, [{ id: 'a', weekday: 1, startMin: 540, endMin: 650 }], '2026-09-28')).toHaveLength(2)
  })
  it('sıradaki oturum', () => {
    const slots = [
      { id: 'a', weekday: 1, startMin: 540, endMin: 650 },
      { id: 'b', weekday: 3, startMin: 600, endMin: 720 },
    ]
    // Pazartesi 10:00: ders sürüyor, o gösterilir
    expect(nextOccurrence(term, slots, '2026-09-28', 600)).toEqual({
      slotId: 'a',
      day: '2026-09-28',
      startMin: 540,
      endMin: 650,
    })
    // Pazartesi 11:00: bitti, sıradaki Çarşamba
    expect(nextOccurrence(term, slots, '2026-09-28', 660)?.day).toBe('2026-09-30')
    // Perşembe: haftaya Pazartesi
    expect(nextOccurrence(term, slots, '2026-10-01', 0)?.day).toBe('2026-10-05')
    // Dönem öncesi: ilk oturum; dönem sonrası ve slotsuz: yok
    expect(nextOccurrence(term, slots, '2026-09-10', 0)?.day).toBe('2026-09-21')
    expect(nextOccurrence(term, slots, '2026-12-25', 0)).toBeNull()
    expect(nextOccurrence(term, [], '2026-09-28', 0)).toBeNull()
  })
})

describe('attendanceStatus', () => {
  it('ders saati yuvarlama', () => {
    expect(sessionHours(110)).toBe(2)
    expect(sessionHours(50)).toBe(1)
    expect(sessionHours(20)).toBe(1)
  })
  it('saat sınırı, amber ve aşım', () => {
    const s = (status: 'present' | 'absent' | null) => ({ durationMin: 110, status })
    expect(attendanceStatus([s('absent'), s('present')], { kind: 'hours', value: 8 })).toMatchObject({
      used: 2,
      limit: 8,
      remaining: 6,
      state: 'ok',
    })
    expect(
      attendanceStatus([s('absent'), s('absent'), s('absent')], { kind: 'hours', value: 8 }).state,
    ).toBe('warn')
    expect(
      attendanceStatus([s('absent'), s('absent'), s('absent'), s('absent'), s('absent')], {
        kind: 'hours',
        value: 8,
      }),
    ).toMatchObject({ used: 10, remaining: -2, state: 'over' })
  })
  it('yüzde sınırı toplamdan; iptal sayılmaz', () => {
    const sessions = Array.from({ length: 14 }, () => ({ durationMin: 170, status: null }))
    sessions.push({ durationMin: 170, status: 'cancelled' as never })
    // 14 × 3 = 42 saat, %30 = 12,6 → 12
    expect(attendanceStatus(sessions, { kind: 'percent', value: 30 })).toMatchObject({
      total: 42,
      limit: 12,
      state: 'ok',
    })
  })
  it('sınır yok', () => {
    expect(attendanceStatus([{ durationMin: 60, status: 'absent' }], null)).toMatchObject({
      used: 1,
      limit: null,
      state: 'none',
    })
  })
})

const topic = (id: string, level: 0 | 1 | 2 | 3, emphasized = false, sort = 0): StudyTopic => ({
  id,
  level,
  emphasized,
  estimateMin: null,
  sort,
})

/** Her gün 18:00–22:00 boş. */
const evenings = (days: string[]): FreeSlot[] => days.map((day) => ({ day, start: 1080, end: 1320 }))

describe('studyPlan', () => {
  it('konu süresi', () => {
    expect(topicMinutes(topic('a', 0))).toBe(240)
    expect(topicMinutes(topic('a', 2, true))).toBe(135)
    expect(topicMinutes({ level: 0, emphasized: true, estimateMin: 47 })).toBe(45)
  })
  it('hazırlık yüzdesi', () => {
    expect(examReadiness([])).toBeNull()
    expect(examReadiness([topic('a', 3), topic('b', 0)])).toBe(50)
    expect(examReadiness([topic('a', 3, true), topic('b', 0)])).toBe(60)
  })
  it('önce vurgulanan ve zor konu, son gün tekrar, günlere yayılır', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
    const plan = buildStudyPlan({
      examDay: '2026-10-05',
      today: '2026-10-01',
      topics: [topic('kolay', 3, false, 0), topic('zor', 0, false, 1), topic('vurgu', 2, true, 2)],
      freeSlots: evenings([...days, '2026-10-05']),
      dailyMax: 180,
    })
    // Sınav günü kullanılmaz; son gün (10-04) tekrar.
    expect(plan.blocks.every((b) => b.day < '2026-10-05')).toBe(true)
    const last = plan.blocks.filter((b) => b.day === '2026-10-04')
    expect(last.every((b) => b.topicId === null)).toBe(true)
    expect(plan.reviewMin).toBe(120)
    // Sıra: vurgu (135) → zor (240) → kolay (30)
    const order = [...new Set(plan.blocks.filter((b) => b.topicId).map((b) => b.topicId))]
    expect(order).toEqual(['vurgu', 'zor', 'kolay'])
    expect(plan.unfitMin).toBe(0)
    // Toplam 405 dk, 3 güne: günlük pay 135
    for (const d of days.slice(0, 3)) {
      const sum = plan.blocks.filter((b) => b.day === d).reduce((n, b) => n + b.end - b.start, 0)
      expect(sum).toBeLessThanOrEqual(180)
      expect(sum).toBeGreaterThan(0)
    }
    // Bloklar 25–84 dk ve aynı gün arası en az 10 dk mola.
    for (const b of plan.blocks) expect(b.end - b.start).toBeGreaterThanOrEqual(25)
    const d1 = plan.blocks.filter((b) => b.day === days[0])
    for (let i = 1; i < d1.length; i++) expect(d1[i]!.start - d1[i - 1]!.end).toBeGreaterThanOrEqual(10)
  })
  it('sığmayan dakikalar', () => {
    const plan = buildStudyPlan({
      examDay: '2026-10-02',
      today: '2026-10-01',
      topics: [topic('a', 0), topic('b', 0)],
      freeSlots: evenings(['2026-10-01']),
      dailyMax: 120,
    })
    // Tek gün: tekrar yok, günlük sınır 120
    expect(plan.reviewMin).toBe(0)
    expect(plan.blocks.reduce((n, b) => n + b.end - b.start, 0)).toBe(120)
    expect(plan.unfitMin).toBe(360)
    expect(plan.topics).toEqual([
      { topicId: 'a', needMin: 240, placedMin: 120 },
      { topicId: 'b', needMin: 240, placedMin: 0 },
    ])
  })
  it('mevcut yük günlük sınırdan düşülür', () => {
    const plan = buildStudyPlan({
      examDay: '2026-10-02',
      today: '2026-10-01',
      topics: [topic('a', 0)],
      freeSlots: evenings(['2026-10-01']),
      dailyMax: 120,
      load: { '2026-10-01': 90 },
    })
    expect(plan.blocks.reduce((n, b) => n + b.end - b.start, 0)).toBe(30)
  })
  it('yeniden dağıtma kalan günlere yayar', () => {
    const r = redistribute({
      missed: [
        { day: '2026-10-01', start: 1080, end: 1140, topicId: 'a' },
        { day: '2026-10-01', start: 1150, end: 1210, topicId: 'b' },
      ],
      examDay: '2026-10-04',
      today: '2026-10-02',
      freeSlots: evenings(['2026-10-02', '2026-10-03', '2026-10-04']),
      dailyMax: 180,
      load: { '2026-10-02': 150 },
    })
    expect(r.unfitMin).toBe(0)
    expect(r.blocks.map((b) => [b.day, b.topicId, b.end - b.start])).toEqual([
      ['2026-10-03', 'a', 60],
      ['2026-10-03', 'b', 60],
    ])
  })
  it('boş aralıklar: tampon, pencere, şimdi', () => {
    expect(dayFreeSlots('2026-10-01', [{ start: 600, end: 720 }])).toEqual([
      { day: '2026-10-01', start: 540, end: 590 },
      { day: '2026-10-01', start: 730, end: 1320 },
    ])
    expect(dayFreeSlots('2026-10-01', [], undefined, 1300)).toEqual([])
    expect(dayFreeSlots('2026-10-01', [], undefined, 1201)).toEqual([
      { day: '2026-10-01', start: 1205, end: 1320 },
    ])
  })
})

describe('gün içi tercih', () => {
  it('önce öğleden sonrası dolar, sabah yer kalmazsa', () => {
    const plan = buildStudyPlan({
      examDay: '2026-10-02',
      today: '2026-10-01',
      topics: [topic('a', 0)],
      freeSlots: [{ day: '2026-10-01', start: 540, end: 900 }],
      dailyMax: 240,
    })
    // 13:00–15:00 iki blok (110 dk), kalan 130 dk sabah 09:00'dan; çıktı saat sırasıyla.
    expect(plan.blocks.map((b) => [b.start, b.end])).toEqual([
      [540, 600],
      [610, 680],
      [780, 840],
      [850, 900],
    ])
  })
})
