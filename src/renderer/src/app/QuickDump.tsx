import { CornerDownLeft } from 'lucide-react'
import { DumpComposer } from '../features/dokum/DumpComposer'
import { Button, Kbd, Modal, useToast } from '../ui'

type QuickDumpProps = { open: boolean; onClose: () => void }

/**
 * Hızlı Döküm (Ctrl N, her ekrandan). Enter kaydeder, Shift+Enter yeni satır, Esc kapatır.
 * Kayıt `dump:create` ile; yapıştırılan ve sürüklenen dosyalar media deposuna yazılır.
 */
export function QuickDump({ open, onClose }: QuickDumpProps) {
  const { toast } = useToast()
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
      <DumpComposer
        id="quick-dump"
        variant="modal"
        onSaved={() => {
          toast({ variant: 'fill', domain: 'dump', message: 'Döküme atıldı.' })
          onClose()
        }}
      />
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
