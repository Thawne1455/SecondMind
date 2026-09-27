import type { CollectionDeleteMode, CollectionSummary } from '@shared/ipc'
import { Button, Modal, useToast } from '../../ui'
import { useDeleteCollection, useRestoreCollection } from './useKnowledge'

type DeleteCollectionModalProps = {
  collection: CollectionSummary | null
  onClose: () => void
  onDeleted: (collection: CollectionSummary) => void
}

/** Koleksiyonu silerken içindeki notların ne olacağını Taha seçer; her iki yol da geri alınabilir. */
export function DeleteCollectionModal({
  collection,
  onClose,
  onDeleted,
}: DeleteCollectionModalProps) {
  const remove = useDeleteCollection()
  const restore = useRestoreCollection()
  const { toast } = useToast()

  function run(mode: CollectionDeleteMode) {
    if (!collection) return
    const target = collection
    remove.mutate(
      { id: target.id, mode },
      {
        onSuccess: () => {
          onClose()
          onDeleted(target)
          toast({
            variant: 'band',
            domain: 'knowledge',
            message:
              mode === 'withNotes' && target.noteCount > 0
                ? `"${target.name}" ve ${target.noteCount} not çöp kutusuna taşındı.`
                : `"${target.name}" çöp kutusuna taşındı.`,
            action: { label: 'Geri al', onClick: () => restore.mutate(target.id) },
          })
        },
      },
    )
  }

  const n = collection?.noteCount ?? 0
  return (
    <Modal
      open={!!collection}
      onClose={onClose}
      width={680}
      title="Koleksiyonu sil"
      domain="knowledge"
      actions={
        n > 0 ? (
          <>
            <Button variant="secondary" loading={remove.isPending} onClick={() => run('keepNotes')}>
              İçindeki {n} notu koleksiyonsuz bırak
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => run('withNotes')}>
              Notlarla birlikte çöp kutusuna taşı
            </Button>
          </>
        ) : (
          <Button variant="danger" loading={remove.isPending} onClick={() => run('keepNotes')}>
            Çöp kutusuna taşı
          </Button>
        )
      }
    >
      <p className="m-0 text-ink2">
        {n > 0
          ? `"${collection?.name}" koleksiyonunda ${n} not var. Notlar ne olsun?`
          : `"${collection?.name}" koleksiyonu boş.`}
      </p>
    </Modal>
  )
}
