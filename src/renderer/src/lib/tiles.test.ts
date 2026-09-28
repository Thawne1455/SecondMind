import { describe, expect, it } from 'vitest'
import { tileSpans } from './tiles'

describe('tileSpans', () => {
  it('satır başına en fazla üç, satırlar dengeli', () => {
    expect(tileSpans(6)).toEqual([2, 2, 2, 2, 2, 2])
    expect(tileSpans(5)).toEqual([2, 2, 2, 3, 3])
    expect(tileSpans(4)).toEqual([3, 3, 3, 3])
    expect(tileSpans(1)).toEqual([6])
    expect(tileSpans(2)).toEqual([3, 3])
    expect(tileSpans(0)).toEqual([])
  })
})
