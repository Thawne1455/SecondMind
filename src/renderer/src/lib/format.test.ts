import { describe, expect, it } from 'vitest'
import { formatBytes } from './format'

describe('formatBytes', () => {
  it('Türkçe ondalık virgülle yazar', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1,5 KB')
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1,2 MB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MB')
  })
})
