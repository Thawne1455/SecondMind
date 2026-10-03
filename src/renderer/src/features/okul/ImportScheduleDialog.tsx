import { useEffect, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Sparkles, X } from 'lucide-react'
import { ATTACHMENT_BYTES_MAX } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatBytes } from '../../lib/format'
import { Button, DropZone, IconButton, Kbd, Modal, useToast } from '../../ui'
import { useAiStatus, useImportSchedule } from '../dokum/useAi'

// Okul > Programdan doldur (4e-2): ders programının fotoğrafı, ekran görüntüsü ya da PDF'i bırakılır (ya da Ctrl V);
// DERİN (Claude Code) okur, dönem ve ders önerileri Onay Kutusu'na düşer. Dosya bir döküm olarak da kalır.

const MAX_FILES = 5
const ACCEPT = 'image/*,.pdf,application/pdf'

const accepted = (f: File) =>
  f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

type Props = { open: boolean; onClose: () => void }

export function ImportScheduleDialog({ open, onClose }: Props) {
  const { toast } = useToast()
  const run = useImportSchedule()
  const busy = !!useAiStatus().data?.running
  const [files, setFiles] = useState<{ id: number; file: File }[]>([])
  const nextId = useRef(1)

  function add(list: File[]) {
    const ok = list.filter((f) => accepted(f) && f.size > 0 && f.size <= ATTACHMENT_BYTES_MAX)
    if (ok.length < list.length)
      toast({
        variant: 'fill',
        domain: 'warning',
        message: 'Sadece resim ya da PDF, en fazla 25 MB.',
      })
    setFiles((cur) =>
      [...cur, ...ok.map((file) => ({ id: nextId.current++, file }))].slice(0, MAX_FILES),
    )
  }

  // Ctrl V: pencere açıkken panodaki ekran görüntüsü eklenir.
  useEffect(() => {
    if (!open) return
    const onPaste = (e: ClipboardEvent) => {
      const list = Array.from(e.clipboardData?.files ?? [])
      if (!list.length) return
      e.preventDefault()
      add(list)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  function close() {
    setFiles([])
    onClose()
  }

  async function submit() {
    if (!files.length || run.isPending) return
    try {
      const attachments = await Promise.all(
        files.map(async ({ file }) => ({
          name: file.name,
          mime: file.type || 'application/pdf',
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      )
      await run.mutateAsync({ text: '', attachments })
      toast({
        variant: 'band',
        domain: 'school',
        title: 'Okul',
        message: "Program okunuyor. Bitince öneriler Onay Kutusu'nda.",
      })
      close()
    } catch (e) {
      toast({
        variant: 'band',
        domain: 'warning',
        title: 'Programdan doldur',
        message: errorText(e),
      })
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Programdan doldur"
      domain="school"
      width={620}
      hints={
        <span>
          <Kbd>Ctrl</Kbd> <Kbd>V</Kbd> ekran görüntüsünü yapıştırır
        </span>
      }
      actions={
        <>
          <Button variant="secondary" onClick={close}>
            Vazgeç
          </Button>
          <Button
            variant="ai"
            icon={Sparkles}
            disabled={!files.length || busy}
            loading={run.isPending}
            onClick={() => void submit()}
          >
            DERİN ile oku
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-ink2">
          Ders programının fotoğrafını, ekran görüntüsünü ya da PDF'ini ver. Claude Code okur;
          dönem, dersler, saatler, derslikler ve hocalar Onay Kutusu'na öneri olarak düşer.
          Onaylamadan hiçbir şey yazılmaz.
        </p>
        <DropZone
          onFiles={add}
          accept={ACCEPT}
          label="Program dosyasını bırak ya da seç"
          className="h-32"
        />
        {files.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {files.map(({ id, file }) => (
              <li
                key={id}
                className="flex h-[52px] items-center gap-3 rounded-2xl bg-s2 py-1.5 pr-2 pl-1.5"
              >
                <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-xl bg-sky text-fill-ink">
                  {file.type.startsWith('image/') ? (
                    <ImageIcon size={18} strokeWidth={1.75} aria-hidden />
                  ) : (
                    <FileText size={18} strokeWidth={1.75} aria-hidden />
                  )}
                </span>
                <span className="min-w-0 grow truncate text-[14px] font-bold">{file.name}</span>
                <span className="x shrink-0 text-[13px] font-semibold text-ink3">
                  {formatBytes(file.size)}
                </span>
                <IconButton
                  label={`${file.name} dosyasını kaldır`}
                  icon={X}
                  className="bg-transparent hover:bg-s3"
                  onClick={() => setFiles((cur) => cur.filter((f) => f.id !== id))}
                />
              </li>
            ))}
          </ul>
        )}
        {busy && (
          <p className="m-0 text-[13px] font-semibold text-ink3">
            AI şu an başka bir iş yapıyor; bitince tekrar dene.
          </p>
        )}
      </div>
    </Modal>
  )
}
