import { describe, expect, it } from 'vitest'
import {
  clusterCount,
  clusterCountLabel,
  clusterPoints,
  clusterTitle,
  countDistinctTesters,
  jaccard,
  numberSuffix,
  parseChatLines,
  similarity,
  splitPoints,
  stems,
  type ClusterablePoint,
} from './playtest'

const TODAY = '2026-09-29'
const NONE = new Set<string>()

describe('parseChatLines', () => {
  it('kalıp yoksa bütün metin tek girdi, kişisiz', () => {
    const raw = 'Ölüm ekranında takıldım.\nMüzik çok yüksek.'
    expect(parseChatLines(raw, TODAY)).toEqual([{ tester: null, receivedOn: TODAY, text: raw }])
  })

  it('boş metin boş liste', () => {
    expect(parseChatLines('  \n ', TODAY)).toEqual([])
  })

  it('Discord "[12:03] Ali: ..." satırları, ardışık aynı kişi birleşir', () => {
    const raw = [
      '[12:03] Ali: ölüm panelinde takıldım',
      '[12:04] Ali: geri dönemedim',
      '[12:05] Ayşe: müzik çok yüksek',
      '[12:06] Ali: harita güzel ama',
    ].join('\n')
    expect(parseChatLines(raw, TODAY)).toEqual([
      { tester: 'Ali', receivedOn: TODAY, text: 'ölüm panelinde takıldım\ngeri dönemedim' },
      { tester: 'Ayşe', receivedOn: TODAY, text: 'müzik çok yüksek' },
      { tester: 'Ali', receivedOn: TODAY, text: 'harita güzel ama' },
    ])
  })

  it('tarihli köşeli parantez ve iki nokta içeren mesaj', () => {
    const raw = '[28.09.2026 23:41] Mehmet Can: menü: çok karışık\n[29.09.2026 09:02] Mehmet Can: tekrar denedim'
    expect(parseChatLines(raw, TODAY)).toEqual([
      { tester: 'Mehmet Can', receivedOn: '2026-09-28', text: 'menü: çok karışık' },
      { tester: 'Mehmet Can', receivedOn: '2026-09-29', text: 'tekrar denedim' },
    ])
  })

  it('WhatsApp Android biçimi, alt satırlar önceki mesaja eklenir', () => {
    const raw = [
      '28.09.2026 21:15 - Zeynep: Envanter açılmıyor bazen',
      've tab tuşu çalışmıyor',
      '28/09/26, 21:20 - İlker: Ölüm ekranında takılı kaldım',
    ].join('\n')
    expect(parseChatLines(raw, TODAY)).toEqual([
      { tester: 'Zeynep', receivedOn: '2026-09-28', text: 'Envanter açılmıyor bazen\nve tab tuşu çalışmıyor' },
      { tester: 'İlker', receivedOn: '2026-09-28', text: 'Ölüm ekranında takılı kaldım' },
    ])
  })

  it('iOS WhatsApp saniyeli köşeli parantez', () => {
    expect(parseChatLines('[29.09.2026 12:03:45] Ali: zıplama ağır', TODAY)).toEqual([
      { tester: 'Ali', receivedOn: TODAY, text: 'zıplama ağır' },
    ])
  })

  it('Discord başlığı "Ali — Bugün 12:03" ve "Dün saat"', () => {
    const raw = [
      'Ali — Bugün 12:03',
      'ölüm ekranında takıldım',
      'müzik yüksek',
      'Veli — Dün saat 23:10',
      'harita çok karışık',
      'Selin — 27.09.2026 10:00',
      'boss çok zor',
    ].join('\n')
    expect(parseChatLines(raw, TODAY)).toEqual([
      { tester: 'Ali', receivedOn: TODAY, text: 'ölüm ekranında takıldım\nmüzik yüksek' },
      { tester: 'Veli', receivedOn: '2026-09-28', text: 'harita çok karışık' },
      { tester: 'Selin', receivedOn: '2026-09-27', text: 'boss çok zor' },
    ])
  })

  it('"Dün" ay başında önceki aya geçer', () => {
    expect(parseChatLines('Ali — Dün 10:00\nselam millet', '2026-10-01')[0]?.receivedOn).toBe('2026-09-30')
  })

  it('geçersiz tarih yedek tarihe düşer', () => {
    expect(parseChatLines('[31.02.2026 10:00] Ali: garip tarih', TODAY)[0]?.receivedOn).toBe(TODAY)
  })

  it('ilk kalıptan önceki satırlar kişisiz girdi olur', () => {
    const raw = 'dünkü test notları\n[12:03] Ali: müzik yüksek'
    expect(parseChatLines(raw, TODAY)).toEqual([
      { tester: null, receivedOn: TODAY, text: 'dünkü test notları' },
      { tester: 'Ali', receivedOn: TODAY, text: 'müzik yüksek' },
    ])
  })
})

describe('splitPoints', () => {
  it('cümle sonlarından böler, kısa parça öncekine eklenir', () => {
    expect(splitPoints('Ölüm ekranında takılı kaldım. Müzik çok yüksek geliyor! Harita güzel.')).toEqual([
      'Ölüm ekranında takılı kaldım.',
      'Müzik çok yüksek geliyor! Harita güzel.',
    ])
  })

  it('madde işaretleri ve numaralı liste', () => {
    const raw = '- envanter açılmıyor bazen\n* müzik çok yüksek\n• zıplama biraz ağır geliyor\n1. ilk bölüm çok uzun\n2) boss savaşı fazla zor'
    expect(splitPoints(raw)).toEqual([
      'envanter açılmıyor bazen',
      'müzik çok yüksek',
      'zıplama biraz ağır geliyor',
      'ilk bölüm çok uzun',
      'boss savaşı fazla zor',
    ])
  })

  it('kısa satır da öncekine eklenir', () => {
    expect(splitPoints('ölüm panelinde takıldım\naynen öyle')).toEqual(['ölüm panelinde takıldım aynen öyle'])
  })

  it('tek kısa parça korunur', () => {
    expect(splitPoints('Çok iyi')).toEqual(['Çok iyi'])
  })

  it('baştaki kısa parça sonrakine katılır', () => {
    expect(splitPoints('Güzel! Ama ölüm ekranında takıldım.')).toEqual(['Güzel! Ama ölüm ekranında takıldım.'])
  })

  it('ondalık sayı ve üç nokta', () => {
    expect(splitPoints('Sürüm 1.2 çok iyi olmuş… Ama kamera fazla sallanıyor.')).toEqual([
      'Sürüm 1.2 çok iyi olmuş…',
      'Ama kamera fazla sallanıyor.',
    ])
  })

  it('boş metin boş liste', () => {
    expect(splitPoints(' \n - \n')).toEqual([])
  })
})

describe('stems', () => {
  it('tr-TR küçük harf, noktalama, dolgu, ilk 5 harf', () => {
    expect(stems('Ölüm ekranında ÇOK takılı kaldım!')).toEqual(['ölüm', 'ekran', 'takıl', 'kaldı'])
  })

  it('İ ve I doğru küçülür, kesme işaretinden sonraki ek atılır', () => {
    expect(stems("IŞIK İstanbul'da bozuk")).toEqual(['ışık', 'istan', 'bozuk'])
  })

  it('tekrarlar tekilleşir', () => {
    expect(stems('müzik müzikler müzikte')).toEqual(['müzik'])
  })

  it('yalnız dolgu kelimeleri boş kök', () => {
    expect(stems('ve ama bu da ki gibi sonra')).toEqual([])
  })
})

describe('jaccard ve similarity', () => {
  it('jaccard', () => {
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3)
    expect(jaccard([], [])).toBe(0)
    expect(jaccard(['a'], ['a'])).toBe(1)
  })

  it('ölüm paneli ve ölüm ekranı benzer', () => {
    const a = stems('ölüm panelinde takıldım')
    const b = stems('Ölüm ekranında takılı kaldım')
    expect(jaccard(a, b)).toBeCloseTo(0.4)
    expect(similarity(a, b, NONE)).toBe(true)
  })

  it('farklı konular benzer değil', () => {
    expect(similarity(stems('ölüm panelinde takıldım'), stems('müzik çok yüksek'), NONE)).toBe(false)
  })

  it('düşük Jaccard ama 2 ortak içerik kökü benzer sayılır', () => {
    const a = stems('Envanter menüsü açılmıyor bazen')
    const b = stems("Tab'a basınca envanter menüsü donuyor")
    expect(jaccard(a, b)).toBeLessThan(0.34)
    expect(similarity(a, b, NONE)).toBe(false)
    expect(similarity(a, b, new Set(['envan', 'menüs']))).toBe(true)
    expect(similarity(a, b, new Set(['envan']))).toBe(false)
  })
})

function makeIds(): () => string {
  let n = 0
  return () => `k${++n}`
}

function pt(id: string, text: string, clusterId: string | null = null, locked = false): ClusterablePoint {
  return { id, stems: stems(text), clusterId, locked }
}

describe('clusterPoints', () => {
  it('gerçekçi playtest mesajlarını gruplar', () => {
    const points = [
      pt('p1', 'ölüm panelinde takıldım'),
      pt('p2', 'müzik çok yüksek'),
      pt('p3', 'Ölüm ekranında takılı kaldım'),
      pt('p4', 'Müzik sesi aşırı yüksek geldi'),
      pt('p5', 'ölünce ekranda takılıyorum hep'),
      pt('p6', 'boss savaşı fazla uzun sürüyor'),
    ]
    const map = clusterPoints(points, NONE, makeIds())
    expect(map.get('p1')).toBe('k1')
    expect(map.get('p2')).toBe('k2')
    expect(map.get('p3')).toBe('k1')
    expect(map.get('p4')).toBe('k2')
    expect(map.get('p6')).toBe('k3')
    // p5: p1 ile tek ortak kök var, ama p3 ile ekran + takıl ortak (0,4): tek bağlantıyla aynı küme
    expect(map.get('p5')).toBe('k1')
  })

  it('içerik kökleriyle envanter şikayetleri birleşir', () => {
    const points = [pt('a', 'Envanter menüsü açılmıyor bazen'), pt('b', "Tab'a basınca envanter menüsü donuyor")]
    expect(new Set(clusterPoints(points, NONE, makeIds()).values()).size).toBe(2)
    expect(new Set(clusterPoints(points, new Set(['envan', 'menüs']), makeIds()).values()).size).toBe(1)
  })

  it('mevcut ve kilitli yerleşimlere dokunmaz, yeni noktayı en iyi kümeye koyar', () => {
    const points = [
      pt('p1', 'ölüm panelinde takıldım', 'A'),
      // Taha elle başka kümeye taşıdı: benzerliğe rağmen B'de kalır
      pt('p2', 'Ölüm ekranında takılı kaldım', 'B', true),
      pt('p3', 'müzik çok yüksek', 'C'),
      pt('p4', 'ölüm panelinde yine takıldım resmen'),
    ]
    const map = clusterPoints(points, NONE, makeIds())
    expect(map.get('p1')).toBe('A')
    expect(map.get('p2')).toBe('B')
    expect(map.get('p3')).toBe('C')
    // A ile Jaccard daha yüksek
    expect(map.get('p4')).toBe('A')
  })

  it('elle ayrılmış (kilitli, kümesiz) nokta kendi kümesini alır', () => {
    const points = [pt('p1', 'ölüm panelinde takıldım', 'A'), pt('p2', 'ölüm panelinde takıldım', null, true)]
    const map = clusterPoints(points, NONE, makeIds())
    expect(map.get('p2')).toBe('k1')
  })

  it('eşitlikte önce oluşan küme, sonuç belirlenimci', () => {
    const points = [pt('x', 'müzik yüksek', 'A'), pt('y', 'müzik yüksek', 'B'), pt('z', 'müzik yüksek')]
    expect(clusterPoints(points, NONE, makeIds()).get('z')).toBe('A')
  })
})

describe('sayım', () => {
  it('countDistinctTesters son 30 gün, büyük/küçük harf duyarsız', () => {
    const now = new Date(2026, 8, 29, 12)
    const entries = [
      { tester: 'Ali', receivedOn: '2026-09-29' },
      { tester: 'ali ', receivedOn: '2026-09-20' },
      { tester: 'İlker', receivedOn: '2026-08-31' },
      { tester: 'Eski', receivedOn: '2026-08-30' },
      { tester: null, receivedOn: '2026-09-29' },
    ]
    expect(countDistinctTesters(entries, now)).toBe(2)
    expect(countDistinctTesters(entries, now, 7)).toBe(1)
  })

  it('clusterCount ve etiket', () => {
    const members = [
      { tester: 'Ali', receivedOn: TODAY },
      { tester: 'ALİ', receivedOn: TODAY },
      { tester: 'Ayşe', receivedOn: TODAY },
      { tester: 'Veli', receivedOn: TODAY },
    ]
    const count = clusterCount(members, ['Ali', 'Ayşe', 'Veli', 'Zeynep', 'İlker', 'ali'])
    expect(count).toEqual({ people: 3, of: 5 })
    expect(clusterCountLabel(count)).toBe("5 kişiden 3'ü")
  })

  it('payda paydan küçük olamaz', () => {
    expect(clusterCount([{ tester: 'Ali' }, { tester: 'Veli' }], ['Ali'])).toEqual({ people: 2, of: 2 })
  })

  it('numberSuffix tablosu', () => {
    const table: [number, string][] = [
      [0, "0'ı"], [1, "1'i"], [2, "2'si"], [3, "3'ü"], [4, "4'ü"], [5, "5'i"], [6, "6'sı"], [7, "7'si"],
      [8, "8'i"], [9, "9'u"], [10, "10'u"], [11, "11'i"], [16, "16'sı"], [20, "20'si"], [23, "23'ü"],
      [30, "30'u"], [40, "40'ı"], [50, "50'si"], [60, "60'ı"], [70, "70'i"], [80, "80'i"], [90, "90'ı"],
      [100, "100'ü"], [200, "200'ü"], [110, "110'u"], [1000, "1000'i"], [2_000_000, "2000000'u"],
    ]
    for (const [n, s] of table) expect(numberSuffix(n)).toBe(s)
  })

  it('clusterTitle en kısa nokta', () => {
    expect(clusterTitle(['Ölüm ekranında takılı kaldım', 'ölüm panelinde takıldım', 'ölüm ekranı donuyor'])).toBe(
      'ölüm ekranı donuyor'
    )
    expect(clusterTitle([])).toBe('')
  })
})
