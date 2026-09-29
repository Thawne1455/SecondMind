import { describe, expect, it } from 'vitest'
import { layoutTimeline, MIN_SPAN_DAYS, type TimelineMilestone } from './timeline'

const TODAY = '2026-09-29'
const ms = (over: Partial<TimelineMilestone>): TimelineMilestone => ({
  id: 'm',
  title: 'Taş',
  targetDate: null,
  createdAt: new Date(2026, 8, 1).getTime(),
  done: false,
  finishOn: null,
  late: false,
  ...over,
})
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000

describe('layoutTimeline', () => {
  it('taş yoksa bugün etrafında en az 12 hafta, Pazartesi başlar', () => {
    const t = layoutTimeline([], TODAY)
    expect(t.blocks).toEqual([])
    expect(new Date(t.start).getDay()).toBe(1)
    expect(days(t.start, t.end)).toBeGreaterThanOrEqual(MIN_SPAN_DAYS)
    expect(t.today).toBeGreaterThan(0)
    expect(t.today).toBeLessThan(100)
  })

  it('bloklar ardışık: sonraki taş öncekinin hedefinden başlar; tarihsizler ayrı', () => {
    const t = layoutTimeline(
      [
        ms({ id: 'b', targetDate: '2026-11-15' }),
        ms({ id: 'a', targetDate: '2026-10-20' }),
        ms({ id: 'x' }),
      ],
      TODAY,
    )
    expect(t.blocks.map((b) => b.id)).toEqual(['a', 'b'])
    const [a, b] = t.blocks
    expect(b!.left).toBeCloseTo(a!.target)
    expect(a!.left + a!.width).toBeCloseTo(a!.target)
    expect(t.undated.map((m) => m.id)).toEqual(['x'])
  })

  it('aynı güne düşen hedefte blok en az 3 gün', () => {
    const t = layoutTimeline(
      [ms({ id: 'a', targetDate: '2026-10-20' }), ms({ id: 'b', targetDate: '2026-10-20' })],
      TODAY,
    )
    expect(t.blocks[1]!.width).toBeGreaterThan(0)
  })

  it('geç taşın tahmini hedefin sağında, çizelge tahmini kapsar', () => {
    const t = layoutTimeline(
      [ms({ id: 'a', targetDate: '2026-10-20', late: true, finishOn: '2027-01-10' })],
      TODAY,
    )
    const a = t.blocks[0]!
    expect(a.late).toBe(true)
    expect(a.finish!).toBeGreaterThan(a.target)
    expect(a.finish!).toBeLessThan(100)
    expect(t.end > '2027-01-10').toBe(true)
  })

  it('tamamlanmış taş geç sayılmaz; çok uzak tahmin kırpılır', () => {
    const done = layoutTimeline(
      [ms({ targetDate: '2026-10-20', late: true, finishOn: '2026-12-01', done: true })],
      TODAY,
    )
    expect(done.blocks[0]).toMatchObject({ late: false, finish: null })
    const far = layoutTimeline(
      [ms({ targetDate: '2026-10-20', late: true, finishOn: '2031-01-01' })],
      TODAY,
    )
    expect(far.end < '2027-11-01').toBe(true)
    expect(far.blocks[0]!.finish).toBeLessThanOrEqual(100)
  })

  it('ay etiketleri Türkçe büyük harf, soldan sağa', () => {
    const t = layoutTimeline([ms({ targetDate: '2026-12-20' })], TODAY)
    expect(t.months.map((m) => m.label)).toContain('EKİ')
    const lefts = t.months.map((m) => m.left)
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts)
  })
})
