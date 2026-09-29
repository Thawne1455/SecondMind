import { describe, expect, it } from 'vitest'
import {
  activeMilestone,
  matchesTitle,
  rankNextSteps,
  type NextStepMilestone,
  type NextStepsInput,
  type NextStepTask,
} from './nextSteps'

const DAY = 86_400_000
const NOW = new Date(2026, 8, 29, 12, 0)
const TODAY = '2026-09-29'

let seq = 0
const task = (over: Partial<NextStepTask> = {}): NextStepTask => ({
  id: `t${++seq}`,
  title: `Görev ${seq}`,
  type: 'task',
  severity: null,
  kanbanStatus: 'todo',
  milestoneId: null,
  playtestCount: 0,
  priority: 2,
  dueDate: null,
  plannedDate: null,
  postponeCount: 0,
  createdAt: new Date(2026, 8, 1),
  ...over,
})

const milestone = (over: Partial<NextStepMilestone> = {}): NextStepMilestone => ({
  id: 'm1',
  title: 'Demo',
  targetDate: null,
  doneAt: null,
  criteria: [],
  ...over,
})

const input = (over: Partial<NextStepsInput> = {}): NextStepsInput => ({
  tasks: [],
  milestones: [],
  lastSessionNextStep: '',
  pendingParkingCount: 0,
  oldestUncommittedAt: null,
  today: TODAY,
  ...over,
})

const one = (t: Partial<NextStepTask>, over: Partial<NextStepsInput> = {}) => {
  const steps = rankNextSteps(input({ tasks: [task(t)], ...over }), NOW)
  expect(steps).toHaveLength(1)
  const [s] = steps
  if (!s) throw new Error('adım yok')
  return s
}

describe('rankNextSteps', () => {
  it('boş girdi boş liste döner', () => {
    expect(rankNextSteps(input(), NOW)).toEqual([])
    expect(rankNextSteps(input({ lastSessionNextStep: '   ' }), NOW.getTime())).toEqual([])
  })

  it('terimsiz görev 0 puan, gerekçesiz', () => {
    const s = one({ id: 'x', title: 'Menü' })
    expect(s).toEqual({
      kind: 'task',
      id: 'x',
      title: 'Menü',
      taskId: 'x',
      score: 0,
      reasons: [],
      reason: '',
      suggestSplit: false,
    })
  })

  it('tamamlanmış görevler aday değil', () => {
    expect(rankNextSteps(input({ tasks: [task({ kanbanStatus: 'done' })] }), NOW)).toEqual([])
    // Kanban durumu olmayan (null) görev açıktır.
    expect(rankNextSteps(input({ tasks: [task({ kanbanStatus: null })] }), NOW)).toHaveLength(1)
  })

  describe('puan terimleri', () => {
    it('hata önem derecesi', () => {
      expect(one({ type: 'bug', severity: 'critical' })).toMatchObject({
        score: 50,
        reason: 'kritik hata',
      })
      expect(one({ type: 'bug', severity: 'major' })).toMatchObject({
        score: 20,
        reason: 'önemli hata',
      })
      expect(one({ type: 'bug', severity: 'minor' })).toMatchObject({
        score: 5,
        reason: 'küçük hata',
      })
      expect(one({ type: 'bug', severity: null }).score).toBe(0)
      // Hata olmayan türde önem derecesi sayılmaz.
      expect(one({ type: 'task', severity: 'critical' }).score).toBe(0)
    })

    it('playtest: kişi başı 8, tavan 40', () => {
      expect(one({ playtestCount: 3 })).toMatchObject({ score: 24, reason: '3 test eden bildirdi' })
      expect(one({ playtestCount: 5 }).score).toBe(40)
      expect(one({ playtestCount: 9 })).toMatchObject({ score: 40, reason: '9 test eden bildirdi' })
      expect(one({ playtestCount: 0 }).reasons).toEqual([])
    })

    it('kanban: yapılıyor +15, test +8', () => {
      expect(one({ kanbanStatus: 'doing' })).toMatchObject({ score: 15, reason: 'yarım duruyor' })
      expect(one({ kanbanStatus: 'testing' })).toMatchObject({ score: 8, reason: 'test bekliyor' })
    })

    it('öncelik: yüksek +10, düşük −5, normal 0', () => {
      expect(one({ priority: 3 })).toMatchObject({ score: 10, reason: 'yüksek öncelik' })
      expect(one({ priority: 1 })).toMatchObject({ score: -5, reason: 'düşük öncelik' })
      expect(one({ priority: 2 }).reasons).toEqual([])
    })

    it('erteleme ≥ 3: −10 ve Böl işareti', () => {
      expect(one({ postponeCount: 2 })).toMatchObject({ score: 0, suggestSplit: false })
      expect(one({ postponeCount: 3 })).toMatchObject({
        score: -10,
        suggestSplit: true,
        reason: '3 kez ertelendi, bölmeyi düşün',
      })
      expect(one({ postponeCount: 5 }).reason).toBe('5 kez ertelendi, bölmeyi düşün')
    })

    it('aktif taşın kriterine bağlı görev +20', () => {
      const m = milestone({
        criteria: [{ id: 'c1', text: 'Menü çalışır', done: false, taskId: 'bound' }],
      })
      const steps = rankNextSteps(input({ tasks: [task({ id: 'bound' })], milestones: [m] }), NOW)
      expect(steps).toHaveLength(1)
      expect(steps[0]).toMatchObject({
        id: 'bound',
        score: 20,
        reason: 'Demo taşının çıkış kriteri',
      })
    })

    it('işaretlenmiş kritere bağlı görev puan almaz', () => {
      const m = milestone({
        criteria: [{ id: 'c1', text: 'Menü çalışır', done: true, taskId: 'bound' }],
      })
      expect(one({ id: 'bound' }, { milestones: [m] }).score).toBe(0)
    })

    it('aktif taşa bağlı görev: +(21 − g), g ≤ 21', () => {
      const m = (targetDate: string) => [milestone({ targetDate })]
      expect(one({ milestoneId: 'm1' }, { milestones: m('2026-10-11') })).toMatchObject({
        score: 9,
        reason: '12 gün kaldı',
      })
      expect(one({ milestoneId: 'm1' }, { milestones: m('2026-10-19') })).toMatchObject({
        score: 1,
        reason: '20 gün kaldı',
      })
      // g = 21: katkı 0, gerekçe yok. g > 21: terim yok.
      expect(one({ milestoneId: 'm1' }, { milestones: m('2026-10-20') }).reasons).toEqual([])
      expect(one({ milestoneId: 'm1' }, { milestones: m('2026-12-01') }).score).toBe(0)
      expect(one({ milestoneId: 'm1' }, { milestones: m(TODAY) })).toMatchObject({
        score: 21,
        reason: 'hedef tarihi bugün',
      })
      expect(one({ milestoneId: 'm1' }, { milestones: m('2026-09-20') })).toMatchObject({
        score: 21,
        reason: 'hedef tarihi geçti',
      })
    })

    it('başka taşa bağlı ya da tarihsiz taş gün puanı vermez', () => {
      const ms = [
        milestone({ targetDate: '2026-10-01' }),
        milestone({ id: 'm2', targetDate: '2026-10-05' }),
      ]
      expect(one({ milestoneId: 'm2' }, { milestones: ms }).score).toBe(0)
      expect(one({ milestoneId: 'm1' }, { milestones: [milestone()] }).score).toBe(0)
    })

    it('terimler toplanır', () => {
      const s = one({
        type: 'bug',
        severity: 'critical',
        playtestCount: 2,
        kanbanStatus: 'doing',
        priority: 3,
        postponeCount: 4,
      })
      expect(s.score).toBe(50 + 16 + 15 + 10 - 10)
      expect(s.suggestSplit).toBe(true)
    })
  })

  describe('gerekçe', () => {
    it('en çok katkı veren en fazla 3 terim, çoktan aza, " · " ile', () => {
      const s = one({
        type: 'bug',
        severity: 'major',
        playtestCount: 5,
        kanbanStatus: 'doing',
        priority: 3,
      })
      expect(s.reasons).toEqual(['5 test eden bildirdi', 'önemli hata', 'yarım duruyor'])
      expect(s.reason).toBe('5 test eden bildirdi · önemli hata · yarım duruyor')
    })

    it('eksi terimler mutlak katkıya göre sıralanır', () => {
      const s = one({ priority: 1, postponeCount: 3, kanbanStatus: 'testing' })
      expect(s.score).toBe(-7)
      expect(s.reasons).toEqual([
        '3 kez ertelendi, bölmeyi düşün',
        'test bekliyor',
        'düşük öncelik',
      ])
    })

    it('eşit katkıda tablo sırası korunur', () => {
      const m = milestone({ criteria: [{ id: 'c', text: 'x', done: false, taskId: 'a' }] })
      const s = one({ id: 'a', type: 'bug', severity: 'major', priority: 3 }, { milestones: [m] })
      expect(s.reasons).toEqual(['önemli hata', 'Demo taşının çıkış kriteri', 'yüksek öncelik'])
    })
  })

  describe('son oturumun sıradaki adımı', () => {
    it('göreve eşleşmezse kendi adayı olur (+35)', () => {
      const steps = rankNextSteps(input({ lastSessionNextStep: '  Boss müziğini hızlandır ' }), NOW)
      expect(steps).toEqual([
        {
          kind: 'session',
          id: 'session',
          title: 'Boss müziğini hızlandır',
          score: 35,
          reasons: ['son oturumda buradan devam edecektin'],
          reason: 'son oturumda buradan devam edecektin',
          suggestSplit: false,
        },
      ])
    })

    it('başlığı aynı olan görevle birleşir (büyük/küçük harf tr-TR)', () => {
      const steps = rankNextSteps(
        input({
          tasks: [task({ id: 'a', title: 'İNCE AYAR yap', priority: 3 })],
          lastSessionNextStep: 'ince ayar yap',
        }),
        NOW,
      )
      expect(steps).toHaveLength(1)
      expect(steps[0]).toMatchObject({
        kind: 'task',
        id: 'a',
        score: 45,
        reasons: ['son oturumda buradan devam edecektin', 'yüksek öncelik'],
      })
    })

    it('≥ 8 harfte biri diğerini içerirse birleşir', () => {
      const steps = rankNextSteps(
        input({
          tasks: [task({ id: 'a', title: 'Boss müziği' })],
          lastSessionNextStep: 'Boss müziğini hızlandır',
        }),
        NOW,
      )
      // "boss müziği" (11 harf) metnin içinde geçiyor.
      expect(steps.map((s) => [s.id, s.score])).toEqual([['a', 35]])
    })

    it('kısa metinde içerme eşleşmesi yok', () => {
      expect(matchesTitle('Menü', 'Menü ekranını bitir')).toBeNull()
      expect(matchesTitle('menü', 'MENÜ')).toBe('exact')
      expect(matchesTitle('ekranını', 'Menü ekranını bitir')).toBe('contains')
      expect(matchesTitle('', 'x')).toBeNull()
    })

    it('tam eşleşme içerme eşleşmesinden önce gelir; tamamlanmış görevle birleşmez', () => {
      const steps = rankNextSteps(
        input({
          tasks: [
            task({ id: 'contains', title: 'Envanter ekranı ve menü' }),
            task({ id: 'exact', title: 'Envanter ekranı' }),
            task({ id: 'done', title: 'Envanter ekranı', kanbanStatus: 'done' }),
          ],
          lastSessionNextStep: 'envanter ekranı',
        }),
        NOW,
      )
      expect(steps[0]).toMatchObject({ id: 'exact', score: 35 })
      expect(steps.find((s) => s.id === 'contains')?.score).toBe(0)
      expect(steps.some((s) => s.kind === 'session')).toBe(false)
    })
  })

  describe('aktif taş ve çıkış kriterleri', () => {
    it('aktif taş: tamamlanmamış, hedefi en yakın, tarihsiz sona', () => {
      expect(activeMilestone([])).toBeNull()
      const a = milestone({ id: 'a', targetDate: null })
      const b = milestone({ id: 'b', targetDate: '2026-11-01' })
      const c = milestone({ id: 'c', targetDate: '2026-10-01', doneAt: 1 })
      const d = milestone({ id: 'd', targetDate: '2026-10-15' })
      expect(activeMilestone([a, b, c, d])?.id).toBe('d')
      expect(activeMilestone([a, c])?.id).toBe('a')
      expect(activeMilestone([c])).toBeNull()
    })

    it('bağlı görevi olmayan işaretlenmemiş kriterler aday olur (+20 ve gün terimi)', () => {
      const m = milestone({
        title: 'Demo',
        targetDate: '2026-10-11',
        criteria: [
          { id: 'c1', text: 'Menü çalışır', done: false, taskId: null },
          { id: 'c2', text: 'Kayıt çalışır', done: true, taskId: null },
          { id: 'c3', text: 'Boss bitti', done: false, taskId: 'missing' },
          { id: 'c4', text: 'Ses ayarı', done: false, taskId: null },
        ],
      })
      const steps = rankNextSteps(input({ milestones: [m] }), NOW)
      expect(steps).toEqual([
        {
          kind: 'criterion',
          id: 'c1',
          title: 'Menü çalışır',
          score: 29,
          reasons: ['Demo taşının çıkış kriteri', '12 gün kaldı'],
          reason: 'Demo taşının çıkış kriteri · 12 gün kaldı',
          suggestSplit: false,
        },
        expect.objectContaining({ id: 'c4', score: 29 }),
      ])
    })

    it('yalnızca aktif taşın kriterleri', () => {
      const ms = [
        milestone({
          id: 'late',
          targetDate: '2027-01-01',
          criteria: [{ id: 'x', text: 'x', done: false, taskId: null }],
        }),
        milestone({
          id: 'soon',
          title: 'Alfa',
          targetDate: '2026-12-01',
          criteria: [{ id: 'y', text: 'y', done: false, taskId: null }],
        }),
      ]
      const steps = rankNextSteps(input({ milestones: ms }), NOW)
      expect(steps.map((s) => [s.id, s.reason])).toEqual([['y', 'Alfa taşının çıkış kriteri']])
    })
  })

  describe('park ve commit adımları', () => {
    it("park: bekleyen 10'u geçerse", () => {
      expect(rankNextSteps(input({ pendingParkingCount: 10 }), NOW)).toEqual([])
      expect(rankNextSteps(input({ pendingParkingCount: 11 }), NOW)).toEqual([
        {
          kind: 'parking',
          id: 'parking',
          title: 'Park alanını gözden geçir',
          score: 10,
          reasons: ['11 bekleyen park öğesi'],
          reason: '11 bekleyen park öğesi',
          suggestSplit: false,
        },
      ])
    })

    it('commit: 3 günden eski değişiklik varsa', () => {
      const at = (ms: number) => input({ oldestUncommittedAt: NOW.getTime() - ms })
      expect(rankNextSteps(at(3 * DAY), NOW)).toEqual([])
      expect(rankNextSteps(input({ oldestUncommittedAt: null }), NOW)).toEqual([])
      const steps = rankNextSteps(at(5 * DAY), NOW.getTime())
      expect(steps).toEqual([
        {
          kind: 'commit',
          id: 'commit',
          title: "Commit'lenmemiş değişiklikleri commit'le",
          score: 12,
          reasons: ["5 gündür commit'lenmemiş"],
          reason: "5 gündür commit'lenmemiş",
          suggestSplit: false,
        },
      ])
    })
  })

  describe('sıralama', () => {
    it('puana göre azalan', () => {
      const steps = rankNextSteps(
        input({
          tasks: [
            task({ id: 'low', priority: 1 }),
            task({ id: 'bug', type: 'bug', severity: 'critical' }),
            task({ id: 'doing', kanbanStatus: 'doing' }),
          ],
          lastSessionNextStep: 'Serbest bir adım metni',
          pendingParkingCount: 20,
          oldestUncommittedAt: NOW.getTime() - 10 * DAY,
        }),
        NOW,
      )
      expect(steps.map((s) => s.id)).toEqual([
        'bug',
        'session',
        'doing',
        'commit',
        'parking',
        'low',
      ])
    })

    it('eşit puanlı görevlerde compareTasks sırası', () => {
      const steps = rankNextSteps(
        input({
          tasks: [
            task({ id: 'plain' }),
            task({ id: 'due', dueDate: '2026-10-02' }),
            task({ id: 'today', plannedDate: TODAY }),
            task({ id: 'older', createdAt: new Date(2026, 7, 1) }),
          ],
        }),
        NOW,
      )
      expect(steps.map((s) => s.id)).toEqual(['today', 'due', 'older', 'plain'])
    })

    it('eşit puanda görevler görev olmayan adımlardan önce', () => {
      // Park 10 puan; yüksek öncelikli görev de 10.
      const steps = rankNextSteps(
        input({ tasks: [task({ id: 'hi', priority: 3 })], pendingParkingCount: 12 }),
        NOW,
      )
      expect(steps.map((s) => [s.id, s.score])).toEqual([
        ['hi', 10],
        ['parking', 10],
      ])
    })

    it('eşit puanlı görev olmayan adımlar: oturum, kriter, commit, park', () => {
      const m = milestone({
        targetDate: '2026-10-05', // 6 gün: kriter 20 + 15 = 35, oturum adımıyla eşit
        criteria: [{ id: 'c', text: 'Kriter', done: false, taskId: null }],
      })
      const steps = rankNextSteps(input({ milestones: [m], lastSessionNextStep: 'kısa' }), NOW)
      expect(steps.map((s) => [s.kind, s.score])).toEqual([
        ['session', 35],
        ['criterion', 35],
      ])
    })
  })
})
