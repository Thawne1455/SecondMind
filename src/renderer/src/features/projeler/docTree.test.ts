import { describe, expect, it } from 'vitest'
import type { DocSummary } from '@shared/ipc'
import { dropZone, moveTarget, visibleRows } from './docTree'

const doc = (id: string, parentId: string | null, sort: number): DocSummary => ({
  id,
  parentId,
  sort,
  title: id,
  kind: 'page',
  linkedPath: null,
  aiOpen: false,
  updatedAt: 0,
})

const docs = [
  doc('b', null, 1),
  doc('a', null, 0),
  doc('a2', 'a', 1),
  doc('a1', 'a', 0),
  doc('x', 'gone', 0),
]

describe('doküman ağacı', () => {
  it('kök sırasıyla, alt sayfalar derinlikle; sahipsiz köke düşer', () => {
    expect(visibleRows(docs, new Set()).map((r) => `${r.doc.id}:${r.depth}`)).toEqual([
      'a:0',
      'a1:1',
      'a2:1',
      'x:0',
      'b:0',
    ])
  })

  it('kapalı düğümün altı gizlenir', () => {
    const rows = visibleRows(docs, new Set(['a']))
    expect(rows.map((r) => r.doc.id)).toEqual(['a', 'x', 'b'])
    expect(rows.find((r) => r.doc.id === 'a')!.hasChildren).toBe(true)
  })

  it('bırakma bölgesi', () => {
    expect(dropZone(2, 40)).toBe('before')
    expect(dropZone(20, 40)).toBe('inside')
    expect(dropZone(38, 40)).toBe('after')
  })

  it('hedef: önüne, arkasına, içine; kendi altına değil', () => {
    expect(moveTarget(docs, 'b', 'a', 'before')).toEqual({ parentId: null, index: 0 })
    expect(moveTarget(docs, 'b', 'a1', 'after')).toEqual({ parentId: 'a', index: 1 })
    expect(moveTarget(docs, 'b', 'a', 'inside')).toEqual({ parentId: 'a', index: 2 })
    expect(moveTarget(docs, 'a', 'a1', 'inside')).toBeNull()
    expect(moveTarget(docs, 'a', 'a', 'after')).toBeNull()
  })
})
