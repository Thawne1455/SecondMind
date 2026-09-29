import type { EditorView } from '@tiptap/pm/view'
import type { SaveStatus } from './useAutosave'

// Not ve doküman editörlerinin ortak parçaları: resim yapıştırma/bırakma ve kayıt durumu metni.

export const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Kaydedildi',
  pending: 'Kaydediliyor…',
  error: 'Kaydedilemedi',
}

export function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
}

/** Resmi `media/`'ya yazar ve `sm-media://` adresiyle editöre ekler (markdown'da `![](…)`). */
export async function insertImages(
  view: EditorView,
  files: File[],
  pos: number | undefined,
  onError: (e: unknown) => void,
): Promise<void> {
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const { url } = await window.api.invoke('media:store', {
        name: file.name || 'resim.png',
        mime: file.type,
        bytes,
      })
      if (view.isDestroyed) return
      const node = view.state.schema.nodes['image']?.create({ src: url, alt: '' })
      if (!node) return
      const tr =
        pos === undefined
          ? view.state.tr.replaceSelectionWith(node)
          : view.state.tr.insert(pos, node)
      view.dispatch(tr.scrollIntoView())
      if (pos !== undefined) pos += node.nodeSize
    } catch (e) {
      onError(e)
    }
  }
}
