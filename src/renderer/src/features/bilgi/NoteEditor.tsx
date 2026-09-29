import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extensions'
import {
  Bold,
  ChevronDown,
  Code,
  Heading2,
  List,
  ListChecks,
  MoreHorizontal,
  Quote,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { Note } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, Chip, cn, DOMAIN_FILL, IconButton, Menu, Tag, useToast } from '../../ui'
import { noteSchemaExtensions } from './editorExtensions'
import { ideaStageLabel, UNTITLED_IDEA, useIdeaDecision } from './ideas'
import { imageFiles, insertImages, STATUS_TEXT } from './editorMedia'
import { useAutosave, type SaveStatus } from './useAutosave'
import {
  useCollections,
  useDeleteNote,
  useRestoreNote,
  useTags,
  useUpdateNote,
} from './useKnowledge'
import './note-body.css'

/**
 * Sağ sütun: seçili notun şeridi, başlığı ve gövdesi. Not değişince `key` ile yeniden kurulur.
 * `basePath`: notun açıldığı yer (Bilgi ya da proje notları); silince oraya, geri alınca `basePath/id`'ye dönülür.
 */
export function NoteEditor({ note, basePath = '/bilgi' }: { note: Note; basePath?: string }) {
  const { status, schedule, flush } = useAutosave(note.id)
  const [title, setTitle] = useState(note.title)
  const titleRef = useRef<HTMLInputElement>(null)
  const scheduleRef = useRef(schedule)
  useEffect(() => {
    scheduleRef.current = schedule
  }, [schedule])
  const { toast } = useToast()

  const editor = useEditor({
    extensions: [
      ...noteSchemaExtensions,
      Markdown,
      Placeholder.configure({ placeholder: 'Yazmaya başla… (# başlık, - liste, [ ] onay kutusu)' }),
    ],
    content: note.bodyMd,
    contentType: 'markdown',
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'note-body', 'aria-label': 'Not gövdesi' },
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

  function onImageError(e: unknown) {
    toast({ message: `Resim eklenemedi: ${errorText(e)}`, domain: 'warning' })
  }

  // Radar sinyali: fikir her açılışta "açıldı" sayılır (log'a yazılmaz).
  const isIdea = !!note.idea
  useEffect(() => {
    if (isIdea) void window.api.invoke('idea:opened', { noteId: note.id }).catch(() => {})
  }, [isIdea, note.id])

  // Yeni (boş) not başlıktan başlar.
  useEffect(() => {
    if (!note.title && !note.bodyMd) titleRef.current?.focus()
  }, [note.title, note.bodyMd])

  return (
    <article className="flex min-h-0 grow flex-col gap-4">
      <NoteStrip note={note} status={status} beforeDelete={flush} basePath={basePath} />
      {note.idea && <IdeaStrip note={note} title={title} />}
      <div className="flex min-h-0 grow flex-col overflow-y-auto pb-10">
        <div className="flex w-full max-w-[720px] flex-col gap-3">
          <input
            ref={titleRef}
            value={title}
            maxLength={300}
            placeholder={note.idea ? 'Fikrin adı' : 'Başlık'}
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
          <Toolbar editor={editor} />
          <EditorContent editor={editor} />
        </div>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------- araç çubuğu

type ToolId = 'heading' | 'bold' | 'bulletList' | 'taskList' | 'blockquote' | 'codeBlock'

const TOOLS: { id: ToolId; label: string; icon: LucideIcon; run: (e: Editor) => void }[] = [
  {
    id: 'heading',
    label: 'Başlık',
    icon: Heading2,
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'bold',
    label: 'Kalın (Ctrl B)',
    icon: Bold,
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    id: 'bulletList',
    label: 'Liste',
    icon: List,
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'taskList',
    label: 'Onay listesi',
    icon: ListChecks,
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'blockquote',
    label: 'Alıntı',
    icon: Quote,
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'codeBlock',
    label: 'Kod',
    icon: Code,
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
]

export function Toolbar({ editor, children }: { editor: Editor; children?: ReactNode }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => Object.fromEntries(TOOLS.map((t) => [t.id, e.isActive(t.id)])),
  })
  return (
    <div role="toolbar" aria-label="Biçim" className="flex gap-1 border-b-2 border-s2 pb-2">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          aria-label={t.label}
          aria-pressed={!!active[t.id]}
          // Tıklama editör seçimini bozmasın.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => t.run(editor)}
          className={cn(
            'grid size-8 cursor-pointer place-items-center rounded-full transition-colors duration-150',
            'focus-visible:outline-3 focus-visible:outline-indigo',
            active[t.id] ? 'bg-ink text-on-ink' : 'text-ink2 hover:bg-s2 hover:text-ink',
          )}
        >
          <t.icon size={17} strokeWidth={1.75} aria-hidden />
        </button>
      ))}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- şerit

type NoteStripProps = {
  note: Note
  status: SaveStatus
  beforeDelete: () => Promise<void>
  basePath: string
}

function NoteStrip({ note, status, beforeDelete, basePath }: NoteStripProps) {
  const update = useUpdateNote()
  const remove = useDeleteNote()
  const restore = useRestoreNote()
  const navigate = useNavigate()
  const { toast } = useToast()
  const collections = useCollections().data ?? []

  const patch = (p: Omit<Parameters<typeof update.mutate>[0], 'id'>) =>
    update.mutate(
      { id: note.id, ...p },
      { onError: (e) => toast({ message: errorText(e), domain: 'warning' }) },
    )

  async function onDelete() {
    await beforeDelete()
    remove.mutate(note.id, {
      onSuccess: () => {
        void navigate(basePath)
        toast({
          variant: 'band',
          domain: 'knowledge',
          message: `"${noteTitle}" çöp kutusuna taşındı.`,
          action: {
            label: 'Geri al',
            onClick: () =>
              restore.mutate(note.id, { onSuccess: () => void navigate(`${basePath}/${note.id}`) }),
          },
        })
      },
    })
  }

  const current = collections.find((c) => c.id === note.collectionId)
  const noteTitle = note.title || (note.idea ? UNTITLED_IDEA : 'Adsız not')
  const menuItems = [
    { id: 'none', label: 'Koleksiyonsuz' },
    ...collections.map((c) => ({ id: c.id, label: c.name })),
  ]

  return (
    <div className="flex min-h-[42px] shrink-0 flex-wrap items-center gap-2">
      {/* Fikirler kendi bölümünde; koleksiyona taşınmaz. */}
      {note.idea ? (
        <Tag className="h-[34px] bg-ink text-on-ink">Fikir</Tag>
      ) : (
        <Menu
          label="Koleksiyon"
          items={menuItems}
          selectedId={note.collectionId ?? 'none'}
          onSelect={(id) => patch({ collectionId: id === 'none' ? null : id })}
          className="max-h-[360px] overflow-y-auto"
          trigger={(props) => (
            <button
              type="button"
              {...props}
              className={cn(
                'inline-flex h-[34px] max-w-[220px] cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold',
                'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
                current ? 'bg-teal text-fill-ink' : 'bg-s2 text-ink2 hover:bg-s3',
              )}
            >
              <span className="truncate">{current?.name ?? 'Koleksiyonsuz'}</span>
              <ChevronDown size={15} strokeWidth={2} aria-hidden />
            </button>
          )}
        />
      )}
      <TagInput tags={note.tags} onChange={(tags) => patch({ tags })} />
      <span className="grow" />
      <span
        role="status"
        className={cn(
          'text-[13px] font-semibold',
          status === 'error' ? 'text-t-coral' : 'text-ink3',
        )}
      >
        {STATUS_TEXT[status]}
      </span>
      <Chip selected={note.pinned} onClick={() => patch({ pinned: !note.pinned })}>
        {note.pinned ? 'Sabitlendi' : 'Sabitle'}
      </Chip>
      <Chip
        selected={note.aiExcluded}
        onClick={() => patch({ aiExcluded: !note.aiExcluded })}
        title="Açıkken bu not AI iş paketlerine girmez"
      >
        AI'a kapalı
      </Chip>
      <Menu
        align="end"
        label="Not menüsü"
        items={[{ id: 'delete', label: 'Çöp kutusuna taşı' }]}
        onSelect={() => void onDelete()}
        className="w-[220px]"
        trigger={(props) => (
          <IconButton label="Not menüsü" icon={MoreHorizontal} size="sm" {...props} />
        )}
      />
    </div>
  )
}

// ---------------------------------------------------------------- fikir şeridi

const PROJECT_LATER = 'Projeler paneli henüz hazır değil'

/**
 * Fikrin kuluçka durumu ve en fazla iki eylem. Süresi dolmuşsa Bugün'deki soru karosunun aynısı:
 * yeşil dolgu, "Hâlâ heyecanlandırıyor mu?", Evet / Hayır.
 */
function IdeaStrip({ note, title }: { note: Note; title: string }) {
  const decide = useIdeaDecision()
  const idea = note.idea
  if (!idea) return null
  const target = { noteId: note.id, title, status: idea.status }
  const convert = (
    <Button size="sm" variant="secondary" disabled title={PROJECT_LATER}>
      Projeye çevir
    </Button>
  )

  if (idea.stage === 'due') {
    return (
      <div
        className={cn(
          'flex min-h-[54px] shrink-0 items-center gap-3 rounded-[18px] py-2 pr-2 pl-5',
          DOMAIN_FILL.projects,
        )}
      >
        <span className="cx">Kuluçka doldu</span>
        <span className="grow font-bold">Hâlâ heyecanlandırıyor mu?</span>
        <Button size="sm" variant="onTile" onClick={() => decide(target, 'active')}>
          Evet
        </Button>
        <Button size="sm" variant="onTileGhost" onClick={() => decide(target, 'archived')}>
          Hayır
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[54px] shrink-0 items-center gap-3 rounded-[18px] bg-s2 py-2 pr-2 pl-5">
      <span className="cx grow text-ink2">
        {ideaStageLabel(idea)}
        {idea.stage === 'incubating' && (
          <span className="ml-2 text-ink3">
            · Karar {format(idea.incubateUntil, 'd MMMM', { locale: tr })}
          </span>
        )}
      </span>
      {idea.stage === 'archived' ? (
        <Button size="sm" variant="secondary" onClick={() => decide(target, 'active')}>
          Arşivden çıkar
        </Button>
      ) : idea.stage === 'project' ? null : (
        <>
          {convert}
          <Button size="sm" variant="secondary" onClick={() => decide(target, 'archived')}>
            Arşivle
          </Button>
        </>
      )}
    </div>
  )
}

/** Etiket chip'leri + yazma alanı: Enter ya da virgül ekler, boşken Backspace sonuncuyu siler. */
function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const all = useTags().data ?? []

  function add() {
    const name = draft.trim().replace(/^#+/, '').trim().toLocaleLowerCase('tr-TR')
    setDraft('')
    if (name && !tags.includes(name)) onChange([...tags, name])
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex h-[30px] items-center gap-1 rounded-full bg-teal pr-1.5 pl-3 text-[14px] font-bold text-fill-ink"
        >
          {t}
          <button
            type="button"
            aria-label={`${t} etiketini kaldır`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="grid size-5 cursor-pointer place-items-center rounded-full hover:bg-fill-ink/15"
          >
            <X size={13} strokeWidth={2.25} aria-hidden />
          </button>
        </span>
      ))}
      <input
        value={draft}
        list="note-tag-options"
        placeholder={tags.length ? '+ etiket' : '+ Etiket ekle'}
        aria-label="Etiket ekle"
        maxLength={40}
        onChange={(e) => setDraft(e.target.value.replace(',', ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={add}
        className="h-[30px] w-[120px] rounded-full bg-transparent px-2 text-[14px] font-semibold text-ink outline-none placeholder:text-ink3 focus:bg-s2"
      />
      <datalist id="note-tag-options">
        {all
          .filter((t) => !tags.includes(t.name))
          .map((t) => (
            <option key={t.id} value={t.name} />
          ))}
      </datalist>
    </div>
  )
}
