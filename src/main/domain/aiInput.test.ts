import { describe, expect, it } from 'vitest'
import {
  buildJobInput,
  inputSummary,
  splitByModel,
  type AiContext,
  type AiJobDump,
} from './aiInput'

const now = new Date(2026, 9, 1, 10, 30) // Perşembe

const ctx: AiContext = {
  now,
  profile: 'Bilgisayar mühendisliği 3. sınıf, Unity ile oyun geliştiriyor.',
  projects: [
    {
      id: 'p1',
      name: 'Runika',
      nextStep: 'Menü müziği',
      milestone: { title: 'Demo', targetDate: '2026-11-01' },
    },
    { id: 'p2', name: 'SecondMind', nextStep: '', milestone: null },
  ],
  courses: [
    {
      id: 'c1',
      name: 'Lineer Cebir',
      code: 'MAT201',
      exams: [{ title: 'Vize', day: '2026-11-02' }],
    },
  ],
  notes: [{ id: 'n1', title: 'Runika müzik fikirleri', collection: 'Fikirler' }],
}

const dump = (id: string, content: string, files = 0): AiJobDump => ({
  id,
  content,
  createdAt: new Date(2026, 8, 28, 14, 5),
  attachments: Array.from({ length: files }, (_, i) => ({
    fileName: `h${i}.png`,
    originalName: `tahta${i}.png`,
    mime: 'image/png',
  })),
})

describe('buildJobInput', () => {
  it('bugün, önümüzdeki günler, bağlam ve dökümler pakette', () => {
    const r = buildJobInput(ctx, [dump('d1', 'yarın hocaya mail at\nbi de Runika müziği uzun', 1)])
    expect(r.markdown).toContain('Bugün: 2026-10-01 Perşembe 10:30')
    expect(r.markdown).toContain('2026-10-02 Cuma')
    expect(r.markdown).toContain(
      'Runika [id: p1] · sıradaki adım: Menü müziği · açık kilometre taşı: Demo (hedef 2026-11-01)',
    )
    expect(r.markdown).toContain('Lineer Cebir (MAT201) [id: c1] · yaklaşan sınav: Vize 2026-11-02')
    expect(r.markdown).toContain('### Döküm [id: d1] · yazıldı: 2026-09-28 Pazartesi 14:05')
    expect(r.markdown).toContain('> yarın hocaya mail at\n> bi de Runika müziği uzun')
    expect(r.markdown).toContain('Ek: media/h0.png (tahta0.png, image/png)')
    expect(r.trimmed).toBe(false)
    expect([...r.known.projectIds]).toEqual(['p1', 'p2'])
    expect([...r.known.dumpIds]).toEqual(['d1'])
  })

  it('bütçe aşılınca bağlam sondan düşer, dökümler ve id listesi tutarlı kalır', () => {
    const many: AiContext = {
      ...ctx,
      notes: Array.from({ length: 200 }, (_, i) => ({
        id: `n${i}`,
        title: `Uzun bir not başlığı ${i}`,
        collection: null,
      })),
    }
    const r = buildJobInput(many, [dump('d1', 'x'.repeat(20_000))], 600)
    expect(r.trimmed).toBe(true)
    expect(r.known.noteIds.size).toBeLessThan(200)
    expect(r.known.projectIds.has('p1')).toBe(true)
    expect(r.markdown).toContain('x'.repeat(20_000))
    for (const id of r.known.noteIds) expect(r.markdown).toContain(`[id: ${id}]`)
    expect(r.markdown).not.toContain(`[id: n199]`)
  })

  it('boş bölüm "(yok)" yazar', () => {
    const r = buildJobInput({ ...ctx, profile: '', courses: [] }, [dump('d1', 'a')])
    expect(r.markdown).not.toContain('Taha hakkında')
    expect(r.markdown).toContain('## Bu dönemin dersleri\n(yok)')
  })
})

describe('splitByModel', () => {
  const items = [dump('a', 'metin'), dump('b', 'resimli', 1)]
  it('HIZLI: ekli döküm DERİN’e gider', () => {
    expect(splitByModel(items, 'fast').map((g) => [g.model, g.dumps.map((d) => d.id)])).toEqual([
      ['fast', ['a']],
      ['deep', ['b']],
    ])
  })
  it('DERİN: hepsi tek grup; boş girdi grup üretmez', () => {
    expect(splitByModel(items, 'deep')).toHaveLength(1)
    expect(splitByModel([], 'fast')).toEqual([])
    expect(splitByModel([items[0]!], 'fast').map((g) => g.model)).toEqual(['fast'])
  })
})

it('inputSummary', () => {
  expect(inputSummary([dump('a', 'x'), dump('b', 'y', 2)])).toBe('2 döküm · 2 ek')
})
