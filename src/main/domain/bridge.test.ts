import { describe, expect, it } from 'vitest'
import {
  addClaudeBlock,
  addGitignoreLine,
  buildContext,
  CONTEXT_MAX_CHARS,
  decisionSummary,
  hasClaudeBlock,
  hasGitignoreLine,
  parseSessionReport,
  removeClaudeBlock,
  removeGitignoreLine,
  type ContextInput,
} from './bridge'

describe('CLAUDE.md bölümü', () => {
  const own = '# Runika\n\nKendi kurallarım.\n'
  it('eklenir, tekrar eklenince çoğalmaz, kaldırınca dosya eski haline döner', () => {
    const once = addClaudeBlock(own, '## SecondMind köprüsü\n\nOku.')
    expect(hasClaudeBlock(once)).toBe(true)
    expect(once.startsWith('# Runika\n\nKendi kurallarım.\n\n<!-- secondmind:başla -->')).toBe(true)
    const twice = addClaudeBlock(once, '## SecondMind köprüsü\n\nOku.')
    expect(twice).toBe(once)
    expect(removeClaudeBlock(twice)).toBe(own)
  })

  it('boş dosyaya eklenir, kaldırınca boş kalır', () => {
    const t = addClaudeBlock('', 'x')
    expect(removeClaudeBlock(t)).toBe('')
  })

  it('bölümden sonra Taha yazdıysa o korunur', () => {
    const t = addClaudeBlock(own, 'x') + '\n## Sonradan\n'
    expect(removeClaudeBlock(t)).toBe('# Runika\n\nKendi kurallarım.\n\n## Sonradan\n')
  })
})

describe('.gitignore', () => {
  it('işaretli satır eklenir ve sadece o silinir; zaten varsa dokunulmaz', () => {
    const base = 'Library/\nTemp/\n'
    const added = addGitignoreLine(base)
    expect(added).toBe('Library/\nTemp/\n\n# SecondMind köprüsü\n.secondmind/\n')
    expect(hasGitignoreLine(added)).toBe(true)
    expect(removeGitignoreLine(added)).toBe(base)
    expect(addGitignoreLine('.secondmind/\n')).toBe('.secondmind/\n')
    expect(removeGitignoreLine('.secondmind/\n')).toBe('.secondmind/\n')
  })
})

const REPORT = `---
tarih: 2026-09-27T14:30
sure_dk: 95
tamamlanan_gorevler: [01J8AAA, "01J8BBB"]   # BAGLAM.md'deki görev id'leri
sonraki_adim: "Boss fazı 2 müziğini hızlandır"
---
## Yapılanlar
- Menü sahnesinde ses geçişleri eklendi
## Yeni görev önerileri
- [ ] Ses ayarlarına müzik/efekt ayrı kaydırıcı ekle
## Sonra
- Pause menüsüne ses önizlemesi olabilir
## Açık sorunlar
- Pause menüsünde müzik tekrar baştan başlıyor
## Kararlar
- Müzik geçişleri için AudioMixer snapshot kullanılacak
`

describe('oturum raporu', () => {
  it('frontmatter ve bölümler', () => {
    const r = parseSessionReport(REPORT)
    expect(r.startedAt).toBe(new Date(2026, 8, 27, 14, 30).getTime())
    expect(r.minutes).toBe(95)
    expect(r.completedTaskIds).toEqual(['01J8AAA', '01J8BBB'])
    expect(r.nextStep).toBe('Boss fazı 2 müziğini hızlandır')
    expect(r.done).toEqual(['Menü sahnesinde ses geçişleri eklendi'])
    expect(r.taskSuggestions).toEqual(['Ses ayarlarına müzik/efekt ayrı kaydırıcı ekle'])
    expect(r.later).toEqual(['Pause menüsüne ses önizlemesi olabilir'])
    expect(r.issues).toEqual(['Pause menüsünde müzik tekrar baştan başlıyor'])
    expect(r.decisions).toEqual(['Müzik geçişleri için AudioMixer snapshot kullanılacak'])
  })

  it('frontmatter yoksa bölümler yine okunur; şablon "..." maddeleri atılır', () => {
    const r = parseSessionReport('## Yapılanlar\n- ...\n- bir şey\n')
    expect(r.startedAt).toBeNull()
    expect(r.done).toEqual(['bir şey'])
  })
})

describe('BAGLAM.md', () => {
  const input: ContextInput = {
    projectName: 'Runika',
    generatedAt: '29.09.2026 14:00',
    steps: [{ title: 'Ölüm paneli tuşları', reason: 'kritik hata', taskId: '01T1' }],
    milestone: {
      title: 'Demo',
      targetDate: '2026-10-20',
      daysLeft: 21,
      criteria: [
        { text: 'Tek tur oynanır', done: true },
        { text: 'Ses', done: false },
      ],
    },
    doing: [],
    todo: [{ id: '01T1', title: 'Ölüm paneli tuşları', kind: 'bug' }],
    criticalBugs: [{ id: '01T1', title: 'Ölüm paneli tuşları', playtest: 3 }],
    decisions: [{ title: 'AudioMixer snapshot', summary: 'geçişler için' }],
    leftOff: 'Boss yarım',
    uncommitted: 4,
    openDocs: ['.secondmind/dokumanlar/mimari.md'],
  }

  it('boş bölümler yazılmaz; id ve gerekçeler yer alır', () => {
    const md = buildContext(input)
    expect(md).toContain('1. Ölüm paneli tuşları (01T1) — kritik hata')
    expect(md).toContain('## Aktif kilometre taşı: Demo · hedef 2026-10-20, 21 gün')
    expect(md).toContain('- [x] Tek tur oynanır')
    expect(md).toContain('- 01T1 · Ölüm paneli tuşları · 3 test eden bildirdi')
    expect(md).not.toContain('## Yapılıyor')
    expect(md).toContain("## Commit'lenmemiş\n4 dosya")
  })

  it('bütçeyi aşmaz', () => {
    const big = {
      ...input,
      todo: Array.from({ length: 10 }, (_, i) => ({
        id: `id${i}`,
        title: 'x'.repeat(900),
        kind: 'task',
      })),
    }
    expect(buildContext(big).length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS)
  })

  it('ADR özeti "## Karar" bölümünün ilk satırı', () => {
    expect(
      decisionSummary('**Tarih:** x\n\n## Bağlam\n\nA\n\n## Karar\n\nSnapshot kullan.\n\n## Sonuç'),
    ).toBe('Snapshot kullan.')
    expect(decisionSummary('düz metin')).toBe('')
  })
})
