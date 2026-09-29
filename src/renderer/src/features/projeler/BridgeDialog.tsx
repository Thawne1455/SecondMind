import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Link2, Unlink } from 'lucide-react'
import type { BridgeStatus, ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, cn, DialogFrame, ModalPanel, Skeleton, useToast } from '../../ui'

// Claude Code köprüsü (PROJELER.md > Claude Code köprüsü, 5e). Proje klasörüne yazılacak her şey burada
// gösterilir ve tek tek seçilir: `.secondmind/` (her zaman), CLAUDE.md bölümü, Unity Editor betiği, .gitignore.
// Kurulunca BAGLAM.md her Güncelle'de ve Başla'da yeniden yazılır, oturum raporları Günlük'e düşer.

type Props = { project: ProjectSummary; open: boolean; onClose: () => void }

export function BridgeDialog({ project, open, onClose }: Props) {
  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      label="Claude Code köprüsü"
      width={720}
      placement="high"
    >
      {open && <BridgeBody project={project} onClose={onClose} />}
    </DialogFrame>
  )
}

function BridgeBody({ project, onClose }: { project: ProjectSummary; onClose: () => void }) {
  const status = useQuery({
    queryKey: ['project', 'bridge', project.id],
    queryFn: () => window.api.invoke('bridge:status', { projectId: project.id }),
  })
  const s = status.data
  return (
    <ModalPanel
      title="Claude Code köprüsü"
      fill={project.color}
      onClose={onClose}
      hints="Köprü dosya üzerinden çalışır; AI çağrısı yok. Kaldırınca eklenenler geri alınır."
    >
      {!s ? (
        <Skeleton className="h-[240px] rounded-field" />
      ) : s.folders.length === 0 ? (
        <p className="m-0 text-[15px] text-ink2">
          Projeye klasör bağlı değil; köprü bir klasöre kurulur.
        </p>
      ) : (
        s.folders.map((f) => (
          <FolderBridge key={f.folderId} project={project} status={s} folder={f} />
        ))
      )}
    </ModalPanel>
  )
}

type Folder = BridgeStatus['folders'][number]

function FolderBridge({
  project,
  status: s,
  folder: f,
}: {
  project: ProjectSummary
  status: BridgeStatus
  folder: Folder
}) {
  const client = useQueryClient()
  const { toast } = useToast()
  const [claudeMd, setClaudeMd] = useState(true)
  const [script, setScript] = useState(s.unity)
  const [gitignore, setGitignore] = useState(f.git)
  const [busy, setBusy] = useState(false)
  const refresh = () => client.invalidateQueries({ queryKey: ['project'] })

  async function run(fn: () => Promise<void>, message: string) {
    setBusy(true)
    try {
      await fn()
      await refresh()
      toast({ domain: 'projects', message })
    } catch (e) {
      toast({ message: errorText(e), domain: 'warning' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <span className="font-mono text-[13px] font-semibold text-ink2">{f.path}</span>
      {!f.exists ? (
        <p className="m-0 text-[15px] text-t-coral">Klasör bulunamadı.</p>
      ) : f.enabled ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]">
            <li>
              ✓{' '}
              <code className="rounded bg-s2 px-1 font-mono text-[13px]">
                .secondmind/BAGLAM.md
              </code>{' '}
              her Güncelle'de ve Başla'da yeniden yazılıyor
            </li>
            <li>{f.claudeMd ? '✓' : '–'} CLAUDE.md bölümü</li>
            {s.unity && <li>{f.scriptInstalled ? '✓' : '–'} Editor betiği (zaman makinesi)</li>}
            {f.git && <li>{f.gitignore ? '✓' : '–'} .gitignore satırı</li>}
            {f.pendingReports > 0 && (
              <li className="font-bold">
                {f.pendingReports} oturum raporu bekliyor · Güncelle ile Günlük'e işlenir
              </li>
            )}
          </ul>
          <div>
            <Button
              variant="danger"
              icon={Unlink}
              loading={busy}
              onClick={() =>
                void run(
                  () => window.api.invoke('bridge:uninstall', { folderId: f.folderId }),
                  'Köprü kaldırıldı; oturum raporları ve kareler yerinde.',
                )
              }
            >
              Köprüyü kaldır
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-[15px] leading-[1.45] text-ink2">
            Klasöre <code className="rounded bg-s2 px-1 font-mono text-[13px]">.secondmind/</code>{' '}
            açılır (BAGLAM.md, oturumlar/, goruntuler/). Aşağıdakiler senin seçimin:
          </p>
          <Option
            checked={claudeMd}
            onChange={setClaudeMd}
            label="CLAUDE.md'nin sonuna köprü bölümünü ekle"
            hint="Claude Code oturum başında BAGLAM.md'yi okur, sonunda rapor yazar. Dosya yoksa oluşturulur."
            preview={s.addendum}
          />
          {s.unity && (
            <Option
              checked={script}
              onChange={setScript}
              label="Editor betiğini kopyala (Assets/Editor/SecondMindSnapshot.cs)"
              hint="Play'e her gün ilk girişte bir kare kaydeder; yapıya girmez."
              preview={s.script}
            />
          )}
          {f.git && (
            <Option
              checked={gitignore}
              onChange={setGitignore}
              label=".gitignore'a .secondmind/ ekle"
              hint="Bağlam ve raporlar depoya girmez."
            />
          )}
          <div>
            <Button
              icon={Link2}
              loading={busy}
              onClick={() =>
                void run(
                  () =>
                    window.api.invoke('bridge:install', {
                      folderId: f.folderId,
                      claudeMd,
                      script: s.unity && script,
                      gitignore: f.git && gitignore,
                    }),
                  `${project.name} köprüsü kuruldu; BAGLAM.md yazıldı.`,
                )
              }
            >
              Köprüyü kur
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

function Option({
  checked,
  onChange,
  label,
  hint,
  preview,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
  preview?: string
}) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className="flex flex-col gap-1.5 rounded-field bg-s2 px-4 py-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 size-4 accent-ink"
        />
        <span className="flex flex-col">
          <span className="text-[15px] font-bold">{label}</span>
          <span className="text-[13px] font-semibold text-ink3">{hint}</span>
        </span>
      </label>
      {preview && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex cursor-pointer items-center gap-1 self-start rounded-full px-2 py-0.5 text-[13px] font-bold text-ink2 hover:bg-hover"
          >
            <Chevron size={14} strokeWidth={1.75} aria-hidden /> İçeriği göster
          </button>
          {open && (
            <pre
              className={cn(
                'm-0 max-h-[240px] overflow-auto rounded-[12px] bg-bg p-3 font-mono text-[12px] leading-[1.45] whitespace-pre-wrap',
              )}
            >
              {preview}
            </pre>
          )}
        </>
      )}
    </div>
  )
}
