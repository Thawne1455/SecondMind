import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TASK_MIN,
  FALLBACK_RATIO,
  estimateRatio,
  median,
  realisticFinish,
  scopeSentence,
  scopeTrend,
  scopeWeeks,
  type FinishInput,
  type ScopeTask,
} from './scope'

// Yerel saat: 30 Eylül 2026 Çarşamba 12:00; bu haftanın Pazartesi'si 28 Eylül.
const at = (m: number, d: number, h = 12, min = 0) => new Date(2026, m - 1, d, h, min).getTime()
const NOW = at(9, 30)
const DAY = 86_400_000
const ago = (days: number) => NOW - days * DAY
const task = (milestoneSetAt: number | null, completedAt: number | null = null): ScopeTask => ({
  milestoneSetAt,
  completedAt,
})

describe('scopeWeeks', () => {
  it('8 hafta, Pazartesi başlangıçlı, son eleman bu hafta', () => {
    const w = scopeWeeks([], NOW)
    expect(w).toHaveLength(8)
    expect(w[7]!.weekStart).toBe('2026-09-28')
    expect(w[0]!.weekStart).toBe('2026-08-10')
    expect(w.every((x) => x.added === 0 && x.done === 0 && x.remaining === 0)).toBe(true)
  })

  it('hafta sayısı parametresi', () => {
    const w = scopeWeeks([], NOW, 3)
    expect(w.map((x) => x.weekStart)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28'])
  })

  it('hafta sınırı: Pazar 23:59 önceki haftaya, Pazartesi 00:00 yeni haftaya', () => {
    const w = scopeWeeks([task(at(9, 27, 23, 59)), task(at(9, 28, 0, 0))], NOW, 2)
    expect(w[0]!.added).toBe(1)
    expect(w[1]!.added).toBe(1)
  })

  it('pencere dışındaki eklemeler sayılmaz ama kalan sayısına girer', () => {
    const w = scopeWeeks([task(at(1, 5)), task(at(9, 15), at(9, 29))], NOW, 3)
    expect(w.map((x) => x.added)).toEqual([1, 0, 0])
    expect(w.map((x) => x.done)).toEqual([0, 0, 1])
    // Hafta sonlarında: eski görev hep açık; ikinci görev 14 Eylül haftasında eklendi, bu hafta bitti.
    expect(w.map((x) => x.remaining)).toEqual([2, 2, 1])
  })

  it('taşa bağlanmamış görev kalanda sayılmaz, bitişi yine sayılır', () => {
    const w = scopeWeeks([task(null, at(9, 29))], NOW, 1)
    expect(w[0]).toEqual({ weekStart: '2026-09-28', added: 0, done: 1, remaining: 0 })
  })

  it('bitiş anı tam hafta sonuna denk gelirse o hafta kalan değil', () => {
    const w = scopeWeeks([task(at(9, 16), at(9, 21, 0, 0))], NOW, 3)
    expect(w.map((x) => x.remaining)).toEqual([1, 0, 0])
    expect(w.map((x) => x.done)).toEqual([0, 1, 0])
  })

  it('aynı hafta eklenip biten görev', () => {
    const w = scopeWeeks([task(at(9, 28, 9), at(9, 29))], NOW, 1)
    expect(w[0]).toMatchObject({ added: 1, done: 1, remaining: 0 })
  })
})

describe('scopeTrend', () => {
  const many = (n: number, f: () => ScopeTask) => Array.from({ length: n }, f)

  it('boş: dengede değil kapanıyor (0 ≥ 0)', () => {
    expect(scopeTrend([], NOW)).toEqual({ added: 0, done: 0, state: 'closing' })
  })

  it('büyüyor: eklenen > biten × 1,5 ve eklenen ≥ 4', () => {
    const tasks = [...many(4, () => task(ago(2))), task(ago(20), ago(1))]
    expect(scopeTrend(tasks, NOW)).toEqual({ added: 4, done: 1, state: 'growing' })
  })

  it('eklenen 3 ise oran tutsa da büyümüyor → dengede', () => {
    expect(scopeTrend(many(3, () => task(ago(1))), NOW).state).toBe('balanced')
  })

  it('eklenen = biten × 1,5 tam sınırda büyümüyor', () => {
    const tasks = [...many(6, () => task(ago(3))), ...many(4, () => task(ago(30), ago(3)))]
    expect(scopeTrend(tasks, NOW)).toEqual({ added: 6, done: 4, state: 'balanced' })
  })

  it('biten ≥ eklenen → kapanıyor', () => {
    const tasks = [task(ago(3), ago(1)), task(ago(30), ago(2))]
    expect(scopeTrend(tasks, NOW)).toEqual({ added: 1, done: 2, state: 'closing' })
  })

  it('14 günlük pencere: tam 14 gün önce dışarıda, biraz sonrası içeride', () => {
    const tasks = [task(ago(14)), task(ago(14) + 1), task(NOW + 1)]
    expect(scopeTrend(tasks, NOW).added).toBe(1)
  })

  it('cümle', () => {
    expect(scopeSentence({ added: 14, done: 3 })).toBe('son 2 haftada 14 eklendi, 3 bitti')
  })
})

describe('median', () => {
  it('tek ve çift sayıda', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })
})

describe('estimateRatio', () => {
  const s = (estimateMin: number | null, actualMin: number) => ({ estimateMin, actualMin })

  it('5 örnekten az → 1,5', () => {
    expect(estimateRatio([])).toBe(FALLBACK_RATIO)
    expect(estimateRatio([s(10, 20), s(10, 20), s(10, 20), s(10, 20)])).toBe(1.5)
  })

  it('tahminsiz, sıfır tahminli ve gerçek süresi 0 olanlar sayılmaz', () => {
    const list = [s(null, 50), s(0, 30), s(30, 0), s(10, 10), s(10, 10), s(10, 10), s(10, 10)]
    expect(estimateRatio(list)).toBe(FALLBACK_RATIO)
    expect(estimateRatio([...list, s(10, 30)])).toBe(1)
  })

  it('tek sayıda örnekte medyan', () => {
    expect(estimateRatio([s(10, 10), s(10, 20), s(10, 30), s(10, 5), s(10, 40)])).toBe(2)
  })

  it('çift sayıda örnekte ortadaki ikisinin ortalaması', () => {
    const list = [s(10, 10), s(10, 20), s(10, 30), s(10, 5), s(10, 40), s(10, 15)]
    expect(estimateRatio(list)).toBe(1.75)
  })

  it('sadece son 20 örnek (girdi yeni önce)', () => {
    const recent = Array.from({ length: 20 }, () => s(10, 10))
    const old = Array.from({ length: 30 }, () => s(10, 50))
    expect(estimateRatio([...recent, ...old])).toBe(1)
  })
})

describe('realisticFinish', () => {
  const base = (over: Partial<FinishInput> = {}): FinishInput => ({
    openTasks: [{ estimateMin: 120 }, { estimateMin: null }],
    ratio: 1.5,
    workedMinutesLast14Days: 14 * 30,
    netFlow14: 2,
    today: '2026-09-30',
    targetDate: null,
    ...over,
  })

  it('kalan = (tahmin + süresiz 60) × oran; hız = 14 günün ortalaması; bitiş yukarı yuvarlanır', () => {
    const r = realisticFinish(base())
    expect(r.remainingMin).toBe((120 + DEFAULT_TASK_MIN) * 1.5)
    expect(r.dailyPace).toBe(30)
    expect(r.finishOn).toBe('2026-10-09') // 270 / 30 = 9 gün
    expect(r).toMatchObject({ notFinishing: false, late: false })
  })

  it('kesirli gün yukarı yuvarlanır ve ay sınırı geçilir', () => {
    const r = realisticFinish(base({ openTasks: [{ estimateMin: 61 }], ratio: 1 }))
    expect(r.finishOn).toBe('2026-10-03') // 61 / 30 → 3 gün
  })

  it('hız 0 → tahmin yok', () => {
    const r = realisticFinish(base({ workedMinutesLast14Days: 0 }))
    expect(r.finishOn).toBeNull()
    expect(r.dailyPace).toBe(0)
    expect(r.late).toBe(false)
  })

  it('açık görev yok → bugün biter, "bitmiyor" değil', () => {
    const r = realisticFinish(
      base({ openTasks: [], netFlow14: -3, workedMinutesLast14Days: 0, targetDate: '2026-09-01' }),
    )
    expect(r).toMatchObject({ remainingMin: 0, finishOn: '2026-09-30', notFinishing: false })
  })

  it('hedefi geçen tahmin geç; hedef günü bitmesi geç değil', () => {
    expect(realisticFinish(base({ targetDate: '2026-10-08' })).late).toBe(true)
    expect(realisticFinish(base({ targetDate: '2026-10-09' })).late).toBe(false)
  })

  it('net akış ≤ 0 → bu hızla bitmiyor; hedef varsa geç, yoksa değil', () => {
    const noTarget = realisticFinish(base({ netFlow14: 0 }))
    expect(noTarget).toMatchObject({ notFinishing: true, late: false })
    const withTarget = realisticFinish(base({ netFlow14: -1, targetDate: '2027-01-01' }))
    expect(withTarget).toMatchObject({ notFinishing: true, late: true })
  })
})
