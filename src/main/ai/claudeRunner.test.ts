import { describe, expect, it } from 'vitest'
import { findClaude, parseClaudeVersion } from './claudeRunner'

describe('parseClaudeVersion', () => {
  it('sürüm satırından numarayı alır', () => {
    expect(parseClaudeVersion('2.1.3 (Claude Code)\n')).toBe('2.1.3')
    expect(parseClaudeVersion('claude 1.0.0-beta.2')).toBe('1.0.0-beta.2')
    expect(parseClaudeVersion('bilinmeyen')).toBeNull()
  })
})

describe('findClaude', () => {
  it('ayarlı yol yoksa aramaya düşmez, null döner', () => {
    expect(findClaude('Z:\\yok\\claude.exe', { PATH: '' })).toBeNull()
  })
})
