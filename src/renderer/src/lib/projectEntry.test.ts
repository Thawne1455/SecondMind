import { describe, expect, it } from 'vitest'
import { parseProjectEntry } from './projectEntry'

// 28 Eylül 2026 Pazartesi.
const now = new Date(2026, 8, 28, 12)
const stones = [
  { id: 'm1', title: 'Dikey kesit' },
  { id: 'm2', title: 'Demo' },
  { id: 'm3', title: 'Demo 2' },
  { id: 'm4', title: 'İlk sürüm' },
]
const parse = (text: string) => parseProjectEntry(text, now, stones)

describe('proje görevi girişi', () => {
  it('düz metin: görev, işaret yok', () => {
    expect(parse('  Menü müziğini kırp ')).toEqual({
      title: 'Menü müziğini kırp',
      estimateMin: null,
      priority: null,
      kind: 'task',
      severity: null,
      milestoneId: null,
      dueDate: null,
      date: null,
    })
  })

  it('!hata → hata türü, önem yok', () => {
    expect(parse('!hata zıplama takılıyor')).toMatchObject({
      title: 'zıplama takılıyor',
      kind: 'bug',
      severity: null,
      priority: null,
    })
  })

  it('önem işaretleri hatayı da belirtir', () => {
    expect(parse('kayıt bozuluyor !kritik')).toMatchObject({
      title: 'kayıt bozuluyor',
      kind: 'bug',
      severity: 'critical',
    })
    expect(parse('!önemli ses kesiliyor')).toMatchObject({ kind: 'bug', severity: 'major' })
    expect(parse('!küçük yazı kayık')).toMatchObject({ kind: 'bug', severity: 'minor' })
    expect(parse('!hata !kritik çöküyor')).toMatchObject({
      title: 'çöküyor',
      kind: 'bug',
      severity: 'critical',
    })
  })

  it('büyük harfli işaretler de tanınır (tr-TR)', () => {
    expect(parse('!KRİTİK çöküyor')).toMatchObject({ kind: 'bug', severity: 'critical' })
    expect(parse('!ARAŞTIRMA gölgeler')).toMatchObject({ kind: 'research', title: 'gölgeler' })
    expect(parse('!Hata x')).toMatchObject({ kind: 'bug', title: 'x' })
  })

  it('!araştırma → araştırma türü', () => {
    expect(parse('!araştırma shader seçenekleri')).toMatchObject({
      title: 'shader seçenekleri',
      kind: 'research',
      severity: null,
    })
  })

  it('tür işaretleri yüksek öncelik sayılmaz; tek "!" sayılır', () => {
    expect(parse('!hata x').priority).toBeNull()
    expect(parse('!kritik x ! 30dk')).toMatchObject({
      title: 'x',
      kind: 'bug',
      severity: 'critical',
      priority: 3,
      estimateMin: 30,
    })
  })

  it('bilinmeyen !kelime başlıkta kalır', () => {
    expect(parse('!acil düzelt')).toMatchObject({ title: '!acil düzelt', kind: 'task' })
  })

  it('@taş: ada göre ön ek, çok kelimeli ad boşluksuz eşleşir', () => {
    expect(parse('@dikey ses ayarları')).toMatchObject({ title: 'ses ayarları', milestoneId: 'm1' })
    expect(parse('@dikeykes ses')).toMatchObject({ milestoneId: 'm1' })
    expect(parse('@DİKEY ses')).toMatchObject({ milestoneId: 'm1' })
    expect(parse('@ilk menü')).toMatchObject({ title: 'menü', milestoneId: 'm4' })
  })

  it('@taş: birden çok eşleşmede verilen sıradaki ilk', () => {
    expect(parse('@demo menü').milestoneId).toBe('m2')
    expect(parse('@demo2 menü').milestoneId).toBe('m3')
  })

  it('@taş eşleşmezse başlıkta kalır; yalnız "@" da kalır', () => {
    expect(parse('@alfa menü')).toMatchObject({ title: '@alfa menü', milestoneId: null })
    expect(parse('@ menü')).toMatchObject({ title: '@ menü', milestoneId: null })
    expect(parseProjectEntry('@demo menü', now, [])).toMatchObject({
      title: '@demo menü',
      milestoneId: null,
    })
  })

  it('ilk eşleşen taş kullanılır, sonraki @ başlıkta kalır', () => {
    expect(parse('@demo @dikey x')).toMatchObject({ title: '@dikey x', milestoneId: 'm2' })
  })

  it('hızlı giriş kuralları: süre, gün, son tarih; saat başlıkta kalır', () => {
    expect(parse('!hata @demo yarın 10:00 menüyü düzelt 1.5sa son cuma')).toEqual({
      title: '10:00 menüyü düzelt',
      estimateMin: 90,
      priority: null,
      kind: 'bug',
      severity: null,
      milestoneId: 'm2',
      dueDate: '2026-10-02',
      date: '2026-09-29',
    })
  })

  it('boş metin', () => {
    expect(parse('   ')).toMatchObject({ title: '', kind: 'task', milestoneId: null })
  })
})
