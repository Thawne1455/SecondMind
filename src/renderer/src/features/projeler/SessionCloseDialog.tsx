import { useState, type KeyboardEvent } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { NEXT_STEP_MAX, type ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatMinutes } from '../../lib/format'
import { useNow } from '../../lib/useNow'
import { Button, DialogFrame, Field, Input, Kbd, ModalPanel, Textarea, useToast } from '../../ui'
import { LONG_SESSION_MIN, minutesBetween, parseActual } from './labels'
import { useCloseSession, useDiscardSession, useParking } from './useProjects'

// Oturum kapanışı (PROJELER.md "Oturumlar"): proje renginde modal. "Nerede bıraktın" isteğe bağlı,
// sıradaki adım zorunlu ve mevcut adımla dolu gelir (Enter aynen kabul eder).

type Props = {
  project: ProjectSummary | null
  onClose: () => void
  /** Kaydedildikten sonra (örn. başka projede Başla'nın devamı). */
  onClosed?: () => void
}

export function SessionCloseDialog({ project, onClose, onClosed }: Props) {
  const open = !!project?.activeSession
  return (
    <DialogFrame open={open} onClose={onClose} label="Oturumu kapat" width={640}>
      {project?.activeSession && (
        <CloseForm
          key={project.activeSession.id}
          project={project}
          onClose={onClose}
          onClosed={onClosed}
        />
      )}
    </DialogFrame>
  )
}

type FormProps = {
  project: ProjectSummary
  onClose: () => void
  onClosed?: () => void
}

function CloseForm({ project, onClose, onClosed }: FormProps) {
  const session = project.activeSession!
  const now = useNow(30_000)
  const elapsed = minutesBetween(session.startedAt, now)
  const long = elapsed > LONG_SESSION_MIN
  const [leftOff, setLeftOff] = useState('')
  const [nextStep, setNextStep] = useState(project.nextStep)
  const [actual, setActual] = useState('')
  const [error, setError] = useState<string | null>(null)
  const close = useCloseSession()
  const discard = useDiscardSession()
  const parked = (useParking(project.id).data ?? []).filter((p) => p.inActiveSession)
  const { toast } = useToast()

  function save() {
    const step = nextStep.trim()
    if (!step) return setError('Sıradaki adımı yaz: yarın ilk bunu göreceksin.')
    const durationMin = long && actual.trim() ? parseActual(actual) : undefined
    if (durationMin === null) return setError('Süreyi "90" ya da "1:30" gibi yaz.')
    // Kaydedince liste yenilenir ve bu form kapanır; `mutate` geri çağrıları o zaman atlanırdı.
    close
      .mutateAsync({ id: session.id, leftOff: leftOff.trim(), nextStep: step, durationMin })
      .then(
        (s) => {
          onClose()
          onClosed?.()
          toast({
            variant: 'fill',
            domain: 'projects',
            title: `${project.name} · ${formatMinutes(minutesBetween(s.startedAt, s.endedAt!))}`,
            message: `Sıradaki: ${step}`,
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
        title={`${project.name} oturumunu kapat`}
        fill={project.color}
        onClose={onClose}
        headerExtra={
          <span className="x rounded-full bg-fill-ink px-3 py-1 text-[15px] font-black text-white">
            {formatMinutes(elapsed)}
          </span>
        }
        hints={
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Kbd>Ctrl Enter</Kbd> kaydeder
          </span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={Trash2}
              title="Yanlışlıkla başladıysan: kayıt bırakmadan at"
              loading={discard.isPending}
              onClick={() =>
                discard.mutateAsync(session.id).then(
                  () => {
                    onClose()
                    toast({ message: 'Oturum atıldı, kayıt tutulmadı.', domain: 'projects' })
                  },
                  (e: unknown) => setError(errorText(e)),
                )
              }
            >
              Oturumu at
            </Button>
            <Button icon={Check} loading={close.isPending} onClick={save}>
              Kapat ve kaydet
            </Button>
          </>
        }
      >
        <Field label="Nerede bıraktın?" optional>
          <Textarea
            data-autofocus
            rows={3}
            value={leftOff}
            placeholder="Boss fazı 2 müziği yarım, geçiş sesi patlıyor…"
            onChange={(e) => setLeftOff(e.target.value)}
          />
        </Field>
        <Field
          label="Sıradaki ilk somut adım ne?"
          hint="Yarın Bugün ekranında ilk bunu göreceksin."
          error={error ?? undefined}
        >
          <Input
            strong
            value={nextStep}
            maxLength={NEXT_STEP_MAX}
            placeholder="Tek cümle: fiille başla"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setNextStep(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault()
                save()
              }
            }}
            className="h-[52px] text-[18px]"
          />
        </Field>
        {long && (
          <Field
            label="Gerçekte ne kadar çalıştın?"
            optional
            hint={`Oturum ${formatMinutes(elapsed)} açık kaldı. Boş bırakırsan bu süre yazılır.`}
          >
            <Input
              value={actual}
              placeholder="1:30"
              onChange={(e) => {
                setActual(e.target.value)
                setError(null)
              }}
              className="w-40"
            />
          </Field>
        )}
        {parked.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="cx text-ink2">Bu oturumda park edilenler · {parked.length}</span>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {parked.slice(0, 5).map((p) => (
                <li key={p.id} className="truncate text-[15px] font-semibold text-ink2">
                  → {p.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </ModalPanel>
    </div>
  )
}
