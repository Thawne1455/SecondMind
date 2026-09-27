import { useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import type { CollectionSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { cn, Menu, useToast } from '../../ui'
import { DeleteCollectionModal } from './DeleteCollectionModal'
import type { Scope } from './scope'
import {
  useCollections,
  useCreateCollection,
  useNotes,
  useRenameCollection,
  useTags,
} from './useKnowledge'

const LABEL = 'cx px-4 text-ink3'
const ROW =
  'group flex h-10 w-full cursor-pointer items-center gap-2 rounded-full px-4 text-left text-[15px] font-bold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo'

type CollectionsPaneProps = {
  scope: Scope
  onScope: (scope: Scope) => void
  tagId: string | null
  onTag: (tagId: string | null) => void
}

/** Sol sütun: koleksiyonlar (Tümü, Sabitlenenler, her koleksiyon, Koleksiyonsuz) ve etiketler. */
export function CollectionsPane({ scope, onScope, tagId, onTag }: CollectionsPaneProps) {
  const collections = useCollections().data ?? []
  const tags = useTags().data ?? []
  // Sayılar: Tümü / Sabitlenenler / Koleksiyonsuz ayrı sorgu istemez, tüm liste yeter.
  const all = useNotes({}).data ?? []
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<CollectionSummary | null>(null)
  const create = useCreateCollection()
  const { toast } = useToast()

  const is = (s: Scope) =>
    s.kind === 'collection'
      ? scope.kind === 'collection' && scope.id === s.id
      : scope.kind === s.kind

  return (
    <nav
      aria-label="Koleksiyonlar"
      className="flex w-[240px] shrink-0 flex-col gap-6 overflow-y-auto pb-2"
    >
      <section className="flex flex-col gap-0.5">
        <span className={cn(LABEL, 'pb-1.5')}>Koleksiyonlar</span>
        <ScopeRow
          label="Tümü"
          count={all.length}
          selected={is({ kind: 'all' })}
          onClick={() => onScope({ kind: 'all' })}
        />
        <ScopeRow
          label="Sabitlenenler"
          count={all.filter((n) => n.pinned).length}
          selected={is({ kind: 'pinned' })}
          onClick={() => onScope({ kind: 'pinned' })}
        />
        {collections.map((c) => (
          <CollectionRow
            key={c.id}
            collection={c}
            selected={is({ kind: 'collection', id: c.id })}
            onSelect={() => onScope({ kind: 'collection', id: c.id })}
            onDelete={() => setDeleting(c)}
          />
        ))}
        <ScopeRow
          label="Koleksiyonsuz"
          count={all.length - collections.reduce((sum, c) => sum + c.noteCount, 0)}
          selected={is({ kind: 'none' })}
          onClick={() => onScope({ kind: 'none' })}
          muted
        />
        {adding ? (
          <NameInput
            placeholder="Koleksiyon adı"
            onCancel={() => setAdding(false)}
            onSubmit={(name) =>
              create.mutate(name, {
                onSuccess: (c) => onScope({ kind: 'collection', id: c.id }),
                onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
                onSettled: () => setAdding(false),
              })
            }
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(ROW, 'font-semibold text-ink2 hover:bg-s2')}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            Koleksiyon
          </button>
        )}
      </section>

      {tags.length > 0 && (
        <section className="flex flex-col gap-2">
          <span className={LABEL}>Etiketler</span>
          <div className="flex flex-wrap gap-1.5 px-2">
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tagId === t.id}
                onClick={() => onTag(tagId === t.id ? null : t.id)}
                className={cn(
                  'inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full px-3 text-[14px] font-bold',
                  'transition-transform duration-150 active:scale-[.96] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
                  tagId === t.id ? 'bg-ink text-on-ink' : 'bg-teal text-fill-ink',
                )}
              >
                {t.name}
                <span className="text-[12px] opacity-60">{t.noteCount}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <DeleteCollectionModal
        collection={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(c) => {
          if (is({ kind: 'collection', id: c.id })) onScope({ kind: 'all' })
        }}
      />
    </nav>
  )
}

type ScopeRowProps = {
  label: ReactNode
  count: number
  selected: boolean
  onClick: () => void
  muted?: boolean
}

function ScopeRow({ label, count, selected, onClick, muted }: ScopeRowProps) {
  return (
    <button
      type="button"
      aria-current={selected || undefined}
      onClick={onClick}
      className={cn(
        ROW,
        selected ? 'bg-ink text-on-ink' : 'hover:bg-s2',
        muted && !selected && 'text-ink2',
      )}
    >
      <span className="grow truncate">{label}</span>
      <Count value={count} selected={selected} />
    </button>
  )
}

function Count({ value, selected }: { value: number; selected: boolean }) {
  return (
    <span className={cn('x text-[13px] font-bold', selected ? 'text-on-ink/70' : 'text-ink3')}>
      {value}
    </span>
  )
}

const MENU = [
  { id: 'rename', label: 'Yeniden adlandır' },
  { id: 'delete', label: 'Sil…' },
] as const

type CollectionRowProps = {
  collection: CollectionSummary
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}

function CollectionRow({ collection, selected, onSelect, onDelete }: CollectionRowProps) {
  const [renaming, setRenaming] = useState(false)
  const rename = useRenameCollection()
  const { toast } = useToast()

  if (renaming) {
    return (
      <NameInput
        initial={collection.name}
        placeholder="Koleksiyon adı"
        onCancel={() => setRenaming(false)}
        onSubmit={(name) =>
          rename.mutate(
            { id: collection.id, name },
            {
              onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
              onSettled: () => setRenaming(false),
            },
          )
        }
      />
    )
  }

  return (
    <div
      className={cn(
        'group relative flex items-center rounded-full',
        selected ? 'bg-ink text-on-ink' : 'hover:bg-s2',
      )}
      // Sağ tık menüyü açar: tetikleyiciye tıklatmak Menu'nun odak ve kapanma davranışını korur.
      onContextMenu={(e) => {
        e.preventDefault()
        e.currentTarget.querySelector<HTMLButtonElement>('[aria-haspopup=menu]')?.click()
      }}
    >
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={onSelect}
        className={cn(ROW, 'grow pr-1')}
      >
        <span className="grow truncate">{collection.name}</span>
        <Count value={collection.noteCount} selected={selected} />
      </button>
      <Menu
        align="end"
        label={`${collection.name} menüsü`}
        items={MENU}
        onSelect={(id) => (id === 'rename' ? setRenaming(true) : onDelete())}
        className="w-[200px]"
        trigger={(props) => (
          <button
            type="button"
            aria-label={`${collection.name} menüsü`}
            {...props}
            className={cn(
              'mr-1.5 grid size-7 cursor-pointer place-items-center rounded-full opacity-0 transition-opacity',
              'group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100',
              selected ? 'hover:bg-white/15' : 'hover:bg-s3',
            )}
          >
            <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      />
    </div>
  )
}

type NameInputProps = {
  initial?: string
  placeholder: string
  onSubmit: (name: string) => void
  onCancel: () => void
}

/** Satır içi ad girişi: Enter kaydeder, Esc ya da boş bırakıp çıkmak vazgeçer. */
function NameInput({ initial = '', placeholder, onSubmit, onCancel }: NameInputProps) {
  const [value, setValue] = useState(initial)
  // Enter'dan sonra gelen blur ikinci kez göndermesin.
  const done = useRef(false)
  const finish = (submit: boolean) => {
    if (done.current) return
    done.current = true
    const name = value.trim()
    if (submit && name && name !== initial) onSubmit(name)
    else onCancel()
  }
  return (
    <input
      autoFocus
      value={value}
      maxLength={60}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          finish(e.key === 'Enter')
        }
      }}
      className="h-10 w-full rounded-full bg-s2 px-4 text-[15px] font-bold text-ink outline-3 outline-indigo placeholder:font-semibold placeholder:text-ink3"
    />
  )
}
