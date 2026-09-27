import { describe, expect, it } from 'vitest'
import {
  compareIdeas,
  ideaStage,
  incubationDaysLeft,
  incubationEnd,
  pickDueIdea,
  pickNextIncubating,
  pickRadarIdea,
  silentDays,
  type IdeaTimes,
} from './incubation'

// Yerel saatle: testler saat diliminden bağımsız olsun diye Date(yıl, ay, gün, saat).
const d = (day: number, hour = 12, month = 8) => new Date(2026, month, day, hour)

type Idea = IdeaTimes & { id: string; updatedAt: Date }

function idea(id: string, over: Partial<Idea> = {}): Idea {
  const createdAt = over.createdAt ?? d(1)
  return {
    id,
    status: 'incubating',
    createdAt,
    updatedAt: createdAt,
    incubateUntil: incubationEnd(createdAt),
    decidedAt: null,
    lastOpenedAt: null,
    ...over,
  }
}

describe('incubationEnd', () => {
  it('14 gün sonraki günün başı', () => {
    expect(incubationEnd(d(1, 23))).toEqual(new Date(2026, 8, 15, 0, 0, 0, 0))
    expect(incubationEnd(d(1, 0))).toEqual(new Date(2026, 8, 15))
  })

  it('ay sınırını geçer', () => {
    expect(incubationEnd(d(25))).toEqual(new Date(2026, 9, 9))
  })
})

describe('ideaStage ve kalan gün', () => {
  const i = idea('a', { createdAt: d(1, 15) })

  it('kuluçka boyunca gün sayar, son gün 1 kalır', () => {
    expect(ideaStage(i, d(1, 16))).toBe('incubating')
    expect(incubationDaysLeft(i.incubateUntil, d(1, 16))).toBe(14)
    expect(incubationDaysLeft(i.incubateUntil, d(14, 23))).toBe(1)
    expect(ideaStage(i, d(14, 23))).toBe('incubating')
  })

  it('gece yarısı dolar; dolduktan sonra kalan 0', () => {
    expect(ideaStage(i, new Date(2026, 8, 15, 0, 0))).toBe('due')
    expect(incubationDaysLeft(i.incubateUntil, d(20))).toBe(0)
  })

  it('kuluçka dışındaki durumlar zamandan etkilenmez', () => {
    expect(ideaStage({ ...i, status: 'archived' }, d(30))).toBe('archived')
    expect(ideaStage({ ...i, status: 'active' }, d(2))).toBe('active')
  })
})

describe('pickDueIdea', () => {
  it('en eski dolanı seçer, gecikmeyi ve toplamı verir', () => {
    const ideas = [
      idea('yeni', { createdAt: d(10) }),
      idea('eski', { createdAt: d(1, 12, 7) }),
      idea('orta', { createdAt: d(5, 12, 7) }),
      idea('arsiv', { createdAt: d(1, 12, 6), status: 'archived' }),
    ]
    const now = d(20)
    const due = pickDueIdea(ideas, now)
    expect(due?.idea.id).toBe('eski')
    expect(due?.count).toBe(2)
    // 1 Ağustos + 14 = 15 Ağustos; 20 Eylül'e 36 gün.
    expect(due?.overdueDays).toBe(36)
  })

  it('dolan yoksa null', () => {
    expect(pickDueIdea([idea('a', { createdAt: d(10) })], d(12))).toBeNull()
  })
})

describe('pickNextIncubating', () => {
  it('en yakın biteni ve kalan günü verir', () => {
    const next = pickNextIncubating(
      [idea('a', { createdAt: d(10) }), idea('b', { createdAt: d(5) })],
      d(12),
    )
    expect(next?.idea.id).toBe('b')
    expect(next?.daysLeft).toBe(7)
  })
})

describe('radar', () => {
  const now = d(30)

  it('son temas en yeni tarihtir', () => {
    const i = idea('a', {
      status: 'active',
      createdAt: d(1, 12, 5),
      decidedAt: d(1, 12, 6),
      lastOpenedAt: d(20, 12, 7),
    })
    expect(silentDays(i, now)).toBe(41)
  })

  it('30 gün ve üstü sessiz aktif fikirlerden en sessizini seçer', () => {
    const ideas = [
      idea('sinirda', { status: 'active', createdAt: d(31, 12, 7) }), // tam 30 gün
      idea('en-sessiz', { status: 'active', createdAt: d(1, 12, 5) }),
      idea('yeni-acildi', { status: 'active', createdAt: d(1, 12, 5), lastOpenedAt: d(29) }),
      idea('arsiv', { status: 'archived', createdAt: d(1, 12, 3) }),
      idea('kulucka', { createdAt: d(1, 12, 3) }),
    ]
    expect(pickRadarIdea(ideas, now)?.idea.id).toBe('en-sessiz')
    expect(pickRadarIdea([ideas[0]!], now)).toEqual({ idea: ideas[0], silentDays: 30 })
    expect(pickRadarIdea(ideas.slice(2), now)).toBeNull()
  })
})

describe('compareIdeas', () => {
  it('karar bekleyen > kuluçka > aktif > arşiv', () => {
    const now = d(20)
    const ideas = [
      idea('arsiv', { status: 'archived' }),
      idea('aktif-eski', { status: 'active', updatedAt: d(2) }),
      idea('kulucka-gec', { createdAt: d(19) }),
      idea('aktif-yeni', { status: 'active', updatedAt: d(18) }),
      idea('due', { createdAt: d(1) }),
      idea('kulucka-erken', { createdAt: d(10) }),
    ]
    expect(ideas.sort(compareIdeas(now)).map((i) => i.id)).toEqual([
      'due',
      'kulucka-erken',
      'kulucka-gec',
      'aktif-yeni',
      'aktif-eski',
      'arsiv',
    ])
  })
})
