import { describe, expect, it } from 'vitest'
import { STORE_PAGE_CRITERIA, unityTemplate } from './milestoneTemplate'

describe('unityTemplate', () => {
  it('altı taş, doğru sırada', () => {
    expect(unityTemplate('itch').map((m) => m.title)).toEqual([
      'Oynanabilir prototip',
      'Dikey kesit',
      'Mağaza sayfası',
      'Demo',
      'Beta',
      'Çıkış',
    ])
  })

  it('Mağaza sayfası kriterleri platforma göre', () => {
    const store = (p: 'itch' | 'steam') =>
      unityTemplate(p).find((m) => m.title === 'Mağaza sayfası')!
    expect(store('itch').criteria).toEqual(STORE_PAGE_CRITERIA.itch)
    expect(store('itch').criteria).toContain('WebGL yapısı yüklendi')
    expect(store('steam').criteria).toContain('Kapsül görseller')
    expect(store('steam').criteria).not.toContain('WebGL yapısı yüklendi')
  })

  it('her taşın en az bir kriteri var', () => {
    for (const m of unityTemplate('steam')) expect(m.criteria.length).toBeGreaterThan(0)
  })
})
