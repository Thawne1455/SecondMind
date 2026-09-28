import { describe, expect, it } from 'vitest'
import { parseQuickEntry, toReminderRule } from './quickEntry'

// 28 Eylül 2026 Pazartesi.
const now = new Date(2026, 8, 28, 12)
const clock = { clock: true }

describe('hızlı giriş', () => {
  it('düz metin olduğu gibi kalır', () => {
    expect(parseQuickEntry('  Menü müziğini kırp ', now)).toMatchObject({
      title: 'Menü müziğini kırp',
      date: null,
      estimateMin: null,
    })
  })

  it('gün kelimeleri: bugün, yarın, öbür gün, gün adı (bugün dahil), "5 ekim"', () => {
    expect(parseQuickEntry('yarın kitabı iade et', now)).toMatchObject({
      title: 'kitabı iade et',
      date: '2026-09-29',
    })
    expect(parseQuickEntry('öbür gün ara', now).date).toBe('2026-09-30')
    expect(parseQuickEntry('Cuma ödev', now).date).toBe('2026-10-02')
    expect(parseQuickEntry('pzt ödev', now).date).toBe('2026-09-28')
    expect(parseQuickEntry('5 ekim sınav', now).date).toBe('2026-10-05')
    // Geçmiş gün gelecek yıla.
    expect(parseQuickEntry('3 oca bilet', now).date).toBe('2027-01-03')
    // Olmayan gün tanınmaz.
    expect(parseQuickEntry('31 şubat', now)).toMatchObject({ date: null, title: '31 şubat' })
  })

  it('süre, öncelik, son tarih', () => {
    expect(parseQuickEntry('Raporu yaz 45dk ! son cuma', now)).toEqual({
      title: 'Raporu yaz',
      date: null,
      dueDate: '2026-10-02',
      time: null,
      estimateMin: 45,
      priority: 3,
      repeat: null,
    })
    expect(parseQuickEntry('okuma 1,5 saat', now).estimateMin).toBe(90)
    expect(parseQuickEntry('okuma 2sa', now).estimateMin).toBe(120)
    // Birimsiz sayı başlıkta kalır.
    expect(parseQuickEntry('3 bölüm oku', now).title).toBe('3 bölüm oku')
  })

  it('görevde saat tanınmaz; hatırlatmada tanınır', () => {
    expect(parseQuickEntry('10:00 toplantı notu', now)).toMatchObject({
      title: '10:00 toplantı notu',
      time: null,
    })
    expect(parseQuickEntry('yarın 9.30 kitabı iade et', now, clock)).toMatchObject({
      title: 'kitabı iade et',
      date: '2026-09-29',
      time: '09:30',
    })
    expect(parseQuickEntry('25:00 x', now, clock).time).toBeNull()
  })

  it('tekrar: her gün, hafta içi, her pzt, her ay, her yıl', () => {
    expect(parseQuickEntry('her gün 09:00 ilaç', now, clock)).toMatchObject({
      title: 'ilaç',
      time: '09:00',
      repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7] },
    })
    expect(parseQuickEntry('hafta içi 8:00 kalk', now, clock).repeat).toEqual({
      kind: 'weekly',
      days: [1, 2, 3, 4, 5],
    })
    expect(parseQuickEntry('her Çarşamba plan', now, clock)).toMatchObject({
      title: 'plan',
      date: '2026-09-30',
      repeat: { kind: 'weekly', days: [3] },
    })
    expect(parseQuickEntry('her ay kira', now, clock).repeat).toEqual({ kind: 'monthly' })
    // Görevde tekrar yok: kelimeler başlıkta kalır.
    expect(parseQuickEntry('her gün yürü', now).title).toBe('her gün yürü')
  })

  it('tekrar kuralı: aylık/yıllık gün verilen günden', () => {
    const day = new Date(2026, 9, 14)
    expect(toReminderRule({ kind: 'yearly' }, '10:00', day)).toEqual({
      kind: 'yearly',
      month: 10,
      day: 14,
      time: '10:00',
    })
    expect(toReminderRule({ kind: 'monthly' }, '09:00', day)).toEqual({
      kind: 'monthly',
      day: 14,
      time: '09:00',
    })
  })
})
