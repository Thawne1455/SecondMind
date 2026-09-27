import { useDeferredValue, type ReactNode } from 'react'
import { Plus, Search, X } from 'lucide-react'
import type { NoteListInput, NoteSearchResult, NoteSummary } from '@shared/ipc'
import { formatAgo } from '../../lib/format'
import { useNow } from '../../lib/useNow'
import { Button, cn, EmptyState, Skeleton } from '../../ui'
import { useNotes, useNoteSearch } from './useKnowledge'

export const UNTITLED = 'Adsız not'

type NoteListProps = {
  filter: NoteListInput
  query: string
  onQuery: (query: string) => void
  selectedId: string | undefined
  onSelect: (id: string) => void
  onCreate: () => void
  creating: boolean
}

/** Orta sütun: arama + not listesi. Arama doluyken FTS sonuçları listenin yerine geçer. */
export function NoteList({
  filter,
  query,
  onQuery,
  selectedId,
  onSelect,
  onCreate,
  creating,
}: NoteListProps) {
  const searching = query.trim().length > 0
  return (
    <section aria-label="Notlar" className="flex w-[380px] shrink-0 flex-col gap-3">
      <div className="flex gap-2">
        <label className="flex h-[42px] min-w-0 grow items-center gap-2 rounded-full bg-s2 pr-2 pl-4 focus-within:outline-3 focus-within:outline-indigo">
          <Search size={18} strokeWidth={1.75} className="shrink-0 text-ink2" aria-hidden />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault()
                onQuery('')
              }
            }}
            placeholder="Notlarda ara…"
            aria-label="Notlarda ara"
            className="min-w-0 grow border-0 bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink3"
          />
          {searching && (
            <button
              type="button"
              aria-label="Aramayı temizle"
              onClick={() => onQuery('')}
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-s3"
            >
              <X size={16} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </label>
        <Button icon={Plus} onClick={onCreate} loading={creating}>
          Not
        </Button>
      </div>

      <div className="flex min-h-0 grow flex-col gap-1 overflow-y-auto pb-2">
        {searching ? (
          <SearchResults query={query} selectedId={selectedId} onSelect={onSelect} />
        ) : (
          <Notes filter={filter} selectedId={selectedId} onSelect={onSelect} onCreate={onCreate} />
        )}
      </div>
    </section>
  )
}

type RowsProps = { selectedId: string | undefined; onSelect: (id: string) => void }

function Notes({
  filter,
  selectedId,
  onSelect,
  onCreate,
}: RowsProps & { filter: NoteListInput; onCreate: () => void }) {
  const { data, isPending } = useNotes(filter)
  const now = useNow(60_000)
  if (isPending) return <ListSkeleton />
  if (!data?.length) {
    const empty = Object.keys(filter).length === 0
    return (
      <EmptyState
        className="h-52"
        title={empty ? 'Henüz not yok' : 'Burada not yok'}
        message={
          empty ? 'İlk notunu yaz; aradığında burada bulursun.' : 'Bu filtreye uyan not yok.'
        }
        action={empty ? { label: 'Not', icon: Plus, onClick: onCreate } : undefined}
      />
    )
  }
  return data.map((note) => (
    <NoteRow
      key={note.id}
      note={note}
      now={now}
      selected={note.id === selectedId}
      onSelect={onSelect}
    />
  ))
}

function NoteRow({
  note,
  now,
  selected,
  onSelect,
}: {
  note: NoteSummary
  now: number
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <RowButton selected={selected} onClick={() => onSelect(note.id)}>
      <div className="flex gap-3">
        <div className="flex min-w-0 grow flex-col gap-1">
          <Title text={note.title} />
          {note.preview && (
            <p
              className={cn(
                'm-0 line-clamp-2 text-[14px] leading-[1.4]',
                selected ? 'text-fill-ink/75' : 'text-ink2',
              )}
            >
              {note.preview}
            </p>
          )}
        </div>
        {note.coverUrl && (
          <img
            src={note.coverUrl}
            alt=""
            className="size-12 shrink-0 rounded-[10px] object-cover"
          />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {note.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className={cn(
              'inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-bold',
              selected ? 'bg-fill-ink/10' : 'bg-teal text-fill-ink',
            )}
          >
            {t}
          </span>
        ))}
        {note.tags.length > 3 && (
          <span className="text-[12px] font-bold opacity-60">+{note.tags.length - 3}</span>
        )}
        <span
          className={cn(
            'ml-auto text-[13px] font-semibold',
            selected ? 'text-fill-ink/70' : 'text-ink3',
          )}
        >
          {note.pinned && 'Sabit · '}
          {formatAgo(note.updatedAt, now)}
        </span>
      </div>
    </RowButton>
  )
}

function SearchResults({ query, selectedId, onSelect }: RowsProps & { query: string }) {
  // Yazarken her tuşta IPC değil: React boştayken sorgular.
  const deferred = useDeferredValue(query)
  const { data, isPending } = useNoteSearch(deferred)
  if (isPending) return <ListSkeleton />
  if (!data?.length) {
    return <p className="m-0 px-4 py-3 font-semibold text-ink3">“{query.trim()}” için sonuç yok.</p>
  }
  return data.map((r) => (
    <RowButton key={r.id} selected={r.id === selectedId} onClick={() => onSelect(r.id)}>
      <Title text={r.title} />
      {r.snippet && (
        <p
          className={cn(
            'm-0 line-clamp-2 text-[14px] leading-[1.4]',
            r.id === selectedId ? 'text-fill-ink/75' : 'text-ink2',
          )}
        >
          <Highlighted result={r} />
        </p>
      )}
    </RowButton>
  ))
}

function Highlighted({ result }: { result: NoteSearchResult }) {
  const parts: ReactNode[] = []
  let at = 0
  for (const [start, end] of result.ranges) {
    if (start > at) parts.push(result.snippet.slice(at, start))
    parts.push(<mark key={start}>{result.snippet.slice(start, end)}</mark>)
    at = end
  }
  if (at < result.snippet.length) parts.push(result.snippet.slice(at))
  return <>{parts}</>
}

function Title({ text }: { text: string }) {
  return (
    <span
      className={cn('truncate text-[16px] leading-[1.3] font-extrabold', !text && 'opacity-50')}
    >
      {text || UNTITLED}
    </span>
  )
}

function RowButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-current={selected || undefined}
      onClick={onClick}
      className={cn(
        'flex w-full shrink-0 cursor-pointer flex-col gap-2 rounded-[22px] px-4 py-3.5 text-left transition-colors duration-150',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
        selected ? 'bg-teal text-fill-ink' : 'text-ink hover:bg-s2',
      )}
    >
      {children}
    </button>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} lines={3} />
      ))}
    </div>
  )
}
