import type { AnyExtension } from '@tiptap/core'
import { Image } from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { StarterKit } from '@tiptap/starter-kit'

/**
 * Not gövdesinin şeması; editör ve markdown testi aynı listeyi kullanır.
 * Markdown'da karşılığı olmayan biçimler (altı çizili) kapalı: kaydederken kaybolmasın.
 */
export const noteSchemaExtensions: AnyExtension[] = [
  StarterKit.configure({
    underline: false,
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true },
  }),
  Image.configure({ inline: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
]
