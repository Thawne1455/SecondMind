import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extensions'
import { CircleHelp } from 'lucide-react'
import type { Note } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, cn, useToast } from '../../ui'
import { noteSchemaExtensions } from '../bilgi/editorExtensions'
import { imageFiles, insertImages, STATUS_TEXT } from '../bilgi/editorMedia'
import { Toolbar } from '../bilgi/NoteEditor'
import { useAutosave } from '../bilgi/useAutosave'
import '../bilgi/note-body.css'

// Haftanın ders notu: Bilgi'nin editörü ve kaydı (markdown, resim yapıştırma), ama koleksiyon/etiket şeridi
// yok. Araç çubuğunda "Anlamadım": imlecin bulunduğu paragraf (ya da seçili metin) işaret olur ve
// "hocaya sor" listesine düşer.

export function WeekNoteEditor({ note, onFlag }: { note: Note; onFlag: (excerpt: string) => void }) {
  const { status, schedule, flush } = useAutosave(note.id)
  const scheduleRef = useRef(schedule)
  useEffect(() => {
    scheduleRef.current = schedule
  }, [schedule])
  const { toast } = useToast()
  const onImageError = (e: unknown) => toast({ message: `Resim eklenemedi: ${errorText(e)}`, domain: 'warning' })

  const editor = useEditor({
    extensions: [
      ...noteSchemaExtensions,
      Markdown,
      Placeholder.configure({ placeholder: 'Bu haftanın ders notu… Tahta fotoğrafını yapıştırabilirsin.' }),
    ],
    content: note.bodyMd,
    contentType: 'markdown',
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'note-body', 'aria-label': 'Hafta notu' },
      handlePaste: (view, event) => {
        const files = imageFiles(event.clipboardData?.files)
        if (!files.length) return false
        void insertImages(view, files, undefined, onImageError)
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const files = imageFiles(event.dataTransfer?.files)
        if (!files.length) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        void insertImages(view, files, pos, onImageError)
        return true
      },
    },
    onUpdate: ({ editor }) => scheduleRef.current({ bodyMd: editor.getMarkdown() }),
    onBlur: () => void flush(),
  })

  function flagHere() {
    const { state } = editor
    const { from, to, $from } = state.selection
    const selected = state.doc.textBetween(from, to, ' ').trim()
    const excerpt = (selected || $from.parent.textContent).trim()
    if (!excerpt) {
      toast({ message: 'Önce anlamadığın paragrafa tıkla ya da metni seç.', domain: 'school' })
      return
    }
    onFlag(excerpt.slice(0, 600))
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <Toolbar editor={editor}>
        <span className="grow" />
        <span
          role="status"
          className={cn('self-center text-[13px] font-semibold', status === 'error' ? 'text-t-coral' : 'text-ink3')}
        >
          {STATUS_TEXT[status]}
        </span>
        <Button
          size="xs"
          variant="secondary"
          icon={CircleHelp}
          onMouseDown={(e) => e.preventDefault()}
          onClick={flagHere}
          title="İmlecin olduğu paragrafı 'anlamadım' diye işaretle"
        >
          Anlamadım
        </Button>
      </Toolbar>
      <EditorContent editor={editor} />
    </div>
  )
}
