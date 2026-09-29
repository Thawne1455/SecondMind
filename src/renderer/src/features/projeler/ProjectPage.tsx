import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import {
  ArrowLeft,
  Copy,
  FolderOpen,
  MoreHorizontal,
  ParkingSquare,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react'
import { PROJECT_COLORS, PROJECT_NAME_MAX, type ProjectSummary } from '@shared/ipc'
import { TopBar } from '../../app/TopBar'
import { useShell } from '../../app/shell-context'
import { errorText } from '../../lib/errors'
import { typingOrDialog } from '../../lib/keys'
import { useNow } from '../../lib/useNow'
import { formatAgo } from '../../lib/format'
import { Button, Chip, cn, EmptyState, IconButton, Kbd, Menu, Skeleton, useToast } from '../../ui'
import { useNotes } from '../bilgi/useKnowledge'
import { BriefingBand } from './BriefingBand'
import { Cockpit } from './Cockpit'
import { ProjectNotes } from './ProjectNotes'
import { TaskBoard } from './TaskBoard'
import { formatTimer, KIND_LABEL, STATUS_LABEL } from './labels'
import {
  useDeleteProject,
  useProjectOpened,
  useProjects,
  useRestoreProject,
  useProjectTasks,
  useScan,
  useUpdateProject,
} from './useProjects'

// Proje detayı: proje renginde başlık bandı + sekmeler (Kokpit, Görevler, Notlar; yapılmamış sekmeler görünmez).
// Klavye: B başla/kapat, P park (yazı alanında değilken), Ctrl 1 / 2 / 3 sekme.

export function ProjectPage() {
  const { projectId } = useParams()
  const { data, isPending } = useProjects()
  const project = data?.find((p) => p.id === projectId)

  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-8">
      <TopBar title="Projeler" />
      {isPending ? (
        <>
          <Skeleton className="h-[188px] rounded-tile" />
          <Skeleton className="h-[320px] rounded-tile" />
        </>
      ) : !project ? (
        <EmptyState
          className="h-60 max-w-[640px]"
          title="Proje bulunamadı"
          message="Silinmiş ya da taşınmış olabilir."
          action={{ label: 'Projelere dön', icon: ArrowLeft, onClick: () => history.back() }}
        />
      ) : (
        <ProjectView key={project.id} project={project} />
      )}
    </main>
  )
}

type Tab = 'cockpit' | 'tasks' | 'notes'

/** Sekmelerin yolu ve kısayolu (Ctrl + sıra). */
const TAB_PATH: Record<Tab, string> = { cockpit: '', tasks: '/gorevler', notes: '/notlar' }
const TAB_ORDER: Tab[] = ['cockpit', 'tasks', 'notes']

function ProjectView({ project }: { project: ProjectSummary }) {
  const { startSession, closeSession, openPark } = useShell()
  const session = project.activeSession
  const { noteId } = useParams()
  const navigate = useNavigate()
  const path = useLocation().pathname
  const tab: Tab = path.includes('/notlar')
    ? 'notes'
    : path.includes('/gorevler')
      ? 'tasks'
      : 'cockpit'
  const { briefing, dismiss } = useProjectOpened(project.id)
  const now = useNow(60_000)

  useEffect(() => {
    function onTabKey(e: KeyboardEvent) {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return
      const next = TAB_ORDER[Number(e.key) - 1]
      if (next) {
        e.preventDefault()
        void navigate(`/projeler/${project.id}${TAB_PATH[next]}`)
      }
    }
    window.addEventListener('keydown', onTabKey)
    return () => window.removeEventListener('keydown', onTabKey)
  }, [project.id, navigate])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey || typingOrDialog(e)) return
      const k = e.key.toLocaleLowerCase('tr-TR')
      if (k === 'b') {
        e.preventDefault()
        if (session) closeSession()
        else startSession(project.id)
      } else if (k === 'p') {
        e.preventDefault()
        openPark(project.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [project.id, session, startSession, closeSession, openPark])

  return (
    <>
      <HeaderBand project={project} />
      <Tabs project={project} tab={tab} />
      {tab === 'notes' ? (
        <ProjectNotes project={project} noteId={noteId} />
      ) : tab === 'tasks' ? (
        <TaskBoard project={project} />
      ) : (
        <>
          {briefing && (
            <BriefingBand
              project={project}
              briefing={briefing}
              now={now}
              onDismiss={dismiss}
              onStart={() => {
                dismiss()
                startSession(project.id)
              }}
            />
          )}
          <Cockpit project={project} />
        </>
      )}
    </>
  )
}

function Tabs({ project, tab }: { project: ProjectSummary; tab: Tab }) {
  const navigate = useNavigate()
  const notes = useNotes({ projectId: project.id }).data?.length ?? 0
  const open = (useProjectTasks(project.id).data ?? []).filter((t) => t.status === 'open').length
  const labels: Record<Tab, string> = {
    cockpit: 'Kokpit',
    tasks: open ? `Görevler · ${open}` : 'Görevler',
    notes: notes ? `Notlar · ${notes}` : 'Notlar',
  }
  const items = TAB_ORDER.map((id, i) => ({
    id,
    label: labels[id],
    to: `/projeler/${project.id}${TAB_PATH[id]}`,
    key: `Ctrl ${i + 1}`,
  }))
  return (
    <nav aria-label="Proje sekmeleri" className="flex items-center gap-2">
      {items.map((t) => (
        <Chip
          key={t.id}
          selected={tab === t.id}
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => void navigate(t.to)}
        >
          {t.label}
          <span className="ml-2 text-[12px] font-semibold opacity-50">{t.key}</span>
        </Chip>
      ))}
    </nav>
  )
}

const MENU_BASE = [
  { id: 'rename', label: 'Adı değiştir' },
  { id: 'color', label: 'Rengi değiştir' },
]

function HeaderBand({ project: p }: { project: ProjectSummary }) {
  const now = useNow(15_000)
  const navigate = useNavigate()
  const { startSession, closeSession, openPark } = useShell()
  const update = useUpdateProject()
  const remove = useDeleteProject()
  const restore = useRestoreProject()
  const { toast } = useToast()
  const scan = useScan()
  const [mode, setMode] = useState<'rename' | 'color' | null>(null)
  const [name, setName] = useState(p.name)
  const session = p.activeSession
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })

  const menu = [
    ...MENU_BASE,
    p.status === 'active'
      ? { id: 'pause', label: 'Duraklat', description: 'Şeritlerde alta iner' }
      : { id: 'activate', label: 'Aktif yap' },
    p.status === 'archived'
      ? { id: 'unarchive', label: 'Arşivden çıkar' }
      : { id: 'archive', label: 'Arşivle' },
    { id: 'delete', label: 'Çöp kutusuna at' },
  ]

  function onMenu(id: string) {
    if (id === 'rename') {
      setName(p.name)
      setMode('rename')
    } else if (id === 'color') setMode('color')
    else if (id === 'pause') update.mutate({ id: p.id, status: 'paused' }, { onError })
    else if (id === 'activate' || id === 'unarchive')
      update.mutate({ id: p.id, status: 'active' }, { onError })
    else if (id === 'archive') update.mutate({ id: p.id, status: 'archived' }, { onError })
    else if (id === 'delete')
      // Silinince bu görünüm kapanır; yönlendirme ve toast için mutateAsync.
      remove.mutateAsync(p.id).then(() => {
        void navigate('/projeler')
        toast({
          message: `${p.name} çöp kutusunda.`,
          domain: 'projects',
          action: { label: 'Geri al', onClick: () => restore.mutate(p.id, { onError }) },
        })
      }, onError)
  }

  function saveName() {
    const value = name.trim()
    if (value && value !== p.name) update.mutate({ id: p.id, name: value }, { onError })
    setMode(null)
  }

  return (
    <header
      className="flex min-h-[164px] flex-col justify-between gap-4 rounded-tile px-8 pt-5 pb-6 text-fill-ink"
      style={{ backgroundColor: p.color }}
    >
      <div className="flex items-center gap-3">
        <Link
          to="/projeler"
          className="cx flex items-center gap-1.5 rounded-full opacity-70 hover:opacity-100 focus-visible:outline-3 focus-visible:outline-indigo"
        >
          <ArrowLeft size={16} strokeWidth={2} aria-hidden /> Projeler
        </Link>
        <span className="cx opacity-70">· {KIND_LABEL[p.kind]}</span>
        {p.status !== 'active' && (
          <span className="cx rounded-full bg-fill-ink px-3 py-0.5 text-white">
            {STATUS_LABEL[p.status]}
          </span>
        )}
        <span className="grow" />
        {p.folderPath && (
          <>
            <button
              type="button"
              title="Yolu kopyala"
              onClick={() => {
                void navigator.clipboard.writeText(p.folderPath!)
                toast({ message: 'Klasör yolu kopyalandı.', domain: 'projects' })
              }}
              className="flex max-w-[420px] cursor-pointer items-center gap-2 rounded-full bg-[rgba(19,19,22,.1)] px-3 py-1 font-mono text-[13px] font-semibold hover:bg-[rgba(19,19,22,.16)] focus-visible:outline-3 focus-visible:outline-indigo"
            >
              <span className="truncate">{p.folderPath}</span>
              <Copy size={13} strokeWidth={2} aria-hidden className="shrink-0" />
            </button>
            <IconButton
              label="Klasörde aç"
              icon={FolderOpen}
              variant="onTileGhost"
              onClick={() =>
                void window.api.invoke('project:openFolder', { id: p.id }).catch(onError)
              }
            />
            <Button
              size="sm"
              variant="onTileGhost"
              icon={RefreshCw}
              loading={scan.isPending}
              loadingLabel="Taranıyor…"
              title="Sadece bu projenin klasörünü tara"
              onClick={() =>
                scan.mutate(p.id, {
                  onSuccess: (r) => {
                    const errors = r.projects.flatMap((x) => x.errors)
                    toast(
                      errors.length
                        ? { message: errors.join(' · '), domain: 'warning' }
                        : { message: r.toast ?? 'Yeni bir şey yok.', domain: 'projects' },
                    )
                  },
                  onError,
                })
              }
            >
              Tara
              {p.lastScanAt !== null && (
                <span className="ml-1.5 text-[12px] font-semibold opacity-60">
                  {formatAgo(p.lastScanAt, now)}
                </span>
              )}
            </Button>
          </>
        )}
        <Menu
          align="end"
          items={menu}
          onSelect={onMenu}
          label="Proje menüsü"
          trigger={(props) => (
            <IconButton
              {...props}
              label="Proje menüsü"
              icon={MoreHorizontal}
              variant="onTileGhost"
            />
          )}
        />
      </div>

      <div className="flex items-end gap-8">
        <div className="min-w-0 grow">
          {mode === 'rename' ? (
            <input
              autoFocus
              value={name}
              maxLength={PROJECT_NAME_MAX}
              aria-label="Proje adı"
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') setMode(null)
              }}
              className="x w-full rounded-field bg-[rgba(255,255,255,.35)] px-3 text-[48px] leading-[1.05] font-black uppercase outline-none"
            />
          ) : mode === 'color' ? (
            <div role="radiogroup" aria-label="Proje rengi" className="flex items-center gap-2.5">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={p.color === c}
                  aria-label={c}
                  autoFocus={p.color === c}
                  onClick={() => {
                    update.mutate({ id: p.id, color: c }, { onError })
                    setMode(null)
                  }}
                  onKeyDown={(e) => e.key === 'Escape' && setMode(null)}
                  className={cn(
                    'size-12 cursor-pointer rounded-full ring-3 ring-fill-ink/20 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
                    p.color === c && 'ring-fill-ink',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <Button size="sm" variant="onTileGhost" onClick={() => setMode(null)}>
                Vazgeç
              </Button>
            </div>
          ) : (
            <h1
              className="x m-0 line-clamp-2 text-[48px] leading-[.95] font-black break-words uppercase"
              onDoubleClick={() => onMenu('rename')}
            >
              {p.name}
            </h1>
          )}
        </div>

        <div className="flex shrink-0 items-end gap-3">
          {session && (
            <span className="flex flex-col items-end leading-none">
              <span className="cx pb-1.5 opacity-70">Oturumda</span>
              <span className="x text-[48px] font-black" aria-live="off">
                {formatTimer(now - session.startedAt)}
              </span>
            </span>
          )}
          <Button
            variant="onTileGhost"
            icon={ParkingSquare}
            onClick={() => openPark(p.id)}
            title="P"
            className="h-12"
          >
            Park et
            <Kbd tone="onFill" className="ml-2">
              P
            </Kbd>
          </Button>
          {session ? (
            <Button variant="onTile" size="lg" icon={Square} onClick={closeSession}>
              Oturumu kapat
              <Kbd className="ml-2 bg-white/20 text-white">B</Kbd>
            </Button>
          ) : (
            <Button variant="onTile" size="lg" icon={Play} onClick={() => startSession(p.id)}>
              Başla
              <Kbd className="ml-2 bg-white/20 text-white">B</Kbd>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
