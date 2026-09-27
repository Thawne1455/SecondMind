import { MarkdownManager } from '@tiptap/markdown'
import { describe, expect, it } from 'vitest'
import { noteSchemaExtensions } from './editorExtensions'

const md = new MarkdownManager({ extensions: noteSchemaExtensions })
const roundTrip = (text: string) => md.serialize(md.parse(text))

describe('not gövdesi markdown gidiş-dönüş', () => {
  it.each([
    ['başlıklar', '# Runika\n\n## Ses\n\n### Efektler'],
    ['madde listesi', '- bir\n- iki\n  - iç içe'],
    ['numaralı liste', '1. bir\n2. iki'],
    ['onay listesi', '- [ ] ses efekti ara\n- [x] müzik bitti'],
    ['kod bloğu', '```ts\nconst ışık = 1\n```'],
    ['satır içi', '**kalın**, *eğik*, ~~üstü çizili~~ ve `kod`'],
    ['alıntı', '> Taha döker, SecondMind düzenler.'],
    ['resim', '![tahta](sm-media://m/abc123.png)'],
    ['bağlantı', '[doküman](https://docs.unity3d.com)'],
  ])('%s kayıpsız', (_, text) => {
    expect(roundTrip(text)).toBe(text)
  })

  it('karışık not ikinci turda değişmez', () => {
    const text = [
      '# Haftalık',
      '',
      'Paragraf **kalın** [bağlantı](https://x.dev).',
      '',
      '- [ ] görev',
      '',
      '> alıntı',
      '',
      '![](sm-media://m/a.png)',
    ].join('\n')
    const once = roundTrip(text)
    expect(once).toBe(text)
    expect(roundTrip(once)).toBe(once)
  })
})
