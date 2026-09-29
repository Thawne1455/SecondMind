import { describe, expect, it } from 'vitest'
import {
  daysLeftText,
  formatLetterTable,
  formatScore,
  formatSlots,
  guessTermName,
  parseLetterTable,
  parseSlots,
  parseWeekday,
  requiredText,
  toComponents,
} from './schoolText'

describe('parseWeekday', () => {
  it('kısa, uzun, büyük harf ve tek anlamlı önek', () => {
    expect(parseWeekday('pzt')).toBe(1)
    expect(parseWeekday('ÇARŞAMBA')).toBe(3)
    expect(parseWeekday('Perş')).toBe(4)
    expect(parseWeekday('cumar')).toBe(6)
    expect(parseWeekday('cum')).toBe(5)
    expect(parseWeekday('xyz')).toBeNull()
  })
})

describe('parseSlots', () => {
  it('program yazımı', () => {
    expect(parseSlots('Pzt 09:00-10:50 D-201, Çar 13-14.50; Cuma 9 – 12 Lab 3')).toEqual({
      slots: [
        { weekday: 1, startMin: 540, endMin: 650, room: 'D-201' },
        { weekday: 3, startMin: 780, endMin: 890, room: '' },
        { weekday: 5, startMin: 540, endMin: 720, room: 'Lab 3' },
      ],
      errors: [],
    })
  })
  it('hatalı parçalar', () => {
    const r = parseSlots('Pzt 11-10, Blah 9-10, Sal 9:00-10:00')
    expect(r.slots).toHaveLength(1)
    expect(r.errors).toEqual(['Pzt 11-10', 'Blah 9-10'])
  })
  it('geri yazım', () => {
    expect(
      formatSlots([
        { weekday: 3, startMin: 780, endMin: 890, room: '' },
        { weekday: 1, startMin: 540, endMin: 650, room: 'D-201' },
      ]),
    ).toBe('Pzt 09:00-10:50 D-201, Çar 13:00-14:50')
  })
})

describe('metinler', () => {
  it('dönem adı tahmini', () => {
    expect(guessTermName(new Date(2026, 8, 21))).toBe('2026-2027 Güz')
    expect(guessTermName(new Date(2027, 0, 5))).toBe('2026-2027 Güz')
    expect(guessTermName(new Date(2027, 1, 16))).toBe('2026-2027 Bahar')
  })
  it('geri sayım ve puan', () => {
    expect(daysLeftText(0)).toBe('Bugün')
    expect(daysLeftText(1)).toBe('Yarın')
    expect(daysLeftText(12)).toBe('12 gün')
    expect(formatScore(78.25)).toBe('78,3')
  })
  it('gereken puan cümlesi ve bulunma eki', () => {
    const names = new Map([
      ['f', 'Final'],
      ['v', 'Vize'],
      ['p', 'Proje'],
      ['o', 'Ödev'],
    ])
    expect(requiredText({ status: 'needs', min: 82, remaining: ['f'] }, 'BB', names)).toBe("Final'de en az 82")
    expect(requiredText({ status: 'needs', min: 70, remaining: ['v', 'f'] }, 'CC', names)).toBe(
      "Vize ve Final'de en az 70",
    )
    expect(requiredText({ status: 'needs', min: 70, remaining: ['p'] }, 'CC', names)).toBe("Proje'de en az 70")
    expect(requiredText({ status: 'needs', min: 50, remaining: ['o'] }, 'CC', names)).toBe("Ödev'de en az 50")
    expect(requiredText({ status: 'secured', remaining: ['f'] }, 'DD', names)).toBe('DD garanti')
    expect(
      requiredText({ status: 'impossible', best: 55, bestLetter: 'FD', remaining: ['f'] }, 'AA', names),
    ).toBe('AA olmaz · en iyi FD')
  })
  it('harf tablosu yazımı', () => {
    const rows = parseLetterTable('aa 90 4, BA 85 3,5\nFF 0 0')
    expect(rows).toEqual([
      { letter: 'AA', min: 90, points: 4 },
      { letter: 'BA', min: 85, points: 3.5 },
      { letter: 'FF', min: 0, points: 0 },
    ])
    expect(formatLetterTable(rows!)).toBe('AA 90 4, BA 85 3.5, FF 0 0')
    expect(parseLetterTable('AA 90')).toBeNull()
  })
})

describe('toComponents', () => {
  it('adı ve ağırlığı dolu satırlar; virgüllü ağırlık', () => {
    expect(
      toComponents([
        { name: 'Quiz', kind: 'quiz', weight: '10' },
        { name: 'Vize', kind: 'midterm', weight: '' },
        { name: ' Final ', kind: 'final', weight: '52,5' },
        { name: '', kind: 'other', weight: '5' },
      ]),
    ).toEqual([
      { name: 'Quiz', kind: 'quiz', weight: 10 },
      { name: 'Final', kind: 'final', weight: 52.5 },
    ])
  })
})
