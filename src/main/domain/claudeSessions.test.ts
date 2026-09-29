import { describe, expect, it } from 'vitest'
import {
  buildSpans,
  candidateDirs,
  encodeClaudeDir,
  isInside,
  overlaps,
  parseEventLine,
  relativeTo,
  type ClaudeEvent,
} from './claudeSessions'

const RUNIKA = 'C:\\ajanda\\Runika'
const T0 = Date.parse('2026-09-01T15:00:00.000Z')
const min = (m: number) => T0 + m * 60_000
const ev = (m: number, extra: Partial<ClaudeEvent> = {}): ClaudeEvent => ({
  at: min(m),
  cwd: RUNIKA,
  sessionId: 's1',
  edited: [],
  ...extra,
})

describe('klasör eşleme', () => {
  it('Claude Code klasör adı', () => {
    expect(encodeClaudeDir('C:\\ajanda\\Runika')).toBe('C--ajanda-Runika')
    expect(encodeClaudeDir('C:\\Users\\joker\\OneDrive\\Masaüstü\\SMind\\')).toBe(
      'C--Users-joker-OneDrive-Masa-st--SMind',
    )
  })

  it('aday klasörler: kendisi, üstü, altı; komşu değil', () => {
    const dirs = [
      'C--ajanda',
      'C--ajanda-Runika',
      'C--ajanda-Runika-Tools',
      'C--ajanda-Frakton',
      'C--Users-joker',
    ]
    expect(candidateDirs(dirs, RUNIKA)).toEqual([
      'C--ajanda',
      'C--ajanda-Runika',
      'C--ajanda-Runika-Tools',
    ])
  })

  it('içinde mi: büyük/küçük harf duyarsız, önek tuzağı yok', () => {
    expect(isInside('c:\\AJANDA\\runika\\Assets', RUNIKA)).toBe(true)
    expect(isInside('C:/ajanda/Runika', RUNIKA)).toBe(true)
    expect(isInside('C:\\ajanda\\Runika2', RUNIKA)).toBe(false)
    expect(isInside('C:\\ajanda', RUNIKA)).toBe(false)
  })

  it('göreli yol', () => {
    expect(relativeTo('C:\\ajanda\\Runika\\Assets\\Scripts\\Boss.cs', RUNIKA)).toBe(
      'Assets/Scripts/Boss.cs',
    )
    expect(relativeTo('c:/ajanda/runika/README.md', RUNIKA)).toBe('README.md')
    expect(relativeTo('C:\\başka\\a.cs', RUNIKA)).toBeNull()
  })
})

describe('satır ayrıştırma', () => {
  it('kullanıcı / asistan satırından üst veri; düzenleyen araçların yolu', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-09-01T15:15:01.831Z',
      cwd: RUNIKA,
      sessionId: 's1',
      message: {
        content: [
          { type: 'text', text: 'gizli metin' },
          {
            type: 'tool_use',
            name: 'Edit',
            input: { file_path: `${RUNIKA}\\Assets\\a.cs`, old_string: 'x' },
          },
          { type: 'tool_use', name: 'Read', input: { file_path: `${RUNIKA}\\Assets\\b.cs` } },
          {
            type: 'tool_use',
            name: 'NotebookEdit',
            input: { notebook_path: `${RUNIKA}\\n.ipynb` },
          },
        ],
      },
    })
    expect(parseEventLine(line)).toEqual({
      at: Date.parse('2026-09-01T15:15:01.831Z'),
      cwd: RUNIKA,
      sessionId: 's1',
      edited: [`${RUNIKA}\\Assets\\a.cs`, `${RUNIKA}\\n.ipynb`],
    })
  })

  it('üst verisiz, yan ajan ve bozuk satırlar atlanır', () => {
    expect(parseEventLine('{"type":"cost-state","sessionId":"s1"}')).toBeNull()
    expect(parseEventLine('{"type":"ai-title","aiTitle":"x","sessionId":"s1"}')).toBeNull()
    expect(
      parseEventLine(
        JSON.stringify({
          timestamp: '2026-09-01T15:00:00Z',
          cwd: RUNIKA,
          sessionId: 's',
          isSidechain: true,
        }),
      ),
    ).toBeNull()
    expect(parseEventLine('{"timestamp":"x","cwd":')).toBeNull()
    expect(
      parseEventLine(JSON.stringify({ timestamp: 'dün', cwd: RUNIKA, sessionId: 's' })),
    ).toBeNull()
  })
})

describe('çalışma aralıkları', () => {
  it('30 dakikadan uzun boşluk yeni aralık; 5 dakikadan kısa aralık atılır', () => {
    const spans = buildSpans(
      [
        ev(0),
        ev(20, { edited: [`${RUNIKA}\\Assets\\b.cs`] }),
        ev(45, {
          edited: [`${RUNIKA}\\Assets\\a.cs`, `${RUNIKA}\\Assets\\b.cs`, 'C:\\başka\\x.cs'],
        }),
        // 31 dk boşluk
        ev(76),
        ev(79),
        // 90 dk boşluk, tek olay: süresiz
        ev(170),
      ],
      RUNIKA,
    )
    expect(spans).toEqual([
      {
        externalId: `s1:${min(0)}`,
        sessionId: 's1',
        start: min(0),
        end: min(45),
        files: ['Assets/a.cs', 'Assets/b.cs'],
      },
    ])
  })

  it('aralık sınırı tam 30 dakika aynı aralık', () => {
    expect(buildSpans([ev(0), ev(30), ev(60)], RUNIKA)).toHaveLength(1)
  })

  it('başka klasördeki olaylar ve oturumlar ayrı', () => {
    const spans = buildSpans(
      [
        ev(0),
        ev(10),
        ev(5, { cwd: 'C:\\ajanda' }),
        ev(100, { sessionId: 's2', cwd: `${RUNIKA}\\Assets` }),
        ev(120, { sessionId: 's2' }),
      ],
      RUNIKA,
    )
    expect(spans.map((s) => [s.sessionId, s.start, s.end])).toEqual([
      ['s1', min(0), min(10)],
      ['s2', min(100), min(120)],
    ])
  })

  it('dosya büyüyünce son aralığın kimliği aynı kalır', () => {
    const before = buildSpans([ev(0), ev(10)], RUNIKA)[0]!
    const after = buildSpans([ev(0), ev(10), ev(25)], RUNIKA)[0]!
    expect(after.externalId).toBe(before.externalId)
    expect(after.end).toBe(min(25))
  })

  it('kesişme', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 5, end: 20 })).toBe(true)
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false)
  })
})
