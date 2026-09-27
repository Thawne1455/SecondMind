import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { TopBar } from '../../app/TopBar'
import { errorText } from '../../lib/errors'
import { EmptyState, ErrorState, Skeleton, useToast } from '../../ui'
import { CollectionsPane } from './CollectionsPane'
import { NoteEditor } from './NoteEditor'
import { NoteList } from './NoteList'
import { scopeFilter, type Scope } from './scope'
import { useCreateIdea, useCreateNote, useNote } from './useKnowledge'

/** Başka panelden (Bugün karoları) gelirken açılacak kapsam: `navigate(url, { state })`. */
export type BilgiLocationState = { scope?: Scope } | null

// Bilgi — "Şunu nereye yazmıştım?" Üç sütun: koleksiyonlar · notlar · editör. Seçili not URL'de.
export function BilgiPage() {
  const { noteId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [scope, setScope] = useState<Scope>(
    () => (location.state as BilgiLocationState)?.scope ?? { kind: 'all' },
  )
  const [tagId, setTagId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const createNoteMutation = useCreateNote()
  const createIdea = useCreateIdea()
  const { toast } = useToast()
  const ideas = scope.kind === 'ideas'

  const open = (id: string) => void navigate(`/bilgi/${id}`)

  // Fikirler etiket filtresini kullanmaz: Fikirler'e geçmek filtreyi bırakır,
  // Fikirler'deyken etikete basmak etiketin tüm not ve fikirlerini gösterir.
  function changeScope(next: Scope) {
    setScope(next)
    if (next.kind === 'ideas') setTagId(null)
  }
  function changeTag(next: string | null) {
    setTagId(next)
    if (next && ideas) setScope({ kind: 'all' })
  }

  function createNote() {
    const callbacks = {
      onSuccess: (note: { id: string }) => {
        setQuery('')
        open(note.id)
      },
      onError: (e: unknown) => toast({ message: errorText(e), domain: 'warning' }),
    }
    if (ideas) createIdea.mutate(undefined, callbacks)
    else createNoteMutation.mutate(scope.kind === 'collection' ? scope.id : null, callbacks)
  }

  return (
    <main className="flex h-full flex-col gap-[18px] px-8 pt-[22px] pb-6">
      <TopBar title="Bilgi" />
      <div className="flex min-h-0 grow gap-6">
        <CollectionsPane scope={scope} onScope={changeScope} tagId={tagId} onTag={changeTag} />
        <NoteList
          ideas={ideas}
          filter={scopeFilter(scope, tagId)}
          query={query}
          onQuery={setQuery}
          selectedId={noteId}
          onSelect={open}
          onCreate={createNote}
          creating={createNoteMutation.isPending || createIdea.isPending}
        />
        <NotePane noteId={noteId} onCreate={createNote} />
      </div>
    </main>
  )
}

function NotePane({ noteId, onCreate }: { noteId: string | undefined; onCreate: () => void }) {
  const { data: note, isPending, isError, refetch } = useNote(noteId)

  if (!noteId) {
    return (
      <div className="min-w-0 grow">
        <EmptyState
          className="h-52 max-w-[560px]"
          title="Bir not seç"
          message="Soldan bir not aç ya da yenisini yaz."
          action={{ label: 'Not', icon: Plus, onClick: onCreate }}
        />
      </div>
    )
  }
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
  if (!note) {
    return (
      <div className="min-w-0 grow">
        <EmptyState
          className="h-52 max-w-[560px]"
          title="Not bulunamadı"
          message="Bu not çöp kutusunda ya da silinmiş."
        />
      </div>
    )
  }
  return (
    <div className="flex min-w-0 grow flex-col">
      <NoteEditor key={note.id} note={note} />
    </div>
  )
}
