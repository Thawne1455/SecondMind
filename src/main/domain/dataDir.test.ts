import { describe, expect, it } from 'vitest'
import { defaultDataDir, isUnderOneDrive } from './dataDir'

describe('defaultDataDir', () => {
  it('kullanıcı klasörünün altında SecondMind', () => {
    expect(defaultDataDir('C:\\Users\\taha')).toBe('C:\\Users\\taha\\SecondMind')
  })
})

describe('isUnderOneDrive', () => {
  const env = { OneDrive: 'C:\\Users\\taha\\OneDrive' }

  it('varsayılan klasör OneDrive altında değil', () => {
    expect(isUnderOneDrive('C:\\Users\\taha\\SecondMind', env)).toBe(false)
  })

  it('ortam değişkenindeki kökün altı', () => {
    expect(isUnderOneDrive('C:\\Users\\taha\\OneDrive\\Belgeler\\SecondMind', env)).toBe(true)
  })

  it('büyük/küçük harf ve sondaki ayırıcı fark etmez', () => {
    expect(isUnderOneDrive('c:\\users\\TAHA\\onedrive\\', env)).toBe(true)
  })

  it('adı OneDrive ile başlayan kardeş klasör kök sayılmaz', () => {
    expect(isUnderOneDrive('C:\\Users\\taha\\OneDriveYedek', env)).toBe(false)
  })

  it('ortam değişkeni yoksa yol parçasından tanır (kurumsal dahil)', () => {
    expect(isUnderOneDrive('D:\\OneDrive\\SecondMind', {})).toBe(true)
    expect(isUnderOneDrive('C:\\Users\\taha\\OneDrive - Okul\\SecondMind', {})).toBe(true)
  })
})
