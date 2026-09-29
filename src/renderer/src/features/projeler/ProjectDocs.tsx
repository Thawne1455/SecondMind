import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileSymlink,
  FileText,
  Gavel,
  Link2,
  Plus,
  Search,
  X,
} from 'lucide-react'
import type { DocFileSuggestion, DocSummary, ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, cn, IconButton, Input, Menu, Skeleton, useToast } from '../../ui'
import { ListSkeleton } from '../bilgi/rows'
import { DocEditor } from './DocEditor'
import { GddStrip } from './GddCompare'
import { dropZone, KIND_TAG, moveTarget, visibleRows, type DropZone } from './docTree'
import { KIND_LABEL } from './labels'
import {
  useApplyDocTemplate,
  useCreateDoc,
  useDoc,
  useDocFileSuggestions,
  useDocs,
  useDocSearch,
  useGddCompare,
  useLinkDocFile,
  useMoveDoc,
} from './useDocs'

// Projeler > Dokümanlar (PROJELER.md > 4. Dokümantasyon, 5d-1). "Projenin tasarımı ve kararları nerede yazıyor?"
// Notlar'dan farkı: yapılandırılmış, iç içe sayfa ağacı (sürüklenerek sıralanır), tür şablonu, ADR, bağlı dosyalar.
// Solda ağaç + arama + klasördeki bağlanmamış markdown'lar; sağda seçili sayfa (URL'de).

const DOC_DRAG_TYPE = 'application/x-secondmind-doc'

export function ProjectDocs({ project, docId }: { project: ProjectSummary; docId?: string }) {
  const navigate = useNavigate()
  const base = `/projeler/${project.id}/dokumanlar`
  const list = useDocs(project.id)
  const docs = useMemo(() => list.data ?? [], [list.data])
  const suggestions = useDocFileSuggestions(project.id, !!project.folderPath).data ?? []

  // Sayfa seçili değilse GDD, yoksa ilk sayfa açılır.
  const first = (docs.find((d) => d.kind === 'gdd') ?? visibleRows(docs, new Set())[0]?.doc)?.id
  useEffect(() => {
    if (!docId && first) void navigate(`${base}/${first}`, { replace: true })
  }, [docId, first, base, navigate])

  if (list.isPending)
    return (
      <section className="flex gap-6">
        <div className="w-[320px]">
          <ListSkeleton />
        </div>
        <Skeleton className="h-[420px] grow rounded-tile" />
      </section>
    )

  if (docs.length === 0) return <EmptyDocs project={project} suggestions={suggestions} />

  return (
    <section aria-label="Dokümanlar" className="flex min-h-[560px] grow items-start gap-6">
      <DocSidebar project={project} docs={docs} docId={docId} suggestions={suggestions} />
      <DocPane project={project} docId={docId} />
    </section>
  )
}

// ---------------------------------------------------------------- boş durum

function EmptyDocs({
  project,
  suggestions,
}: {
  project: ProjectSummary
  suggestions: DocFileSuggestion[]
}) {
  const apply = useApplyDocTemplate()
  const navigate = useNavigate()
  const { toast } = useToast()
  const template =
    project.kind === 'unity'
      ? 'GDD şablonuyla başla'
      : project.kind === 'software'
        ? 'Teknik doküman şablonuyla başla'
        : project.kind === 'creative'
          ? 'Yaratıcı proje şablonuyla başla'
          : 'İlk sayfayı aç'
  return (
    <section className="flex max-w-[760px] flex-col gap-4 rounded-tile bg-s2 px-6 py-6">
      <span className="text-[20px] leading-[1.25] font-extrabold">
        Projenin yaşayan dokümanı burada. {KIND_LABEL[project.kind]} için hazır bir sayfa ağacıyla
        başla
        {suggestions.length > 0 && ' ya da klasördeki markdown dosyalarını bağla'}.
      </span>
      <div>
        <Button
          icon={FilePlus2}
          loading={apply.isPending}
          onClick={() =>
            apply.mutate(project.id, {
              onSuccess: (docs) => {
                const first = docs.find((d) => d.kind === 'gdd') ?? docs[0]
                if (first) void navigate(`/projeler/${project.id}/dokumanlar/${first.id}`)
              },
              onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
            })
          }
        >
          {template}
        </Button>
      </div>
      {suggestions.length > 0 && <FileSuggestions project={project} items={suggestions} />}
    </section>
  )
}

function FileSuggestions({
  project,
  items,
}: {
  project: ProjectSummary
  items: DocFileSuggestion[]
}) {
  const link = useLinkDocFile()
  const navigate = useNavigate()
  const { toast } = useToast()
  return (
    <div className="flex flex-col gap-1.5">
      <span className="cx text-ink2">Klasörde bağlanmamış · {items.length}</span>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.slice(0, 12).map((f) => (
          <li
            key={f.path}
            className="flex items-center gap-2 rounded-[14px] bg-bg py-1 pr-1 pl-3"
            title={f.path}
          >
            <FileText size={15} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink3" />
            <span className="min-w-0 grow truncate font-mono text-[13px] font-semibold">
              {f.relative}
            </span>
            {f.gdd && (
              <span
                className="cx rounded-full px-2 py-px"
                style={{ backgroundColor: project.color }}
              >
                GDD
              </span>
            )}
            <IconButton
              label="Bağla"
              icon={Link2}
              className="size-8"
              onClick={() =>
                link.mutate(
                  { projectId: project.id, path: f.path },
                  {
                    onSuccess: (d) => void navigate(`/projeler/${project.id}/dokumanlar/${d.id}`),
                    onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
                  },
                )
              }
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------- ağaç

type SidebarProps = {
  project: ProjectSummary
  docs: DocSummary[]
  docId?: string
  suggestions: DocFileSuggestion[]
}

function DocSidebar({ project, docs, docId, suggestions }: SidebarProps) {
  const navigate = useNavigate()
  const base = `/projeler/${project.id}/dokumanlar`
  const create = useCreateDoc()
  const move = useMoveDoc()
  const { toast } = useToast()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [showFiles, setShowFiles] = useState(false)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; zone: DropZone } | null>(null)
  const search = useDocSearch(project.id, query)
  const rows = visibleRows(docs, collapsed)
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })

  function add(kind: 'page' | 'adr', parentId?: string) {
    create.mutate(
      { projectId: project.id, kind, parentId, title: kind === 'adr' ? '' : '' },
      { onSuccess: (d) => void navigate(`${base}/${d.id}`), onError },
    )
  }

  function onDrop(e: DragEvent, target: string) {
    const id = e.dataTransfer.getData(DOC_DRAG_TYPE)
    const zone = over?.zone ?? 'inside'
    setOver(null)
    setDrag(null)
    if (!id) return
    e.preventDefault()
    const to = moveTarget(docs, id, target, zone)
    if (!to) return
    if (zone === 'inside') setCollapsed((c) => new Set([...c].filter((x) => x !== target)))
    move.mutate({ id, ...to }, { onError })
  }

  const searching = query.trim().length > 1

  return (
    <div className="sticky top-4 flex w-[320px] shrink-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="cx grow">Dokümanlar · {docs.length}</span>
        <Button size="sm" icon={Plus} loading={create.isPending} onClick={() => add('page')}>
          Sayfa
        </Button>
        <Menu
          align="end"
          label="Ekle"
          items={[
            { id: 'adr', label: 'Karar (ADR)', description: 'Kararlar sayfasının altına' },
            ...(docId
              ? [{ id: 'child', label: 'Alt sayfa', description: 'Açık sayfanın altına' }]
              : []),
            ...(suggestions.length
              ? [{ id: 'files', label: `Dosya bağla · ${suggestions.length}` }]
              : []),
          ]}
          onSelect={(id) => {
            if (id === 'adr') add('adr')
            else if (id === 'child' && docId) add('page', docId)
            else if (id === 'files') setShowFiles(true)
          }}
          trigger={(props) => <IconButton {...props} label="Ekle" icon={ChevronDown} />}
        />
      </div>

      <div className="relative">
        <Search
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink3"
        />
        <Input
          value={query}
          placeholder="Dokümanlarda ara"
          aria-label="Dokümanlarda ara"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          className="h-[40px] pl-10"
        />
        {query && (
          <IconButton
            label="Aramayı temizle"
            icon={X}
            onClick={() => setQuery('')}
            className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
          />
        )}
      </div>

      {searching ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Arama sonuçları">
          {(search.data ?? []).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => void navigate(`${base}/${r.id}`)}
                className={cn(
                  'flex w-full cursor-pointer flex-col rounded-[14px] px-3 py-2 text-left hover:bg-hover focus-visible:outline-3 focus-visible:outline-indigo',
                  r.id === docId && 'bg-s2',
                )}
              >
                <span className="truncate text-[15px] font-bold">{r.title || 'Adsız sayfa'}</span>
                {r.snippet && (
                  <span className="line-clamp-2 text-[13px] text-ink2">
                    <Highlighted text={r.snippet} ranges={r.ranges} />
                  </span>
                )}
              </button>
            </li>
          ))}
          {search.isSuccess && !search.data.length && (
            <li className="px-3 text-[14px] text-ink3">Eşleşen sayfa yok.</li>
          )}
        </ul>
      ) : (
        <ul
          role="tree"
          aria-label="Sayfa ağacı"
          className="m-0 flex list-none flex-col gap-0.5 p-0"
        >
          {rows.map(({ doc: d, depth, hasChildren }) => {
            const open = !collapsed.has(d.id)
            const Chevron = open ? ChevronDown : ChevronRight
            const tag = KIND_TAG[d.kind]
            const zone = over?.id === d.id ? over.zone : null
            const Icon = d.linkedPath ? FileSymlink : d.kind === 'adr' ? Gavel : FileText
            return (
              <li
                key={d.id}
                role="treeitem"
                aria-selected={d.id === docId}
                aria-expanded={hasChildren ? open : undefined}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DOC_DRAG_TYPE, d.id)
                  e.dataTransfer.effectAllowed = 'move'
                  setDrag(d.id)
                }}
                onDragEnd={() => {
                  setDrag(null)
                  setOver(null)
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DOC_DRAG_TYPE) || drag === d.id) return
                  e.preventDefault()
                  const rect = e.currentTarget.getBoundingClientRect()
                  const z = dropZone(e.clientY - rect.top, rect.height)
                  if (over?.id !== d.id || over.zone !== z) setOver({ id: d.id, zone: z })
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
                }}
                onDrop={(e) => onDrop(e, d.id)}
                className={cn(
                  'group/doc relative flex items-center gap-1 rounded-[14px] pr-2 transition-colors duration-150',
                  d.id === docId ? 'bg-ink text-on-ink' : 'hover:bg-hover',
                  zone === 'inside' && 'bg-amber/40 text-ink',
                  drag === d.id && 'opacity-40',
                )}
                style={{ paddingLeft: 4 + depth * 18 }}
              >
                {zone === 'before' && (
                  <span className="absolute inset-x-2 -top-px h-[3px] rounded-full bg-amber" />
                )}
                {zone === 'after' && (
                  <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-amber" />
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden={!hasChildren}
                  onClick={() =>
                    setCollapsed((c) => {
                      const next = new Set(c)
                      if (next.has(d.id)) next.delete(d.id)
                      else next.add(d.id)
                      return next
                    })
                  }
                  className={cn(
                    'grid size-6 shrink-0 cursor-pointer place-items-center rounded-full',
                    !hasChildren && 'invisible',
                  )}
                >
                  <Chevron size={15} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => void navigate(`${base}/${d.id}`)}
                  className="flex min-w-0 grow cursor-pointer items-center gap-2 py-1.5 text-left focus-visible:outline-3 focus-visible:outline-indigo"
                >
                  <Icon size={15} strokeWidth={1.75} aria-hidden className="shrink-0 opacity-70" />
                  <span className={cn('truncate text-[15px] font-bold', !d.title && 'opacity-50')}>
                    {d.title || 'Adsız sayfa'}
                  </span>
                  {tag && d.kind === 'gdd' && (
                    <span
                      className="cx shrink-0 rounded-full px-1.5 py-px text-[11px] text-fill-ink"
                      style={{ backgroundColor: project.color }}
                    >
                      {tag}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {suggestions.length > 0 && !searching && (
        <div className="flex flex-col gap-1.5 border-t-2 border-s2 pt-3">
          <button
            type="button"
            aria-expanded={showFiles}
            onClick={() => setShowFiles(!showFiles)}
            className="flex cursor-pointer items-center gap-1.5 self-start rounded-full px-2 py-1 hover:bg-hover focus-visible:outline-3 focus-visible:outline-indigo"
          >
            {showFiles ? (
              <ChevronDown size={15} strokeWidth={1.75} aria-hidden />
            ) : (
              <ChevronRight size={15} strokeWidth={1.75} aria-hidden />
            )}
            <span className="cx text-ink2">Klasörde · {suggestions.length} markdown</span>
          </button>
          {showFiles && <FileSuggestions project={project} items={suggestions} />}
        </div>
      )}
    </div>
  )
}

/** Arama parçası: eşleşen aralıklar amber. */
function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const parts: React.ReactNode[] = []
  let at = 0
  for (const [s, e] of ranges) {
    if (s > at) parts.push(text.slice(at, s))
    parts.push(
      <mark key={s} className="rounded bg-amber/70 px-0.5 text-ink">
        {text.slice(s, e)}
      </mark>,
    )
    at = e
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

// ---------------------------------------------------------------- sağ taraf

function DocPane({ project, docId }: { project: ProjectSummary; docId?: string }) {
  const q = useDoc(docId)
  if (!docId) return null
  // Editör içeriği kurulurken bir kez okunur: önbellekteki eski gövdeyle açılmasın.
  if (q.isPending || (q.isFetching && !q.isFetchedAfterMount))
    return <Skeleton className="h-[420px] grow rounded-tile" />
  if (q.isError) return <p className="m-0 grow text-ink2">Sayfa açılamadı: {errorText(q.error)}</p>
  return (
    <div className="flex min-w-0 grow flex-col gap-4">
      {q.data.kind === 'gdd' && <GddPanel project={project} />}
      <DocEditor key={q.data.id} project={project} doc={q.data} />
    </div>
  )
}

function GddPanel({ project }: { project: ProjectSummary }) {
  const { data } = useGddCompare(project.id)
  return data ? <GddStrip project={project} data={data} /> : null
}
