import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('çakışan sınıflarda sonrakini tutar', () => {
    expect(cn('h-[42px] px-5', 'h-12')).toBe('px-5 h-12')
    expect(cn('bg-s2 text-ink', 'bg-bg')).toBe('text-ink bg-bg')
    expect(cn('rounded-full', 'rounded-tile')).toBe('rounded-tile')
  })

  it('renk ve boyut text sınıflarını ayrı tutar', () => {
    expect(cn('text-ink', 'text-[15px]')).toBe('text-ink text-[15px]')
    expect(cn('text-fill-ink', 'text-white')).toBe('text-white')
  })

  it('boş değerleri atlar', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })
})
