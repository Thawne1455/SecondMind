import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compareGdd } from './gdd'

let dir: string

const touch = (...parts: string[]) => {
  mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true })
  writeFileSync(join(dir, ...parts), '')
}

const GDD = [
  '## İçerik özeti',
  '',
  '| Öğe | Sayı |',
  '| --- | --- |',
  '| Silah | 8 |',
  '| Düşman tipi | 2 |',
  '',
  '## Sahneler',
  '',
  '- Menü',
  '- Oyun',
].join('\n')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sm-gdd-'))
  touch('Assets', 'Data', 'Weapons', 'Kilic.asset')
  touch('Assets', 'Data', 'Weapons', 'Kilic.asset.meta')
  touch('Assets', 'Data', 'Weapons', 'Yay.asset')
  touch('Assets', 'Data', 'Weapons', 'Asa.asset')
  touch('Assets', 'Data', 'Enemies', 'Iskelet.asset')
  touch('Assets', 'Data', 'Enemies', 'Yarasa.asset')
  touch('Assets', 'Scenes', 'Menu.unity')
  touch('Assets', 'Scenes', 'Game.unity')
  touch('Library', 'Weapons', 'Cache.asset')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('GDD ile klasör', () => {
  it('kuralsız etiketlere öneri, sahneler hazır sayımla eşit', async () => {
    const r = await compareGdd({
      docId: 'd',
      markdown: GDD,
      folders: [dir],
      unity: true,
      rules: [],
    })
    expect(r.rows.find((x) => x.label === 'Sahneler')).toMatchObject({ folder: 2, state: 'equal' })
    expect(r.rows.find((x) => x.label === 'Silah')!.state).toBe('unknown')
    expect(r.suggestions).toEqual([
      { label: 'Silah', glob: 'Assets/Data/Weapons/*.asset', count: 3 },
      { label: 'Düşman tipi', glob: 'Assets/Data/Enemies/*.asset', count: 2 },
    ])
  })

  it('kural varsa sayısı kullanılır; Library yok sayılır', async () => {
    const r = await compareGdd({
      docId: 'd',
      markdown: GDD,
      folders: [dir],
      unity: true,
      rules: [{ label: 'Silah', glob: '**/Weapons/*.asset' }],
    })
    expect(r.rows[0]).toMatchObject({
      label: 'Silah',
      folder: 3,
      state: 'missing',
      text: "GDD'de 8 silah, klasörde 3",
    })
  })
})
