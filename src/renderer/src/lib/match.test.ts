import { describe, expect, it } from 'vitest'
import { matchText } from './match'

describe('matchText', () => {
  it('büyük/küçük harf duyarsız eşleşir', () => {
    expect(matchText('Runika klasörünü tara', 'runika')).toEqual([[0, 6]])
  })

  it('Türkçe İ/i ve I/ı ayrımını korur', () => {
    expect(matchText('İSTANBUL', 'istanbul')).toEqual([[0, 8]])
    expect(matchText('ILIK', 'ılık')).toEqual([[0, 4]])
    expect(matchText('ILIK', 'ilik')).toBeNull()
  })

  it('her kelime geçmeli, sıra önemsiz', () => {
    expect(matchText('Oturumu kapat: Runika', 'runika kapat')).toEqual([
      [8, 13],
      [15, 21],
    ])
    expect(matchText('Oturumu kapat: Runika', 'runika aç')).toBeNull()
  })

  it('tekrar eden eşleşmeleri ve çakışmaları birleştirir', () => {
    expect(matchText('ses ses', 'ses')).toEqual([
      [0, 3],
      [4, 7],
    ])
    expect(matchText('abcd', 'abc bcd')).toEqual([[0, 4]])
  })

  it('boş sorgu her şeyle eşleşir', () => {
    expect(matchText('Bugün', '  ')).toEqual([])
  })
})
