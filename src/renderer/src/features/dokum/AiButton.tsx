import { Sparkles } from 'lucide-react'
import type { AiModel } from '@shared/ipc'
import { progressLabel } from '../../lib/aiText'
import { errorText } from '../../lib/errors'
import { useSetSetting, useSetting } from '../../lib/settings'
import { Badge, Button, Menu, useToast } from '../../ui'
import { useAiProcess, useAiStatus } from './useAi'
import { useDumps } from './useDumps'

const MODEL_ITEMS = [
  { id: 'fast', label: 'Hızlı', description: 'Yerel Qwen · kısa metin dökümleri' },
  { id: 'deep', label: 'Derin', description: 'Claude Code · resimler, PDF, uzun notlar' },
] as const

/**
 * Üst çubukta "AI ile İşle": menüden model seçmek işlemeyi başlatır (son seçim hatırlanır).
 * Çalışırken "İşleniyor 3/5"; iptal Döküm ekranındaki şeritte.
 */
export function AiButton() {
  const { toast } = useToast()
  const status = useAiStatus().data
  const queue = useDumps('pending').data ?? []
  const model = useSetting('aiModel').data ?? 'fast'
  const { mutate: saveModel } = useSetSetting('aiModel')
  const process = useAiProcess()

  const run = status?.running
  if (run || process.isPending)
    return (
      <Button variant="ai" icon={Sparkles} loading loadingLabel={progressLabel(run)}>
        AI ile İşle
      </Button>
    )

  const pending = queue.filter((d) => d.status === 'pending')
  const withFiles = pending.filter((d) => d.attachments.length > 0).length
  const footer = !pending.length
    ? 'İşlenecek döküm yok'
    : model === 'fast' && withFiles
      ? `${pending.length} döküm · ${withFiles} ekli olan Derin'e gider`
      : `${pending.length} döküm işlenecek`

  function start(id: string) {
    const chosen = id as AiModel
    if (chosen !== model) saveModel(chosen)
    process.mutate(chosen, {
      onError: (e) =>
        toast({ variant: 'band', domain: 'warning', title: 'AI', message: errorText(e) }),
    })
  }

  return (
    <Menu
      label="AI ile İşle"
      align="end"
      items={MODEL_ITEMS}
      selectedId={model}
      onSelect={start}
      footer={footer}
      trigger={(props) => (
        <Button variant="ai" icon={Sparkles} disabled={!pending.length} {...props}>
          AI ile İşle
          {pending.length > 0 && <Badge count={pending.length} className="ml-2" />}
        </Button>
      )}
    />
  )
}
