import { describe, expect, it } from 'vitest'
import { buildBriefing, lastTouch, topFiles, type BriefingInput } from './briefing'

const DAY = 86_400_000
const NOW = Date.parse('2026-09-29T12:00:00Z')
const ago = (days: number) => NOW - days * DAY

const base = (over: Partial<BriefingInput> = {}): BriefingInput => ({
  now: NOW,
  lastOpenedAt: ago(4),
  lastSession: {
    startedAt: ago(4) - 95 * 60_000,
    endedAt: ago(4),
    leftOff: 'Boss fazı 2 müziği yarım.',
  },
  commits: [],
  sessionFiles: [],
  uncommitted: null,
  nextStep: 'Boss müziğini hızlandır',
  parkedSince: 0,
  ...over,
})

describe('ne zaman', () => {
  it('3 günden az ise yok, fazla ise var', () => {
    expect(buildBriefing(base({ lastOpenedAt: ago(2), lastSession: null }))).toBeNull()
    expect(buildBriefing(base())).not.toBeNull()
  })

  it('son dokunuş: açılış, oturum, commit içinden en yenisi', () => {
    const input = base({
      commits: [{ message: 'dün', committedAt: ago(1), files: [], areas: {} }],
    })
    expect(lastTouch(input)).toBe(ago(1))
    expect(buildBriefing(input)).toBeNull()
  })

  it('hiç dokunulmamış (yeni) projede yok', () => {
    expect(buildBriefing(base({ lastOpenedAt: null, lastSession: null }))).toBeNull()
  })

  it('gösterecek bir şey yoksa yok', () => {
    expect(buildBriefing(base({ lastSession: null, nextStep: '  ' }))).toBeNull()
  })
})

describe('içerik', () => {
  it("son oturum, commit'ler ve alanları, dosyalar, commit'lenmemişler", () => {
    const b = buildBriefing(
      base({
        lastOpenedAt: ago(10),
        lastSession: { startedAt: ago(5) - 95 * 60_000, endedAt: ago(5), leftOff: 'yarım' },
        commits: [
          { message: 'c3', committedAt: ago(4), files: ['a.cs', 'b.cs'], areas: { Kod: 2 } },
          {
            message: 'c2',
            committedAt: ago(6),
            files: ['a.cs', 'x.wav'],
            areas: { Kod: 1, Ses: 1 },
          },
          { message: 'c1', committedAt: ago(7), files: [], areas: {} },
          { message: 'c0', committedAt: ago(8), files: [], areas: {} },
          { message: 'c-1', committedAt: ago(8), files: [], areas: {} },
          { message: 'c-2', committedAt: ago(9), files: [], areas: {} },
        ],
        sessionFiles: [['b.cs', 'a.cs'], ['z.md']],
        uncommitted: { count: 4, oldestAt: ago(6) },
        parkedSince: 2,
      }),
    )!
    expect(b.daysAway).toBe(4)
    expect(b.lastSession).toEqual({ endedAt: ago(5), minutes: 95, leftOff: 'yarım' })
    expect(b.commits.map((c) => c.message)).toEqual(['c3', 'c2', 'c1', 'c0', 'c-1'])
    expect(b.commitCount).toBe(6)
    expect(b.commitAreas).toEqual([
      ['Kod', 3],
      ['Ses', 1],
    ])
    expect(b.files).toEqual(['a.cs', 'b.cs', 'z.md', 'x.wav'])
    expect(b.uncommitted).toEqual({ count: 4, oldestAt: ago(6), stale: true })
    expect(b.nextStep).toBe('Boss müziğini hızlandır')
    expect(b.parkedSince).toBe(2)
  })

  it("taze commit'lenmemiş değişiklik uyarı değil; sıfır dosya satırı yok", () => {
    expect(
      buildBriefing(base({ uncommitted: { count: 2, oldestAt: ago(1) } }))!.uncommitted,
    ).toEqual({
      count: 2,
      oldestAt: ago(1),
      stale: false,
    })
    expect(
      buildBriefing(base({ uncommitted: { count: 0, oldestAt: null } }))!.uncommitted,
    ).toBeNull()
  })

  it('en çok değişen dosyalar: bir listede tekrar eden bir kez sayılır', () => {
    expect(topFiles([['a', 'a', 'b'], ['b'], ['c']], 2)).toEqual(['b', 'a'])
  })
})
