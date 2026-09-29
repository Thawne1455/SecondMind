import { describe, expect, it } from 'vitest'
import {
  builtinFor,
  compareCounts,
  compareText,
  extractGddCounts,
  firstInteger,
  suggestRule,
} from './gddCompare'

// Runika GDD'sinin (Assets/Notlar/GDD_Runika.md) biçimini taklit eder.
const GDD = [
  '# BLOODFORGE — Game Design Document',
  '',
  '### 4.3 Level sistemi',
  '',
  '| Level | Mermi sayısı | Hasar |',
  '|---|---|---|',
  '| 1 | 1 | 30 |',
  '| 2 | 2 | 60 |',
  '',
  '## 12. İçerik özeti (tam oyun hedefi)',
  '',
  '| Öğe | Hafta 1 hedefi |',
  '|---|---|',
  '| Silah davranış tipi | 4 (mermi, orbit, aura, homing) |',
  '| **Silah** | 8 (tip başına 2) |',
  '| Düşman tipi | 3 |',
  '| Tur | 12 (ama önce **1 çalışan tur**, bkz. §14) |',
  '| Stat item | çeşidi sonra; sistem hazır |',
  '',
  '## Ses listesi',
  '',
  '| Parça | Sahne | Süre |',
  '| --- | --- | --- |',
  '| Menü | Menu | 1:20 |',
  '| Boss | Boss | 2:10 |',
  '|  |  |  |',
  '',
  '## Bölümler',
  '',
  '- Orman',
  '- Mağara',
  '- Kale',
  '',
  '```',
  '| Kod | 99 |',
  '```',
].join('\n')

describe('GDD sayıları', () => {
  it('tablo satırları: etiket + ilk tam sayı; sayı olmayan ve sayısal etiketli satırlar atlanır', () => {
    const counts = extractGddCounts(GDD)
    const table = counts.filter((c) => c.source === 'table').map((c) => [c.label, c.count])
    expect(table).toEqual([
      ['Silah davranış tipi', 4],
      ['Silah', 8],
      ['Düşman tipi', 3],
      ['Tur', 12],
    ])
  })

  it('bölüm sayıları: ses listesi tablo satırı (boş satır sayılmaz), bölümler madde sayısı', () => {
    const counts = extractGddCounts(GDD).filter((c) => c.source === 'section')
    expect(counts).toEqual([
      { label: 'Ses listesi', count: 2, source: 'section' },
      { label: 'Bölümler', count: 3, source: 'section' },
    ])
  })

  it('kod bloğundaki tablo okunmaz', () => {
    expect(extractGddCounts(GDD).some((c) => c.label === 'Kod')).toBe(false)
  })

  it('ilk tam sayı', () => {
    expect(firstInteger('8 (tip başına 2)')).toBe(8)
    expect(firstInteger('1:20')).toBe(1)
    expect(firstInteger('yarım (0.5)')).toBeNull()
    expect(firstInteger('yok')).toBeNull()
  })
})

describe('klasör eşleştirme', () => {
  const dirs = [
    { path: 'Assets/Audio/Silah', files: ['ates.wav', 'dolum.wav'] },
    { path: 'Assets/Data/Weapons', files: ['Kilic.asset', 'Yay.asset', 'Asa.asset'] },
    { path: 'Assets/Sprites/Silahlar', files: [] },
    { path: 'Assets/Data/Enemies', files: ['Iskelet.asset', 'Yarasa.asset'] },
    { path: 'Assets/Prefabs/UI', files: ['Menu.prefab'] },
  ]

  it('Türkçe etiket İngilizce veri klasörüyle eşleşir, .asset klasörü önce', () => {
    expect(suggestRule('Silah', dirs)).toEqual({
      label: 'Silah',
      glob: 'Assets/Data/Weapons/*.asset',
    })
    expect(suggestRule('Düşman tipi', dirs)).toEqual({
      label: 'Düşman tipi',
      glob: 'Assets/Data/Enemies/*.asset',
    })
    expect(suggestRule('Relic', dirs)).toBeNull()
  })

  it('hazır sayımlar', () => {
    expect(builtinFor('Ses listesi')).toBe('audio')
    expect(builtinFor('Bölümler / Sahneler')).toBe('scenes')
    expect(builtinFor('Silah')).toBeNull()
  })
})

describe('karşılaştırma', () => {
  it('eksik önce, fazla, bilinmeyen, eşit sonda; kural hazır sayımı ezer', () => {
    const gdd = extractGddCounts(GDD)
    const rows = compareCounts(
      gdd,
      [{ label: 'silah', glob: 'Assets/Data/Weapons/*.asset' }],
      new Map([['Assets/Data/Weapons/*.asset', 3]]),
      { scenes: 3, audio: 5, scripts: 40 },
    )
    expect(rows.map((r) => [r.label, r.state])).toEqual([
      ['Silah', 'missing'],
      ['Ses listesi', 'extra'],
      ['Silah davranış tipi', 'unknown'],
      ['Düşman tipi', 'unknown'],
      ['Tur', 'unknown'],
      ['Bölümler', 'equal'],
    ])
    expect(compareText(rows[0]!)).toBe("GDD'de 8 silah, klasörde 3")
    expect(compareText(rows[2]!)).toBe("GDD'de 4 silah davranış tipi")
  })
})
