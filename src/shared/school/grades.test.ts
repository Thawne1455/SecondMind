import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LETTER_TABLE,
  gpa,
  letterFor,
  letterPoints,
  projectedScore,
  requiredScores,
  weightedScore,
} from './grades'

const comps = (vize: number | null, odev: number | null, final: number | null) => [
  { id: 'vize', weight: 30, score: vize },
  { id: 'odev', weight: 20, score: odev },
  { id: 'final', weight: 50, score: final },
]

describe('letterFor', () => {
  it('eşik dahil en yüksek harf', () => {
    expect(letterFor(90).letter).toBe('AA')
    expect(letterFor(89.9).letter).toBe('BA')
    expect(letterFor(80).letter).toBe('BB')
    expect(letterFor(50).letter).toBe('FD')
    expect(letterFor(49.9).letter).toBe('FF')
    expect(letterFor(0).letter).toBe('FF')
  })
  it('sırasız ve özel tablo', () => {
    const table = [
      { letter: 'F', min: 0, points: 0 },
      { letter: 'A', min: 70, points: 4 },
      { letter: 'C', min: 40, points: 2 },
    ]
    expect(letterFor(69, table).letter).toBe('C')
    expect(letterFor(10, table).letter).toBe('F')
  })
  it('katsayı', () => {
    expect(letterPoints('CB')).toBe(2.5)
    expect(letterPoints('XX')).toBeNull()
  })
})

describe('weightedScore', () => {
  it('hiç not yok', () => {
    expect(weightedScore(comps(null, null, null))).toEqual({
      earned: 0,
      completedWeight: 0,
      totalWeight: 100,
      current: null,
    })
  })
  it('kısmi: gidişat girilenlerin ağırlıklı ortalaması', () => {
    const w = weightedScore(comps(70, 90, null))
    expect(w.completedWeight).toBe(50)
    expect(w.earned).toBe(39) // (30·70 + 20·90) / 100
    expect(w.current).toBe(78) // 3900 / 50
  })
  it('toplam 100 değilse toplama göre ölçeklenir', () => {
    const w = weightedScore([
      { id: 'a', weight: 40, score: 50 },
      { id: 'b', weight: 40, score: 100 },
    ])
    expect(w.totalWeight).toBe(80)
    expect(w.earned).toBe(75)
  })
})

describe('requiredScores', () => {
  it('finalde gereken en düşük puan', () => {
    // BB = 80: 3900 + 50x ≥ 8000 → x ≥ 82
    expect(requiredScores(comps(70, 90, null), 'BB')).toEqual({
      status: 'needs',
      min: 82,
      remaining: ['final'],
    })
  })
  it('birden çok kalan bileşen aynı puanı ister', () => {
    // CC = 70: 2100 + 70x ≥ 7000 → x ≥ 70
    const r = requiredScores(comps(70, null, null), 'CC')
    expect(r).toEqual({ status: 'needs', min: 70, remaining: ['odev', 'final'] })
  })
  it('imkânsız: en iyi ihtimal', () => {
    const r = requiredScores(comps(10, 10, null), 'AA')
    expect(r.status).toBe('impossible')
    if (r.status === 'impossible') {
      expect(r.best).toBe(55)
      expect(r.bestLetter).toBe('FD')
    }
  })
  it('garanti', () => {
    expect(requiredScores(comps(100, 100, null), 'FD').status).toBe('secured')
  })
  it('tam eşik kayan noktada yukarı taşmaz', () => {
    // DD = 60: 30·60 + 20·60 + 50x ≥ 6000 → x ≥ 60
    expect(requiredScores(comps(60, 60, null), 'DD')).toMatchObject({ min: 60 })
  })
  it('hepsi girilmiş: sonuç', () => {
    expect(requiredScores(comps(70, 90, 82), 'BB')).toEqual({
      status: 'final',
      score: 80,
      letter: 'BB',
      reached: true,
    })
  })
})

describe('projectedScore', () => {
  it('kaydırıcı senaryosu', () => {
    expect(projectedScore(comps(70, 90, null), { final: 60 })).toBe(69)
    expect(projectedScore(comps(null, null, null), {})).toBeNull()
  })
})

describe('gpa', () => {
  it('kredi ağırlıklı ortalama', () => {
    expect(
      gpa([
        { key: 'MAT101', credit: 6, points: 4, order: 1 },
        { key: 'FIZ101', credit: 4, points: 2, order: 1 },
      ]),
    ).toEqual({ gpa: 3.2, credits: 10 })
  })
  it('tekrar alınan derste son not geçerli; harfsiz ders girmez', () => {
    expect(
      gpa([
        { key: 'MAT101', credit: 6, points: 0, order: 1 },
        { key: 'mat101', credit: 6, points: 3, order: 2 },
        { key: 'BIL101', credit: 5, points: null, order: 2 },
      ]),
    ).toEqual({ gpa: 3, credits: 6 })
  })
  it('boş', () => {
    expect(gpa([])).toEqual({ gpa: null, credits: 0 })
    expect(DEFAULT_LETTER_TABLE).toHaveLength(9)
  })
})
