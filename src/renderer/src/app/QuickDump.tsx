import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { CornerDownLeft, FileText, Image as ImageIcon, X } from 'lucide-react'
import { formatBytes } from '../lib/format'
import { Button, IconButton, Kbd, Modal, useToast } from '../ui'

type Attachment = {
  id: number
  file: File
  source: 'yapıştırıldı' | 'sürüklendi'
}

type QuickDumpProps = { open: boolean; onClose: () => void }

/**
 * Hızlı Döküm (Ctrl N, her ekrandan). Enter kaydeder, Shift+Enter yeni satır, Esc kapatır.
 * Aşama 1b: henüz kaydetmez; kayıt Aşama 2'de (Döküm tablosu + media deposu).
 */
export function QuickDump({ open, onClose }: QuickDumpProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={660}
      placement="top"
      title="Hızlı Döküm"
      domain="dump"
      headerExtra={<Kbd tone="onFill">Ctrl N</Kbd>}
      headerClassName="py-5 pr-5 pl-7 [&_h2]:text-[22px]"
      bodyClassName="gap-4 px-7 pt-6 pb-5"
      footerClassName="px-7 py-4 pr-4"
      hints={<Hints />}
      actions={
        <Button size="lg" type="submit" form="quick-dump" className="px-6">
          Döküme at
          <CornerDownLeft size={18} strokeWidth={1.75} aria-hidden className="ml-2" />
        </Button>
      }
    >
      <QuickDumpForm onDone={onClose} />
    </Modal>
  )
}

function Hints() {
  const hint = (key: string, text: string) => (
    <span className="inline-flex items-center gap-2 text-[14px] font-medium text-ink2">
      <Kbd>{key}</Kbd>
      {text}
    </span>
  )
  return (
    <span className="flex items-center gap-4">
      {hint('Enter', 'kaydet')}
      {hint('Shift Enter', 'yeni satır')}
      {hint('Esc', 'kapat')}
    </span>
  )
}

function QuickDumpForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const nextId = useRef(1)

  function add(files: File[], source: Attachment['source']) {
    const added = files.map((file) => ({ id: nextId.current++, file, source }))
    setAttachments((list) => [...list, ...added])
  }

  function remove(id: number) {
    setAttachments((list) => list.filter((a) => a.id !== id))
  }

  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData.files)
    if (!files.length) return
    e.preventDefault()
    add(files, 'yapıştırıldı')
  }

  function onDrop(e: DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    add(Array.from(e.dataTransfer.files), 'sürüklendi')
  }

  function submit() {
    if (!text.trim() && !attachments.length) return
    toast({
      variant: 'fill',
      domain: 'dump',
      message: "Kayıt Aşama 2'de gelecek; bu döküm saklanmadı.",
    })
    onDone()
  }

  return (
    <form
      id="quick-dump"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={onDrop}
      className="flex flex-col gap-4"
    >
      <textarea
        data-autofocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        aria-label="Döküm metni"
        placeholder="Aklındakini dök…"
        rows={4}
        className="min-h-[120px] resize-none border-0 bg-transparent p-0 text-[20px] leading-[1.55] font-bold text-ink outline-none placeholder:text-ink3"
      />

      <div className="flex flex-wrap items-center gap-3">
        {attachments.map((a) => (
          <div
            key={a.id}
            className="flex h-[58px] max-w-[300px] items-center gap-3 rounded-2xl bg-s2 py-1.5 pr-2 pl-1.5"
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
      </div>
    </form>
  )
}
