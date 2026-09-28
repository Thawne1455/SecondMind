import { describe, expect, it } from 'vitest'
import {
  firstImageUrl,
  ftsQuery,
  normalizeTag,
  normalizeTags,
  notePreview,
  parseSnippet,
  SNIPPET_CLOSE as C,
  SNIPPET_OPEN as O,
  stripMarkdown,
} from './knowledge'

describe('normalizeTag', () => {
  it('Türkçe küçük harfe çevirir, # ve fazla boşluğu atar', () => {
    expect(normalizeTag('  #IŞIK  Ayarı ')).toBe('ışık ayarı')
    expect(normalizeTag('İstanbul')).toBe('istanbul')
    expect(normalizeTag('   ')).toBe('')
  })

  it('tekrarları ve boşları atar, sırayı korur', () => {
    expect(normalizeTags(['Oyun', 'oyun', '', 'Shader', '#OYUN'])).toEqual(['oyun', 'shader'])
  })
})

describe('stripMarkdown / notePreview', () => {
  it('başlık, liste, onay kutusu, alıntı, vurgu ve kodu düz metne indirger', () => {
    const md = [
      '# Runika ses',
      '',
      '- [x] **efekt** listesi',
      '- [ ] _müzik_ ara',
      '> alıntı `kod`',
      '1. bir',
      '```ts',
      'const a = 1',
      '```',
    ].join('\n')
    expect(stripMarkdown(md)).toBe('Runika ses efekt listesi müzik ara alıntı kod bir const a = 1')
  })

  it('resmi atar, bağlantının metnini tutar, snake_case bozulmaz', () => {
    expect(stripMarkdown('![](sm-media://m/a.png) bak: [doküman](https://x.dev) my_var_name')).toBe(
      'bak: doküman my_var_name',
    )
  })

  it('uzun metni üç noktayla keser', () => {
    const preview = notePreview('kelime '.repeat(100), 20)
    expect(preview.length).toBeLessThanOrEqual(20)
    expect(preview.endsWith('…')).toBe(true)
  })
})

describe('firstImageUrl', () => {
  it('önekle eşleşen ilk resmi bulur, dış adresleri atlar', () => {
    const md =
      '![](https://x.dev/a.png)\n\ntext ![şema](sm-media://m/b.png "başlık") ![](sm-media://m/c.png)'
    expect(firstImageUrl(md, 'sm-media://m/')).toBe('sm-media://m/b.png')
    expect(firstImageUrl('resim yok', 'sm-media://m/')).toBeNull()
  })
})

describe('ftsQuery', () => {
  it('kelimeleri tırnaklar, son kelimeye önek ekler', () => {
    expect(ftsQuery('ses ef')).toBe('"ses" "ef"*')
    expect(ftsQuery('Işık')).toBe('"Işık"*')
  })

  it('FTS operatörlerini ve noktalamayı etkisizleştirir', () => {
    expect(ftsQuery('a OR "b" NEAR(c) -d*')).toBe('"a" "OR" "b" "NEAR" "c" "d"*')
    expect(ftsQuery('  ***  ')).toBeNull()
  })
})

describe('parseSnippet', () => {
  it('işaretçileri aralığa çevirir ve markdown temizler', () => {
    const { text, ranges } = parseSnippet(`…**${O}ses${C}** efekti ${O}ses${C}li…`)
    expect(text).toBe('…ses efekti sesli…')
    expect(ranges).toEqual([
      [1, 4],
      [12, 15],
    ])
  })

  it('ortasından kesilmiş resim sözdiziminden adres bırakmaz', () => {
    expect(
      parseSnippet(`…sm-media://m/064d5f8a.png)

## ${O}Ses${C} planı`).text,
    ).toBe('… Ses planı')
  })

  it('kesilmiş işaretçileri tolere eder', () => {
    expect(parseSnippet(`ab${C}cd ${O}ef`)).toEqual({ text: 'abcd ef', ranges: [[5, 7]] })
  })
})
