import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { format } from 'date-fns'
import { Check } from 'lucide-react'
import { PLAYTEST_TEXT_MAX, TESTER_NAME_MAX, type ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import {
  Button,
  cn,
  DialogFrame,
  Field,
  Input,
  Kbd,
  ModalPanel,
  Textarea,
  useToast,
} from '../../ui'
import { useKnownTesters, usePastePlaytest, usePastePreview, useUndoPlaytest } from './usePlaytest'

// Playtest yapıştırma (PROJELER.md > Playtest kutusu): tek hareket. Metin alanı + Kim + tarih (bugün).
// Discord/WhatsApp satırlarından ("[12:03] Ali: ...") kişi ve gün kendiliğinden çıkar; önizleme ana süreçte.
// Ctrl Shift V ile açılınca panodaki metin hazır gelir.

type Props = {
  project: ProjectSummary
  open: boolean
  /** Açılışta alana konacak metin (pano). */
  initialText: string
  onClose: () => void
}

export function PlaytestPasteDialog({ project, open, initialText, onClose }: Props) {
  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      label="Playtest yapıştır"
      width={680}
      placement="high"
    >
      {open && <PasteForm project={project} initialText={initialText} onClose={onClose} />}
    </DialogFrame>
  )
}

function PasteForm({
  project,
  initialText,
  onClose,
}: {
  project: ProjectSummary
  initialText: string
  onClose: () => void
}) {
  const [text, setText] = useState(initialText)
  const [tester, setTester] = useState('')
  const [day, setDay] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [error, setError] = useState<string | null>(null)
  const [debounced, setDebounced] = useState(initialText)
  const listId = useId()
  const known = useKnownTesters(true).data ?? []
  const paste = usePastePlaytest()
  const undo = useUndoPlaytest()
  const { toast } = useToast()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 200)
    return () => clearTimeout(t)
  }, [text])
  const preview = usePastePreview(debounced, day).data
  const recognized = preview?.testers ?? []
  // Bütün satırlar kişili: Kim alanı kullanılmaz.
  const testerUnused = recognized.length > 0 && preview?.needsTester === false

  function save() {
    if (!text.trim()) return setError('Test edenin mesajını yapıştır.')
    if (paste.isPending) return
    paste.mutateAsync({ projectId: project.id, text, tester: tester.trim(), receivedOn: day }).then(
      (r) => {
        onClose()
        toast({
          domain: 'projects',
          title: 'Playtest',
          message:
            r.newClusters > 0
              ? `${r.points} nokta · ${r.newClusters} yeni küme`
              : `${r.points} nokta, var olan kümelere girdi`,
          action: { label: 'Geri al', onClick: () => undo.mutate(r.groupId) },
        })
      },
      (e: unknown) => setError(errorText(e)),
    )
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      save()
    }
  }

  return (
    <div onKeyDown={onKeyDown}>
      <ModalPanel
        title={`Playtest · ${project.name}`}
        fill={project.color}
        onClose={onClose}
        hints={
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Kbd>Ctrl Enter</Kbd> kaydeder · benzerleri SecondMind gruplar
          </span>
        }
        actions={
          <Button icon={Check} loading={paste.isPending} onClick={save}>
            Kaydet
          </Button>
        }
      >
        <Field
          label="Mesajlar"
          error={error ?? undefined}
          hint={
            preview && text.trim()
              ? [
                  recognized.length > 0 &&
                    `${recognized.length} kişi tanındı: ${recognized.join(', ')}`,
                  `${preview.points} nokta`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Olduğu gibi yapıştır; "[12:03] Ali: …" satırlarından kişi ve gün kendiliğinden çıkar.'
          }
        >
          <Textarea
            data-autofocus
            rows={9}
            value={text}
            maxLength={PLAYTEST_TEXT_MAX}
            placeholder={
              '[12:03] Ali: ölüm panelinde takıldım, tuşlar çalışmıyor\n[12:05] Can: müzik çok yüksek'
            }
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            className="font-mono text-[14px]"
          />
        </Field>
        <div className="flex gap-3">
          <Field
            label="Kim"
            optional
            className={cn('grow transition-opacity', testerUnused && 'opacity-40')}
            hint={testerUnused ? 'Kişiler mesajlardan alındı.' : undefined}
          >
            <Input
              value={tester}
              list={listId}
              maxLength={TESTER_NAME_MAX}
              placeholder="Ali"
              onChange={(e) => setTester(e.target.value)}
            />
            <datalist id={listId}>
              {known.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label="Tarih" className="w-[190px]">
            <Input
              type="date"
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="tabular-nums"
            />
          </Field>
        </div>
      </ModalPanel>
    </div>
  )
}
