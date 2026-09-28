import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { Check, FolderOpen, FolderPlus, GitBranch, Gamepad2 } from 'lucide-react'
import {
  PROJECT_COLORS,
  PROJECT_NAME_MAX,
  type FolderInspection,
  type ProjectKind,
} from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, cn, DialogFrame, Field, Input, Kbd, ModalPanel } from '../../ui'
import { KIND_LABEL } from './labels'
import { useCreateProject, useProjects } from './useProjects'

// Proje oluşturma (PROJELER.md "Oluşturma"): açılınca doğrudan klasör seçici gelir; ad, tür ve renk
// klasörden tahmin edilir. Tek ekran, Enter oluşturur. Klasörsüz proje de açılabilir.

type Props = { open: boolean; onClose: () => void }

export function CreateProjectDialog({ open, onClose }: Props) {
  return (
    <DialogFrame open={open} onClose={onClose} label="Yeni proje" width={620}>
      {open && <CreateForm onClose={onClose} />}
    </DialogFrame>
  )
}

const KINDS: ProjectKind[] = ['unity', 'software', 'creative', 'general']

function CreateForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const create = useCreateProject()
  const used = (useProjects().data ?? []).filter((p) => p.status === 'active').map((p) => p.color)
  const [folder, setFolder] = useState<FolderInspection | null>(null)
  const [folderless, setFolderless] = useState(false)
  const [picking, setPicking] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ProjectKind>('general')
  const [color, setColor] = useState<string>(
    PROJECT_COLORS.find((c) => !used.includes(c)) ?? PROJECT_COLORS[0],
  )
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const started = useRef(false)

  async function pick() {
    setPicking(true)
    setError(null)
    try {
      const path = await window.api.invoke('project:pickFolder', undefined)
      if (!path) return
      const info = await window.api.invoke('project:inspectFolder', { path })
      setFolder(info)
      setFolderless(false)
      setName(info.name)
      setKind(info.kind)
      setColor(info.color)
      if (info.takenBy) setError(`Bu klasör "${info.takenBy}" projesine bağlı.`)
      requestAnimationFrame(() => nameRef.current?.select())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setPicking(false)
    }
  }

  // Açılır açılmaz klasör seçici: en sık yol tek hareket olsun.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void pick()
  }, [])

  const ready = (folder && !folder.takenBy) || folderless
  function submit() {
    if (!ready || !name.trim()) return
    create.mutate(
      { name: name.trim(), kind, color, folderPath: folderless ? null : folder!.path },
      {
        onSuccess: ({ id }) => {
          onClose()
          void navigate(`/projeler/${id}`)
        },
        onError: (e) => setError(errorText(e)),
      },
    )
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div onKeyDown={onKeyDown}>
      <ModalPanel
        title="Yeni proje"
        fill={ready ? color : undefined}
        domain="projects"
        onClose={onClose}
        hints={
          ready ? (
            <span className="flex items-center gap-1.5">
              <Kbd>Enter</Kbd> oluşturur
            </span>
          ) : (
            'Klasörden ad, tür ve renk tahmin edilir.'
          )
        }
        actions={
          ready && (
            <Button
              icon={Check}
              loading={create.isPending}
              onClick={submit}
              disabled={!name.trim()}
            >
              Oluştur
            </Button>
          )
        }
      >
        {!ready ? (
          <div className="flex flex-col items-start gap-3 py-2">
            <button
              type="button"
              data-autofocus
              onClick={() => void pick()}
              disabled={picking}
              className="flex w-full cursor-pointer items-center gap-4 rounded-tile border-3 border-dashed border-line px-6 py-7 text-left transition-colors hover:border-ink hover:bg-s2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo disabled:cursor-progress"
            >
              <FolderOpen size={34} strokeWidth={1.75} aria-hidden />
              <span className="flex flex-col">
                <span className="x text-[20px] font-black uppercase">
                  {picking ? 'Klasör seçiliyor…' : 'Klasör seç'}
                </span>
                <span className="text-[15px] text-ink2">
                  Unity, git ya da düz klasör: SecondMind türünü kendisi anlar. Klasöre yazmaz.
                </span>
              </span>
            </button>
            {error && <span className="text-[13px] font-semibold text-t-coral">{error}</span>}
            <button
              type="button"
              onClick={() => {
                setFolderless(true)
                setKind('general')
                requestAnimationFrame(() => nameRef.current?.focus())
              }}
              className="cursor-pointer text-[15px] font-bold text-ink2 underline-offset-4 hover:underline"
            >
              Klasörsüz başla
            </button>
          </div>
        ) : (
          <>
            {folder && !folderless && (
              <div className="flex items-center gap-3 rounded-field bg-s2 px-4 py-3">
                <span
                  className="min-w-0 grow truncate font-mono text-[14px] font-semibold"
                  title={folder.path}
                >
                  {folder.path}
                </span>
                {folder.unityVersion && (
                  <span className="cx flex shrink-0 items-center gap-1.5 text-ink2">
                    <Gamepad2 size={15} strokeWidth={1.75} aria-hidden /> Unity{' '}
                    {folder.unityVersion}
                  </span>
                )}
                {folder.git && (
                  <span className="cx flex shrink-0 items-center gap-1.5 text-ink2">
                    <GitBranch size={15} strokeWidth={1.75} aria-hidden /> git
                  </span>
                )}
                <Button variant="secondary" size="xs" icon={FolderPlus} onClick={() => void pick()}>
                  Değiştir
                </Button>
              </div>
            )}
            <Field label="Ad" error={error ?? undefined}>
              <Input
                ref={nameRef}
                data-autofocus
                strong
                value={name}
                maxLength={PROJECT_NAME_MAX}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                className="h-[52px] text-[20px]"
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="cx">Tür</span>
              <div role="radiogroup" aria-label="Tür" className="flex gap-1.5">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={cn(
                      'h-[42px] grow cursor-pointer rounded-full px-3 text-[14px] font-bold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
                      kind === k ? 'bg-ink text-on-ink' : 'bg-s2 hover:bg-s3',
                    )}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="cx">Renk</span>
              <div role="radiogroup" aria-label="Renk" className="flex gap-2">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={c}
                    title={used.includes(c) ? 'Başka projede kullanılıyor' : undefined}
                    onClick={() => setColor(c)}
                    className={cn(
                      'relative size-10 cursor-pointer rounded-full transition-transform active:scale-[.92] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
                      color === c && 'ring-3 ring-ink ring-offset-3 ring-offset-bg',
                    )}
                    style={{ backgroundColor: c }}
                  >
                    {used.includes(c) && color !== c && (
                      <span className="absolute inset-0 m-auto size-2 rounded-full bg-fill-ink/50" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </ModalPanel>
    </div>
  )
}
