import { describe, expect, it } from 'vitest'
import { proposalSummary } from './proposalSummary'

describe('proposalSummary', () => {
  it('başlığı olan işlemde başlığı döndürür', () => {
    expect(
      proposalSummary(JSON.stringify({ op: 'create_task', title: 'Menü müziğini kırp' })),
    ).toBe('Menü müziğini kırp')
  })

  it('başlıksız işlemde metni kullanır', () => {
    expect(
      proposalSummary(JSON.stringify({ op: 'set_project_next_step', text: 'Boss fazını dene' })),
    ).toBe('Boss fazını dene')
  })

  it('nota eklemede markdown işaretlerini atıp ilk dolu satırı alır', () => {
    expect(
      proposalSummary(JSON.stringify({ op: 'append_to_note', appendMd: '\n## Soru 4\n- detay' })),
    ).toBe('Soru 4')
  })

  it('uzun metni kısaltır', () => {
    const out = proposalSummary(JSON.stringify({ title: 'a'.repeat(300) }))
    expect(out).toHaveLength(120)
    expect(out.endsWith('…')).toBe(true)
  })

  it('bozuk ya da boş yükte boş döner', () => {
    expect(proposalSummary('{bozuk')).toBe('')
    expect(proposalSummary('null')).toBe('')
    expect(proposalSummary(JSON.stringify({ title: '  ' }))).toBe('')
  })
})
