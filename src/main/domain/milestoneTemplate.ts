// Unity oyunu yol haritası şablonu (PROJELER.md > Yol haritası). Taşlar düzenlenebilir; Mağaza sayfası
// taşının kontrol listesi yayın platformuna göre gelir. Tarihler boş: Taha hedefleri kendisi koyar.

export type TemplatePlatform = 'itch' | 'steam'

export type TemplateMilestone = { title: string; criteria: string[] }

export const STORE_PAGE_CRITERIA: Record<TemplatePlatform, string[]> = {
  itch: [
    'Kapak görseli (630×500)',
    'Kısa açıklama',
    'Ekran görüntüleri',
    'GIF ya da fragman',
    'Etiketler',
    'Fiyat ve ödeme ayarı',
    'Windows yapısı yüklendi',
    'WebGL yapısı yüklendi',
  ],
  steam: [
    'Kapsül görseller',
    'Açıklama',
    'Ekran görüntüleri',
    'Fragman',
    'Etiketler',
    'Fiyat',
    'Çıkış tarihi',
  ],
}

export function unityTemplate(platform: TemplatePlatform): TemplateMilestone[] {
  return [
    { title: 'Oynanabilir prototip', criteria: ['Temel döngü baştan sona oynanıyor'] },
    { title: 'Dikey kesit', criteria: ['Bir bölüm son kalitede'] },
    { title: 'Mağaza sayfası', criteria: STORE_PAGE_CRITERIA[platform] },
    { title: 'Demo', criteria: ['Demo yapısı yayında'] },
    { title: 'Beta', criteria: ['Bilinen kritik hata yok'] },
    { title: 'Çıkış', criteria: ['Son yapı yüklendi'] },
  ]
}
