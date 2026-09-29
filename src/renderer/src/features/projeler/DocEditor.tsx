import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extensions'
import { useNavigate } from 'react-router'
import { Bot, ExternalLink, FileText, MoreHorizontal, Table as TableIcon } from 'lucide-react'
import { DOC_TITLE_MAX, type Doc, type ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, Chip, cn, IconButton, Menu, Tag, useToast } from '../../ui'
import { docSchemaExtensions } from '../bilgi/editorExtensions'
import { imageFiles, insertImages, STATUS_TEXT } from '../bilgi/editorMedia'
import { Toolbar } from '../bilgi/NoteEditor'
import '../bilgi/note-body.css'
import { KIND_TAG } from './docTree'
import { docKeys, useDeleteDoc, useDocAutosave, useRestoreDoc, useUpdateDoc } from './useDocs'

// Doküman sayfası (5d-1): Bilgi editörünün dili + tablo. Bağlı dosya salt okunur gösterilir ("Klasörde düzenle").
// Şeritte tür (GDD / Karar), Claude Code'a açık işareti, kayıt durumu ve menü (GDD işaretle, sil).

export function DocEditor({ project, doc }: { project: ProjectSummary; doc: Doc }) {
  return doc.readOnly ? (
    <LinkedDoc project={project} doc={doc} />
  ) : (
    <EditableDoc project={project} doc={doc} />
  )
}

function EditableDoc({ project, doc }: { project: ProjectSummary; doc: Doc }) {
  const { status, schedule, flush } = useDocAutosave(doc.id)
  const [title, setTitle] = useState(doc.title)
  const titleRef = useRef<HTMLInputElement>(null)
  const scheduleRef = useRef(schedule)
  useEffect(() => {
    scheduleRef.current = schedule
  }, [schedule])
  const { toast } = useToast()
  const onImageError = (e: unknown) =>
    toast({ message: `Resim eklenemedi: ${errorText(e)}`, domain: 'warning' })

  const editor = useEditor({
    extensions: [
      ...docSchemaExtensions,
      Markdown,
      Placeholder.configure({ placeholder: 'Yazmaya başla… (# başlık, - liste, | tablo |)' }),
    ],
    content: doc.bodyMd,
    contentType: 'markdown',
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'note-body', 'aria-label': 'Sayfa gövdesi' },
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

  useEffect(() => {
    if (!doc.title && !doc.bodyMd) titleRef.current?.focus()
  }, [doc.title, doc.bodyMd])

  return (
    <article className="flex min-h-0 min-w-0 grow flex-col gap-4">
      <DocStrip project={project} doc={doc} beforeDelete={flush}>
        <span
          role="status"
          className={cn(
            'text-[13px] font-semibold',
            status === 'error' ? 'text-t-coral' : 'text-ink3',
          )}
        >
          {STATUS_TEXT[status]}
        </span>
      </DocStrip>
      <div className="flex w-full max-w-[860px] flex-col gap-3 pb-10">
        <input
          ref={titleRef}
          value={title}
          maxLength={DOC_TITLE_MAX}
          placeholder="Sayfa başlığı"
          aria-label="Başlık"
          onChange={(e) => {
            setTitle(e.target.value)
            schedule({ title: e.target.value })
          }}
          onBlur={() => void flush()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.shiftKey)) {
              e.preventDefault()
              editor.commands.focus('start')
            }
          }}
          className="w-full border-0 bg-transparent text-[28px] leading-[1.2] font-extrabold text-ink outline-none placeholder:text-ink3"
        />
        <Toolbar editor={editor}>
          <span className="mx-1 w-0.5 self-stretch bg-s2" aria-hidden />
          <button
            type="button"
            title="Tablo ekle (3 × 3)"
            aria-label="Tablo ekle"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            className="grid size-8 cursor-pointer place-items-center rounded-full text-ink2 transition-colors duration-150 hover:bg-s2 hover:text-ink focus-visible:outline-3 focus-visible:outline-indigo"
          >
            <TableIcon size={17} strokeWidth={1.75} aria-hidden />
          </button>
        </Toolbar>
        <EditorContent editor={editor} />
      </div>
    </article>
  )
}

/** Bağlı dosya: diskten okunan markdown, düzenlenemez editörde. */
function LinkedDoc({ project, doc }: { project: ProjectSummary; doc: Doc }) {
  const { toast } = useToast()
  const editor = useEditor(
    {
      extensions: [...docSchemaExtensions, Markdown],
      content: doc.bodyMd,
      contentType: 'markdown',
      editable: false,
      editorProps: { attributes: { class: 'note-body', 'aria-label': 'Bağlı dosya' } },
    },
    [doc.bodyMd],
  )
  return (
    <article className="flex min-h-0 min-w-0 grow flex-col gap-4">
      <DocStrip project={project} doc={doc}>
        <Button
          size="sm"
          variant="secondary"
          icon={ExternalLink}
          disabled={doc.missing}
          onClick={() =>
            void window.api
              .invoke('doc:openFile', { id: doc.id })
              .catch((e: unknown) => toast({ message: errorText(e), domain: 'warning' }))
          }
        >
          Klasörde düzenle
        </Button>
      </DocStrip>
      <div className="flex w-full max-w-[860px] flex-col gap-3 pb-10">
        <h2 className="m-0 text-[28px] leading-[1.2] font-extrabold">{doc.title}</h2>
        <span className="flex items-center gap-1.5 font-mono text-[13px] font-semibold text-ink3">
          <FileText size={14} strokeWidth={1.75} aria-hidden />
          {doc.linkedPath}
        </span>
        {doc.missing ? (
          <p className="m-0 rounded-tile bg-coral px-5 py-4 font-bold text-white">
            Dosya bulunamadı. Taşındıysa bu sayfayı sil ve yeni yerinden yeniden bağla.
          </p>
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
    </article>
  )
}

function DocStrip({
  project,
  doc,
  beforeDelete,
  children,
}: {
  project: ProjectSummary
  doc: Doc
  beforeDelete?: () => Promise<void>
  children?: ReactNode
}) {
  const update = useUpdateDoc()
  const remove = useDeleteDoc()
  const restore = useRestoreDoc()
  const navigate = useNavigate()
  const client = useQueryClient()
  const { toast } = useToast()
  const base = `/projeler/${project.id}/dokumanlar`
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const tag = KIND_TAG[doc.kind]

  const items = [
    doc.kind === 'gdd'
      ? { id: 'ungdd', label: 'GDD işaretini kaldır' }
      : {
          id: 'gdd',
          label: 'GDD olarak işaretle',
          description: 'Karşılaştırma bu sayfayı ve alt sayfalarını okur',
        },
    ...(doc.readOnly ? [{ id: 'reload', label: 'Diskten yeniden oku' }] : []),
    { id: 'delete', label: doc.readOnly ? 'Bağlantıyı kaldır' : 'Çöp kutusuna at' },
  ]

  async function onMenu(id: string) {
    if (id === 'gdd' || id === 'ungdd')
      update.mutate({ id: doc.id, kind: id === 'gdd' ? 'gdd' : 'page' }, { onError })
    else if (id === 'reload') await client.invalidateQueries({ queryKey: docKeys.one(doc.id) })
    else if (id === 'delete') {
      await beforeDelete?.()
      remove.mutate(doc.id, {
        onSuccess: () => {
          void navigate(base)
          toast({
            domain: 'projects',
            message: doc.readOnly
              ? `"${doc.title}" bağlantısı kaldırıldı; dosya yerinde.`
              : `"${doc.title || 'Adsız sayfa'}" ve alt sayfaları çöp kutusunda.`,
            action: {
              label: 'Geri al',
              onClick: () =>
                restore.mutate(doc.id, { onSuccess: () => void navigate(`${base}/${doc.id}`) }),
            },
          })
        },
        onError,
      })
    }
  }

  return (
    <div className="flex min-h-[42px] shrink-0 flex-wrap items-center gap-2">
      {tag && (
        <Tag className="h-[34px]" fill={doc.kind === 'gdd' ? project.color : '#DAD5FF'}>
          {tag}
        </Tag>
      )}
      {doc.readOnly && <Tag className="h-[34px] bg-s2">Bağlı dosya · salt okunur</Tag>}
      <span className="grow" />
      {children}
      <Chip
        selected={doc.aiOpen}
        title="Claude Code köprüsü bu sayfayı dışa verir (5e)"
        onClick={() => update.mutate({ id: doc.id, aiOpen: !doc.aiOpen }, { onError })}
      >
        <Bot size={15} strokeWidth={1.75} aria-hidden className="mr-1.5" />
        Claude Code'a açık
      </Chip>
      <Menu
        align="end"
        label="Sayfa menüsü"
        items={items}
        onSelect={(id) => void onMenu(id)}
        trigger={(props) => <IconButton {...props} label="Sayfa menüsü" icon={MoreHorizontal} />}
      />
    </div>
  )
}
