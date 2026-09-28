import { useState, type KeyboardEvent } from 'react'
import type { ScheduleBlock } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, DialogFrame, Field, Kbd, ModalPanel, Textarea, useToast } from '../../ui'
import { useDeleteTask, useMoveBlock, useRestoreTask, useSplitTask } from './usePlanning'

// Erteleme sayacı (EKRANLAR.md Bugün): `POSTPONE_ASK_AT`'e ulaşan görevin bloğuna tıklanınca
// "Bu 3. erteleme: Böl · Sil · Bugün yap". Bugün yap bloğu o gün sabitler; sabit blok bir daha sormaz.

type Props = {
  block: ScheduleBlock | null
  onClose: () => void
}

export function PostponeDialog({ block, onClose }: Props) {
  return (
    <DialogFrame open={block !== null} onClose={onClose} label="Erteleme" width={580}>
      {block && <PostponePanel block={block} onClose={onClose} />}
    </DialogFrame>
  )
}

function PostponePanel({ block, onClose }: { block: ScheduleBlock; onClose: () => void }) {
  const [splitting, setSplitting] = useState(false)
  const [parts, setParts] = useState('')
  const split = useSplitTask()
  const remove = useDeleteTask()
  const restore = useRestoreTask()
  const move = useMoveBlock()
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const titles = parts
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  function doSplit() {
    if (!titles.length || split.isPending) return
    split.mutate(
      { id: block.sourceId, titles },
      {
        onSuccess: () => {
          onClose()
          toast({
            variant: 'fill',
            domain: 'today',
            message: `${block.title} → ${titles.length} parça, bugüne eklendi.`,
          })
        },
        onError,
      },
    )
  }

  function doDelete() {
    remove.mutate(block.sourceId, {
      onSuccess: () => {
        onClose()
        toast({
          message: `Silindi: ${block.title}`,
          action: { label: 'Geri al', onClick: () => restore.mutate(block.sourceId) },
        })
      },
      onError,
    })
  }

  function doToday() {
    move.mutate({ id: block.id, start: block.start }, { onSuccess: onClose, onError })
  }

  // Tek tuş: B böl, S sil, Enter bugün yap (odak butondayken zaten Enter).
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (splitting) {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        doSplit()
      }
      return
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const key = e.key.toLocaleLowerCase('tr-TR')
    if (key === 'b') {
      e.preventDefault()
      setSplitting(true)
    } else if (key === 's') {
      e.preventDefault()
      doDelete()
    }
  }

  return (
    <div onKeyDown={onKeyDown}>
      <ModalPanel
        title={`Bu ${block.postponeCount}. erteleme`}
        domain="warning"
        onClose={onClose}
        hints={
          splitting ? (
            <>
              Her satır bir parça · <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd> böler
            </>
          ) : (
            <>
              <Kbd>B</Kbd> böl · <Kbd>S</Kbd> sil · <Kbd>Enter</Kbd> bugün yap
            </>
          )
        }
        actions={
          splitting ? (
            <>
              <Button variant="secondary" onClick={() => setSplitting(false)}>
                Vazgeç
              </Button>
              <Button disabled={!titles.length} loading={split.isPending} onClick={doSplit}>
                {titles.length > 1 ? `${titles.length} parçaya böl` : 'Böl'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setSplitting(true)}>
                Böl
              </Button>
              <Button variant="danger" loading={remove.isPending} onClick={doDelete}>
                Sil
              </Button>
              <Button data-autofocus loading={move.isPending} onClick={doToday}>
                Bugün yap
              </Button>
            </>
          )
        }
      >
        <p className="m-0 text-[18px] leading-snug font-extrabold">{block.title}</p>
        {splitting ? (
          <Field label="Parçalar" hint="Asıl görev çöp kutusuna gider; süresi parçalara bölünür.">
            <Textarea
              data-autofocus
              ref={(el) => el?.focus()}
              rows={4}
              value={parts}
              onChange={(e) => setParts(e.target.value)}
              placeholder={'İlk küçük adım\nİkinci adım'}
            />
          </Field>
        ) : (
          <p className="m-0 text-[15px] text-ink2">
            {block.postponeCount} kez ertelendi. Daha küçük parçalara böl, sil ya da bugün bu saatte
            yapmayı sabitle.
          </p>
        )}
      </ModalPanel>
    </div>
  )
}
