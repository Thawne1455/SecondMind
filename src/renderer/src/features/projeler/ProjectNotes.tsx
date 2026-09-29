import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import type { ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatAgo } from '../../lib/format'
import { useNow } from '../../lib/useNow'
import { Button, EmptyState, ErrorState, Skeleton, useToast } from '../../ui'
import { NoteEditor } from '../bilgi/NoteEditor'
import { ListSkeleton, Preview, RowButton, Title } from '../bilgi/rows'
import { useCreateProjectNote, useNote, useNotes } from '../bilgi/useKnowledge'

// Projeler > Notlar: projeye ait serbest notlar (metin + görsel). Bilgi'nin notlarıyla aynı tablo ve editör
// (`notes.project_id`); bu yüzden Bilgi aramasında da bulunurlar. Solda liste, sağda editör; seçili not URL'de.

export function ProjectNotes({ project, noteId }: { project: ProjectSummary; noteId?: string }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const now = useNow(60_000)
  const base = `/projeler/${project.id}/notlar`
  const list = useNotes({ projectId: project.id })
  const create = useCreateProjectNote()
  const notes = list.data ?? []

  // Not seçili değilse en son düzenlenen açılır.
  const first = notes[0]?.id
  useEffect(() => {
    if (!noteId && first) void navigate(`${base}/${first}`, { replace: true })
  }, [noteId, first, base, navigate])

  function createNote() {
    create.mutate(project.id, {
      onSuccess: (note) => void navigate(`${base}/${note.id}`),
      onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
    })
  }

  if (list.isSuccess && notes.length === 0) {
    return (
      <EmptyState
        className="h-60 max-w-[640px]"
        title="Bu projenin notu yok"
        message="Tasarım fikri, karar, ekran görüntüsü… Projeyle ilgili ne varsa buraya yaz; resim yapıştırabilirsin."
        action={{ label: 'Not', icon: Plus, onClick: createNote }}
      />
    )
  }

  return (
    <section aria-label="Proje notları" className="flex min-h-[560px] grow gap-6">
      <div className="flex w-[340px] shrink-0 flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="cx grow">Notlar · {notes.length}</span>
          <Button size="sm" icon={Plus} onClick={createNote} loading={create.isPending}>
            Not
          </Button>
        </div>
        {list.isPending ? (
          <ListSkeleton />
        ) : (
          <div className="flex flex-col gap-1">
            {notes.map((n) => (
              <RowButton
                key={n.id}
                selected={n.id === noteId}
                onClick={() => void navigate(`${base}/${n.id}`)}
              >
                <Title text={n.title} />
                {n.preview && <Preview text={n.preview} selected={n.id === noteId} />}
                <span className="text-[12px] font-semibold opacity-60">
                  {formatAgo(n.updatedAt, now)}
                </span>
              </RowButton>
            ))}
          </div>
        )}
      </div>
      <NotePane noteId={noteId} basePath={base} />
    </section>
  )
}

function NotePane({ noteId, basePath }: { noteId: string | undefined; basePath: string }) {
  const { data: note, isPending, isError, refetch } = useNote(noteId)
  if (!noteId) return <div className="min-w-0 grow" />
  if (isPending) return <Skeleton className="h-60 min-w-0 grow" lines={6} />
  if (isError)
    return (
      <div className="min-w-0 grow">
        <ErrorState
          className="max-w-[560px]"
          title="Not açılamadı"
          onRetry={() => void refetch()}
        />
      </div>
    )
  if (!note)
    return (
      <div className="min-w-0 grow">
        <EmptyState
          className="h-52 max-w-[560px]"
          title="Not bulunamadı"
          message="Bu not çöp kutusunda ya da silinmiş."
        />
      </div>
    )
  return (
    <div className="flex min-w-0 grow flex-col">
      <NoteEditor key={note.id} note={note} basePath={basePath} />
    </div>
  )
}
