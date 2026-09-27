import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { CornerDownLeft, FileText, Image as ImageIcon, X } from 'lucide-react'
import { ATTACHMENT_BYTES_MAX, DUMP_ATTACHMENTS_MAX, DUMP_TEXT_MAX } from '@shared/ipc'
import { formatBytes } from '../../lib/format'
import { Button, cn, IconButton, useToast } from '../../ui'
import { useCreateDump } from './useDumps'

type Attachment = {
  id: number
  file: File
  source: 'yapıştırıldı' | 'sürüklendi'
}

type DumpComposerProps = {
  /** Form id'si; modalda gönder butonu formun dışında (alt şerit) olduğu için gerekir. */
  id: string
  /** modal: Hızlı Döküm'ün gövdesi. page: Döküm ekranının üstündeki geniş hali, kendi butonuyla. */
  variant: 'modal' | 'page'
  onSaved?: () => void
}

/**
 * Döküm giriş alanı (Hızlı Döküm ve Döküm ekranı ortak). Enter kaydeder, Shift+Enter yeni satır.
 * Yapıştırılan ve sürüklenen dosyalar eklenir; kayıtta media deposuna yazılır.
 */
export function DumpComposer({ id, variant, onSaved }: DumpComposerProps) {
  const { toast } = useToast()
  const create = useCreateDump()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const nextId = useRef(1)
  const page = variant === 'page'

  function warn(message: string) {
    toast({ variant: 'fill', domain: 'warning', message })
  }

  function add(files: File[], source: Attachment['source']) {
    const tooBig = files.filter((f) => f.size > ATTACHMENT_BYTES_MAX)
    if (tooBig.length) warn(`${tooBig.map((f) => f.name).join(', ')}: 25 MB sınırını aşıyor.`)
    const room = DUMP_ATTACHMENTS_MAX - attachments.length
    const fit = files.filter((f) => f.size <= ATTACHMENT_BYTES_MAX && f.size > 0)
    if (fit.length > room) warn(`Bir dökümde en fazla ${DUMP_ATTACHMENTS_MAX} ek olabilir.`)
    const added = fit.slice(0, Math.max(0, room)).map((file) => ({
      id: nextId.current++,
      file,
      source,
    }))
    setAttachments((list) => [...list, ...added])
  }

  function remove(attachmentId: number) {
    setAttachments((list) => list.filter((a) => a.id !== attachmentId))
  }

  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData.files)
    if (!files.length) return
    e.preventDefault()
    add(files, 'yapıştırıldı')
  }

  function onDrop(e: DragEvent) {
    setDragging(false)
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    add(Array.from(e.dataTransfer.files), 'sürüklendi')
  }

  async function submit() {
    if (create.isPending || (!text.trim() && !attachments.length)) return
    try {
      const files = await Promise.all(
        attachments.map(async ({ file }) => ({
          name: file.name,
          mime: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      )
      await create.mutateAsync({ text, attachments: files })
      setText('')
      setAttachments([])
      onSaved?.()
    } catch (err) {
      console.error('Döküm kaydedilemedi:', err)
      warn('Döküm kaydedilemedi. Metin yerinde duruyor, tekrar dene.')
    }
  }

  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={onDrop}
      aria-busy={create.isPending}
      className={cn(
        'flex flex-col gap-4',
        page &&
          'rounded-tile bg-s2 px-7 pt-6 pb-5 outline-amber transition-colors duration-150 focus-within:outline-3',
        page && dragging && 'bg-s3 outline-3 outline-dashed',
      )}
    >
      <textarea
        data-autofocus={page ? undefined : true}
        value={text}
        maxLength={DUMP_TEXT_MAX}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void submit()
          }
        }}
        aria-label="Döküm metni"
        placeholder="Aklındakini dök…"
        rows={page ? 3 : 4}
        className={cn(
          'resize-none border-0 bg-transparent p-0 text-[20px] leading-[1.55] font-bold text-ink outline-none placeholder:text-ink3',
          page ? 'min-h-[93px]' : 'min-h-[120px]',
        )}
      />

      <div className="flex flex-wrap items-center gap-3">
        {attachments.map((a) => (
          <div
            key={a.id}
            className={cn(
              'flex h-[58px] max-w-[300px] items-center gap-3 rounded-2xl py-1.5 pr-2 pl-1.5',
              page ? 'bg-bg' : 'bg-s2',
            )}
          >
            <span className="flex h-[46px] w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sky text-fill-ink">
              {a.file.type.startsWith('image/') ? (
                <ImageIcon size={18} strokeWidth={1.75} aria-hidden />
              ) : (
                <FileText size={18} strokeWidth={1.75} aria-hidden />
              )}
            </span>
            <span className="flex min-w-0 grow flex-col leading-[1.3]">
              <span className="truncate text-[14px] font-bold">{a.file.name}</span>
              <span className="text-[13px] font-medium text-ink3">
                {a.source} · {formatBytes(a.file.size)}
              </span>
            </span>
            <IconButton
              label={`${a.file.name} ekini kaldır`}
              icon={X}
              className="bg-transparent hover:bg-s3"
              onClick={() => remove(a.id)}
            />
          </div>
        ))}
        <span className="text-[14px] font-medium text-ink2">
          Resim yapıştır ya da dosya sürükle
        </span>
        {page && (
          <Button type="submit" loading={create.isPending} className="ml-auto px-6">
            Döküme at
            <CornerDownLeft size={18} strokeWidth={1.75} aria-hidden className="ml-2" />
          </Button>
        )}
      </div>
    </form>
  )
}
