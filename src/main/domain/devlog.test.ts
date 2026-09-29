import { describe, expect, it } from 'vitest'
import {
  buildDevlog,
  cleanCommit,
  commitItems,
  devlogBbcode,
  devlogMarkdown,
  hoursText,
  type DevlogInput,
} from './devlog'

const input: DevlogInput = {
  projectName: 'Runika',
  week: 39,
  sessions: 6,
  minutes: 660,
  milestones: ['Demo'],
  tasks: [
    { title: 'Ölüm paneli tuşları', kind: 'bug' },
    { title: 'Envanter ekranı', kind: 'task' },
  ],
  commits: [
    'Merge branch main',
    'wip',
    'Ses: menü geçişleri',
    'Ses: boss müziği döngüsü',
    'Envanter ekranı',
    'Yeni silah: orbit\n\nuzun açıklama',
    'fix typo',
  ],
  next: ['Boss fazı 2 müziği', 'Menü müziğini kırp', 'Playtest build', 'Dördüncü'],
  images: ['sm-media://m/a.png'],
}

describe('commit temizliği', () => {
  it('merge, gürültü ve tek kelimelik mesajlar atılır; ilk satır alınır', () => {
    expect(cleanCommit('Merge pull request #3')).toBeNull()
    expect(cleanCommit('wip')).toBeNull()
    expect(cleanCommit('Fix typo')).toBeNull()
    expect(cleanCommit('refactor')).toBeNull()
    expect(cleanCommit('Yeni silah: orbit\n\nuzun')).toBe('Yeni silah: orbit')
  })

  it('aynı başlangıçlı mesajlar birleşir', () => {
    expect(commitItems(input.commits)).toEqual([
      'Ses: menü geçişleri (2 commit)',
      'Envanter ekranı',
      'Yeni silah: orbit',
    ])
  })

  it('saat metni', () => {
    expect(hoursText(45)).toBe('45 dk')
    expect(hoursText(660)).toBe('11 saat')
    expect(hoursText(90)).toBe('1,5 saat')
  })
})

describe('devlog taslağı', () => {
  it('özet, yeni (taş + görev + görevde olmayan commit), düzeltilen, sırada (en fazla 3)', () => {
    const d = buildDevlog(input)
    expect(d.title).toBe('Runika · Hafta 39')
    expect(d.summary).toBe('Bu hafta 6 oturum, 11 saat; 2 iş bitti.')
    expect(d.newItems).toEqual([
      'Kilometre taşı tamam: Demo',
      'Envanter ekranı',
      'Ses: menü geçişleri (2 commit)',
      'Yeni silah: orbit',
    ])
    expect(d.fixed).toEqual(['Ölüm paneli tuşları'])
    expect(d.next).toHaveLength(3)
    expect(d.empty).toBe(false)
  })

  it('Markdown ve BBCode', () => {
    const d = buildDevlog(input)
    const md = devlogMarkdown(d)
    expect(md.split('\n').slice(0, 5)).toEqual([
      '# Runika · Hafta 39',
      '',
      'Bu hafta 6 oturum, 11 saat; 2 iş bitti.',
      '',
      '## Yeni',
    ])
    expect(md).toContain('## Düzeltilen hatalar\n- Ölüm paneli tuşları')
    expect(md.endsWith('![](sm-media://m/a.png)')).toBe(true)
    const bb = devlogBbcode(d)
    expect(bb.startsWith('[h1]Runika · Hafta 39[/h1]')).toBe(true)
    expect(bb).toContain('[list]\n[*]Ölüm paneli tuşları\n[/list]')
    expect(bb).toContain('[img]sm-media://m/a.png[/img]')
  })

  it('kayıt yoksa boş', () => {
    const d = buildDevlog({
      ...input,
      sessions: 0,
      minutes: 0,
      milestones: [],
      tasks: [],
      commits: ['wip'],
    })
    expect(d.empty).toBe(true)
  })
})
