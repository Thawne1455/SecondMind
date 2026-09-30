import { describe, expect, it } from 'vitest'
import { ChangesParseError, extractJson, validateChanges, type KnownIds } from './changes'

const known: KnownIds = {
  dumpIds: new Set(['d1', 'd2', 'd3']),
  projectIds: new Set(['p1']),
  courseIds: new Set(['c1']),
  noteIds: new Set(['n1']),
}

describe('extractJson', () => {
  it('kod bloğu ve ön söz atlanır', () => {
    expect(extractJson('Tamam, işte:\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('önce {"a":{"b":2}} sonra')).toEqual({ a: { b: 2 } })
  })
  it('JSON yoksa ya da bozuksa hata', () => {
    expect(() => extractJson('yok')).toThrow(ChangesParseError)
    expect(() => extractJson('{"a":')).toThrow(ChangesParseError)
  })
})

describe('validateChanges', () => {
  it('geçerliler geçer, geçersizler tek tek reddedilir', () => {
    const r = validateChanges(
      {
        version: 1,
        operations: [
          { op: 'create_task', sourceDumpIds: ['d1'], title: 'Menü müziğini kırp', context: { projectId: 'p1' } },
          { op: 'create_reminder', sourceDumpIds: ['d1'], title: 'Hocaya mail', at: '2026-10-01 09:00' },
          { op: 'create_exam', sourceDumpIds: ['d2'], courseId: 'uydurma', title: 'Vize', date: '2026-11-02' },
          { op: 'delete_everything', sourceDumpIds: ['d2'] },
          { op: 'create_idea', sourceDumpIds: ['d2'], title: 'Ritim oyunu' },
        ],
        unprocessed: [],
      },
      known,
    )
    expect(r.operations.map((o) => o.op)).toEqual(['create_task', 'create_idea'])
    expect(r.rejected.map((x) => [x.index, x.op])).toEqual([
      [1, 'create_reminder'],
      [2, 'create_exam'],
      [3, 'delete_everything'],
    ])
    expect(r.rejected[1]!.reason).toBe('Bilinmeyen ders: uydurma')
    expect(r.rejected[0]!.reason).toMatch(/^at: /)
  })

  it('kapsanmayan döküm atlandı sayılır; öneriye dönüşen atlanmış sayılmaz', () => {
    const r = validateChanges(
      JSON.stringify({
        version: 1,
        operations: [{ op: 'create_idea', sourceDumpIds: ['d1'], title: 'X' }],
        unprocessed: [
          { dumpId: 'd1', reason: 'çift' },
          { dumpId: 'd2', reason: 'Hangi derse ait belirsiz' },
          { dumpId: 'd2', reason: 'tekrar' },
          { dumpId: 'dx', reason: 'bilinmeyen' },
        ],
      }),
      known,
    )
    expect(r.unprocessed).toEqual([
      { dumpId: 'd2', reason: 'Hangi derse ait belirsiz' },
      { dumpId: 'd3', reason: 'AI bu öğe için öneri üretmedi' },
    ])
  })

  it('bilinmeyen döküm ve not, çift bağlam reddedilir; sürüm yanlışsa hepsi', () => {
    const r = validateChanges(
      {
        version: 1,
        operations: [
          { op: 'append_to_note', sourceDumpIds: ['d1'], noteId: 'n9', appendMd: 'ek' },
          { op: 'create_task', sourceDumpIds: ['d9'], title: 'A' },
          { op: 'create_note', sourceDumpIds: ['d1'], title: 'A', bodyMd: '', context: { projectId: 'p1', courseId: 'c1' } },
        ],
      },
      known,
    )
    expect(r.operations).toHaveLength(0)
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'Bilinmeyen not: n9',
      'Bilinmeyen döküm: d9',
      'context: Bağlam ya proje ya ders olur',
    ])
    expect(() => validateChanges({ version: 2, operations: [] }, known)).toThrow(ChangesParseError)
  })
})
