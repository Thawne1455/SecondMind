import { FileText, Link2, MoreHorizontal, Paperclip } from 'lucide-react'
import type { Asset, ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, DropZone, IconButton, Menu, Skeleton, useToast } from '../../ui'
import { TimeMachine } from './TimeMachine'
import { useDocs } from './useDocs'
import { fileInput, useAddAsset, useAssets, useTimeMachine, useUpdateAsset } from './useAssets'
import { useProjectTasks } from './useProjects'

// Projeler > Varlıklar (PROJELER.md > 6. Varlıklar, 5d-4). "Projenin görselleri, sesleri, belgeleri nerede?"
// İlk bölüm zaman makinesi (Unity projesinde ya da karesi olan projede), sonra varlık ızgarası: resimde
// önizleme, seste oynatıcı. Varlık bir sayfaya ya da göreve bağlanabilir. Yaratıcı projede klasördeki
// ses/görsel dosyaları da listelenir (kopyalanmaz).

export function ProjectAssets({ project }: { project: ProjectSummary }) {
  const machine = useTimeMachine(project.id)
  const assets = useAssets(project.id)
  const add = useAddAsset()
  const { toast } = useToast()
  const showMachine = project.kind === 'unity' || (machine.data?.shots.length ?? 0) > 0

  async function onFiles(files: File[]) {
    for (const f of files) {
      try {
        await add.mutateAsync({ projectId: project.id, ...(await fileInput(f)) })
      } catch (e) {
        toast({ message: `${f.name}: ${errorText(e)}`, domain: 'warning' })
      }
    }
  }

  const own = (assets.data ?? []).filter((a) => !a.external)
  const external = (assets.data ?? []).filter((a) => a.external)

  return (
    <div className="flex flex-col gap-8">
      {showMachine &&
        (machine.data ? (
          <TimeMachine project={project} data={machine.data} />
        ) : (
          <Skeleton className="h-[260px] rounded-tile" />
        ))}

      <section aria-label="Varlıklar" className="flex flex-col gap-3">
        <h2 className="cx m-0">Varlıklar · {own.length}</h2>
        <DropZone
          onFiles={(files) => void onFiles(files)}
          label="Görsel, ses ya da PDF bırak (kopyalanır)"
        />
        {assets.isPending ? (
          <Skeleton className="h-[180px] rounded-tile" />
        ) : (
          own.length > 0 && <AssetGrid project={project} items={own} />
        )}
      </section>

      {external.length > 0 && (
        <section aria-label="Klasördeki dosyalar" className="flex flex-col gap-3">
          <h2 className="cx m-0">Klasörde · {external.length}</h2>
          <AssetGrid project={project} items={external} />
        </section>
      )}
    </div>
  )
}

function AssetGrid({ project, items }: { project: ProjectSummary; items: Asset[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-0">
      {items.map((a) => (
        <AssetCard key={a.id} project={project} asset={a} />
      ))}
    </ul>
  )
}

function AssetCard({ project, asset: a }: { project: ProjectSummary; asset: Asset }) {
  const update = useUpdateAsset()
  const docs = useDocs(project.id).data ?? []
  const tasks = (useProjectTasks(project.id).data ?? []).filter((t) => t.status === 'open')
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const linkedDoc = docs.find((d) => d.id === a.docId)
  const linkedTask = tasks.find((t) => t.id === a.taskId)
  const open = () => void window.api.invoke('asset:open', { id: a.id }).catch(onError)

  const menu = [
    { id: 'open', label: 'Aç' },
    ...(a.external
      ? []
      : [
          ...docs
            .filter((d) => d.id !== a.docId)
            .slice(0, 12)
            .map((d) => ({
              id: `doc:${d.id}`,
              label: d.title || 'Adsız sayfa',
              description: 'Sayfaya bağla',
            })),
          ...tasks
            .filter((t) => t.id !== a.taskId)
            .slice(0, 12)
            .map((t) => ({ id: `task:${t.id}`, label: t.title, description: 'Göreve bağla' })),
          ...(a.docId || a.taskId ? [{ id: 'unlink', label: 'Bağları kaldır' }] : []),
          { id: 'delete', label: 'Çöp kutusuna at' },
        ]),
  ]

  function onMenu(id: string) {
    if (id === 'open') open()
    else if (id.startsWith('doc:')) update.mutate({ id: a.id, docId: id.slice(4) }, { onError })
    else if (id.startsWith('task:')) update.mutate({ id: a.id, taskId: id.slice(5) }, { onError })
    else if (id === 'unlink') update.mutate({ id: a.id, docId: null, taskId: null }, { onError })
    else if (id === 'delete')
      update.mutate(
        { id: a.id, deleted: true },
        {
          onSuccess: () =>
            toast({
              domain: 'projects',
              message: `"${a.title}" çöp kutusunda.`,
              action: {
                label: 'Geri al',
                onClick: () => update.mutate({ id: a.id, deleted: false }),
              },
            }),
          onError,
        },
      )
  }

  return (
    <li className="flex flex-col gap-2 rounded-tile bg-s2 p-3">
      {a.kind === 'image' ? (
        <button
          type="button"
          onClick={open}
          className="aspect-video cursor-pointer overflow-hidden rounded-[18px] bg-bg focus-visible:outline-3 focus-visible:outline-indigo"
        >
          <img src={a.url} alt="" loading="lazy" className="h-full w-full object-contain" />
        </button>
      ) : a.kind === 'audio' ? (
        <audio controls preload="none" src={a.url} className="w-full" />
      ) : (
        <button
          type="button"
          onClick={open}
          className="grid aspect-video cursor-pointer place-items-center rounded-[18px] bg-bg text-ink3 focus-visible:outline-3 focus-visible:outline-indigo"
        >
          {a.kind === 'pdf' ? (
            <FileText size={40} strokeWidth={1.5} aria-hidden />
          ) : (
            <Paperclip size={40} strokeWidth={1.5} aria-hidden />
          )}
        </button>
      )}
      <div className="flex items-start gap-1">
        <div className="flex min-w-0 grow flex-col">
          <span className="truncate text-[14px] font-bold" title={a.title}>
            {a.title}
          </span>
          {(linkedDoc || linkedTask) && (
            <span className="flex items-center gap-1 truncate text-[13px] font-semibold text-ink3">
              <Link2 size={13} strokeWidth={1.75} aria-hidden />
              {linkedDoc ? linkedDoc.title || 'Adsız sayfa' : linkedTask!.title}
            </span>
          )}
        </div>
        <Menu
          align="end"
          label="Varlık menüsü"
          items={menu}
          onSelect={onMenu}
          className="max-h-[360px] overflow-y-auto"
          trigger={(props) => (
            <IconButton {...props} label="Varlık menüsü" icon={MoreHorizontal} className="size-8" />
          )}
        />
      </div>
      {a.kind === 'pdf' && (
        <Button
          size="sm"
          variant="secondary"
          className="[--btn-soft:var(--bg)] self-start"
          onClick={open}
        >
          Aç
        </Button>
      )}
    </li>
  )
}
