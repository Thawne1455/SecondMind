import { MarkdownManager } from '@tiptap/markdown'
import { describe, expect, it } from 'vitest'
import { docSchemaExtensions } from '../bilgi/editorExtensions'

const md = new MarkdownManager({ extensions: docSchemaExtensions })
const roundTrip = (text: string) => md.serialize(md.parse(text))

describe('doküman gövdesi markdown gidiş-dönüş', () => {
  it('tablo korunur, hücreler hizalanır, ikinci turda değişmez', () => {
    const text = [
      '| Parça | Sahne | Süre |',
      '| --- | --- | --- |',
      '| Menü | Menu | 1:20 |',
      '| Boss | Boss | 2:10 |',
    ].join('\n')
    const once = roundTrip(text)
    expect(once.trim().split('\n')).toEqual([
      '| Parça | Sahne | Süre |',
      '| ----- | ----- | ---- |',
      '| Menü  | Menu  | 1:20 |',
      '| Boss  | Boss  | 2:10 |',
    ])
    expect(roundTrip(once)).toBe(once)
  })

  it('başlık ve liste yine kayıpsız', () => {
    const text = '## Mekanikler\n\n- zıplama\n- rün'
    expect(roundTrip(text)).toBe(text)
  })
})
