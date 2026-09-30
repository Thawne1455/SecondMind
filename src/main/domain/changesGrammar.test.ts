import { describe, expect, it } from 'vitest'
import { OPERATION_KINDS, operationSchema } from '@shared/schemas/ai'
import { CHANGES_GRAMMAR, OPERATION_GRAMMARS } from './changesGrammar'

describe('changes grammar', () => {
  it('her işlem türü için bir dal var', () => {
    expect(OPERATION_GRAMMARS.map((g) => g.properties.op.const)).toEqual(OPERATION_KINDS)
  })

  it('alanlar zod şemasıyla aynı', () => {
    for (const option of operationSchema.options) {
      const grammar = OPERATION_GRAMMARS.find(
        (g) => g.properties.op.const === option.shape.op.value,
      )!
      expect(Object.keys(grammar.properties).sort()).toEqual(Object.keys(option.shape).sort())
    }
  })

  it('dış kabuk version, operations, unprocessed', () => {
    expect(Object.keys(CHANGES_GRAMMAR.properties)).toEqual([
      'version',
      'operations',
      'unprocessed',
    ])
  })
})
