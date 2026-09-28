import { describe, expect, it } from 'vitest'
import {
  clampMove,
  freeGaps,
  needsRollover,
  planDay,
  routineIntervals,
  sumGaps,
  type Block,
  type PlanInput,
  type SchedTask,
} from './scheduler'

const TODAY = '2026-09-28' // Pazartesi
const h = (clock: string) => {
  const [hh, mm] = clock.split(':').map(Number) as [number, number]
  return hh * 60 + mm
}

const task = (id: string, over: Partial<SchedTask> = {}): SchedTask => ({
  id,
  priority: 2,
  dueDate: null,
  plannedDate: TODAY,
  postponeCount: 0,
  createdAt: new Date(2026, 8, 1),
  status: 'open',
  estimateMin: 60,
  completedMin: null,
  ...over,
})

const block = (sourceId: string, start: string, end: string, over: Partial<Block> = {}): Block => ({
  id: `b-${sourceId}`,
  kind: 'task',
  sourceId,
  start: h(start),
  end: h(end),
  pinned: false,
  ...over,
})

const plan = (over: Partial<PlanInput>) =>
  planDay({
    today: TODAY,
    nowMin: h('08:00'),
    routines: [],
    tasks: [],
    existing: [],
    mode: 'fill',
    ...over,
  })

const spans = (blocks: Block[]) =>
  blocks.map(
    (b) =>
      `${b.sourceId} ${Math.floor(b.start / 60)}:${String(b.start % 60).padStart(2, '0')}-${Math.floor(b.end / 60)}:${String(b.end % 60).padStart(2, '0')}`,
  )

describe('rutinler', () => {
  const routines = [
    { id: 'walk', days: [1, 3], startTime: '19:00', durationMin: 30, active: true },
    { id: 'gym', days: [2], startTime: '10:00', durationMin: 60, active: true },
    { id: 'off', days: [1], startTime: '12:00', durationMin: 30, active: false },
    { id: 'early', days: [1], startTime: '07:30', durationMin: 60, active: true },
    { id: 'night', days: [1], startTime: '06:00', durationMin: 30, active: true },
  ]
  it('sadece o günün aktif rutinleri, 08–24 içine kırpılmış', () => {
    expect(spans(routineIntervals(routines, new Date(2026, 8, 28)))).toEqual([
      'early 8:00-8:30',
      'walk 19:00-19:30',
    ])
  })
})

describe('boşluklar', () => {
  it('şimdiden başlar, blokların iki yanında 10 dk tampon bırakır', () => {
    const gaps = freeGaps([{ start: h('10:00'), end: h('11:00') }], h('09:02'))
    expect(gaps).toEqual([
      { start: h('09:05'), end: h('09:50') },
      { start: h('11:10'), end: h('24:00') },
    ])
    expect(sumGaps(gaps)).toBe(45 + 12 * 60 + 50)
  })
  it('gün başından önce 08:00, gün bitince boşluk yok', () => {
    expect(freeGaps([], h('06:00'))[0]!.start).toBe(h('08:00'))
    expect(freeGaps([], h('24:00'))).toEqual([])
  })
})

describe('yerleştirme', () => {
  it('rutinlerin etrafına sırayla, tamponla; süresiz göreve 30 dk', () => {
    const r = plan({
      nowMin: h('09:00'),
      routines: [
        { kind: 'routine', sourceId: 'walk', start: h('10:00'), end: h('10:30'), pinned: false },
      ],
      tasks: [
        task('b', { estimateMin: null }),
        task('a', { dueDate: '2026-09-29', estimateMin: 45 }),
        task('c', { priority: 3 }),
      ],
    })
    // Sıra: son tarihli a, yüksek öncelikli c, sonra b. a 09:00–09:45 sığar (10:00 rutinine 15 dk kalır).
    expect(spans(r.blocks)).toEqual([
      'a 9:00-9:45',
      'walk 10:00-10:30',
      'c 10:40-11:40',
      'b 11:50-12:20',
    ])
    expect(r.unplaced).toEqual([])
  })

  it('geçmiş saatlere yerleştirmez; sığmayan "sığmadı" listesine düşer', () => {
    const r = plan({
      nowMin: h('22:03'),
      tasks: [task('long', { estimateMin: 180 }), task('short', { estimateMin: 30 })],
    })
    expect(spans(r.blocks)).toEqual(['short 22:05-22:35'])
    expect(r.unplaced).toEqual(['long'])
  })

  it('bugüne alınmamış ve bitmiş görevler yerleşmez', () => {
    const r = plan({
      tasks: [
        task('later', { plannedDate: '2026-09-30' }),
        task('none', { plannedDate: null }),
        task('done', { status: 'done' }),
      ],
    })
    expect(r.blocks).toEqual([])
  })

  it('geçmişte planlanmış (kaydırılmamış) görev de bugüne sayılır', () => {
    expect(spans(plan({ tasks: [task('old', { plannedDate: '2026-09-20' })] }).blocks)).toEqual([
      'old 8:00-9:00',
    ])
  })
})

describe('kayıtlı yerleşim (fill)', () => {
  it('kayıtlı bloklar yerinde kalır, yeni görev boşluğa girer', () => {
    const r = plan({
      nowMin: h('09:00'),
      tasks: [task('a'), task('new', { dueDate: '2026-09-28' })],
      existing: [block('a', '13:00', '14:00')],
    })
    expect(spans(r.blocks)).toEqual(['new 9:00-10:00', 'a 13:00-14:00'])
    expect(r.blocks[1]!.id).toBe('b-a')
  })

  it('süresi değişen başlamamış blok yeniden yerleşir', () => {
    const r = plan({
      nowMin: h('09:00'),
      tasks: [task('a', { estimateMin: 90 })],
      existing: [block('a', '13:00', '14:00')],
    })
    expect(spans(r.blocks)).toEqual(['a 9:00-10:30'])
  })

  it('kaçırılmış blok kendiliğinden kaymaz', () => {
    const r = plan({
      nowMin: h('15:00'),
      tasks: [task('a')],
      existing: [block('a', '13:00', '14:00')],
    })
    expect(spans(r.blocks)).toEqual(['a 13:00-14:00'])
  })

  it('rutin saati değişip çakışırsa sabitlenmemiş blok kayar, sabitlenen kalır', () => {
    const r = plan({
      nowMin: h('09:00'),
      routines: [
        { kind: 'routine', sourceId: 'w', start: h('13:00'), end: h('13:30'), pinned: false },
      ],
      tasks: [task('a'), task('p')],
      existing: [block('a', '13:00', '14:00'), block('p', '13:15', '14:15', { pinned: true })],
    })
    expect(spans(r.blocks)).toEqual(['a 9:00-10:00', 'w 13:00-13:30', 'p 13:15-14:15'])
  })

  it('bitmiş görevin başlamamış bloğu kalkar, sürerken biteninki bitiş anında kesilir', () => {
    const r = plan({
      nowMin: h('13:20'),
      tasks: [
        task('early', { status: 'done', completedMin: h('13:12') }),
        task('future', { status: 'done', completedMin: h('13:00') }),
      ],
      existing: [block('early', '13:00', '14:00'), block('future', '15:00', '16:00')],
    })
    expect(spans(r.blocks)).toEqual(['early 13:00-13:12'])
  })

  it('silinmiş ya da ileri güne alınmış görevin bloğu kalkar', () => {
    const r = plan({
      tasks: [task('moved', { plannedDate: '2026-10-01' })],
      existing: [block('moved', '13:00', '14:00'), block('gone', '15:00', '16:00')],
    })
    expect(r.blocks).toEqual([])
  })
})

describe('yeniden yerleştirme (replace)', () => {
  it('sabitlenmiş ve süren bloklara dokunmaz; kaçırılmış ve başlamamışları öne alır', () => {
    const r = plan({
      mode: 'replace',
      nowMin: h('13:30'),
      tasks: [task('missed'), task('current'), task('pinned'), task('late', { priority: 3 })],
      existing: [
        block('missed', '09:00', '10:00'),
        block('current', '13:00', '14:00'),
        block('pinned', '16:00', '17:00', { pinned: true }),
        block('late', '20:00', '21:00'),
      ],
    })
    expect(spans(r.blocks)).toEqual([
      'current 13:00-14:00',
      'late 14:10-15:10',
      'pinned 16:00-17:00',
      'missed 17:10-18:10',
    ])
    expect(r.blocks.find((b) => b.sourceId === 'pinned')!.pinned).toBe(true)
  })

  it('sabitlenmiş bloğun süresi görevin güncel süresine uyar, başlangıcı değişmez', () => {
    const r = plan({
      mode: 'replace',
      tasks: [task('p', { estimateMin: 30 })],
      existing: [block('p', '16:00', '17:00', { pinned: true })],
    })
    expect(spans(r.blocks)).toEqual(['p 16:00-16:30'])
  })
})

describe('elle taşıma', () => {
  it('5 dk adıma oturur, süre korunur', () => {
    expect(clampMove(h('14:07'), 60, h('09:00'))).toEqual({ start: h('14:05'), end: h('15:05') })
  })
  it('geçmişe ve gün dışına çıkmaz', () => {
    expect(clampMove(h('10:00'), 60, h('13:42'))).toEqual({ start: h('13:40'), end: h('14:40') })
    expect(clampMove(h('23:30'), 60, h('09:00'))).toEqual({ start: h('23:00'), end: h('24:00') })
    expect(clampMove(h('06:00'), 30, h('05:00')).start).toBe(h('08:00'))
  })
})

describe('gün sonu kaydırma', () => {
  it('sadece geçmiş güne planlanmış açık görevler', () => {
    expect(needsRollover(task('a', { plannedDate: '2026-09-27' }), TODAY)).toBe(true)
    expect(needsRollover(task('a', { plannedDate: TODAY }), TODAY)).toBe(false)
    expect(needsRollover(task('a', { plannedDate: null }), TODAY)).toBe(false)
    expect(needsRollover(task('a', { plannedDate: '2026-09-27', status: 'done' }), TODAY)).toBe(
      false,
    )
  })
})
