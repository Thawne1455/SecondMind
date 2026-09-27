import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { IdeaStage, IdeaSummary } from '@shared/ipc'
import { formatAgo } from '../../lib/format'
import { useNow } from '../../lib/useNow'
import { Chip, cn, EmptyState } from '../../ui'
import { ideaStageLabel, isOpenStage, UNTITLED_IDEA } from './ideas'
import { ListSkeleton, Pill, Preview, RowButton, Title } from './rows'
import { useIdeas } from './useKnowledge'

// Karar bekleyen yeşil: Bugün'deki kuluçka karosuyla aynı soru. Kuluçka nötr, aktif Bilgi rengi.
const STAGE_PILL: Record<IdeaStage, string> = {
  due: 'bg-green text-fill-ink',
  incubating: 'bg-s3 text-ink',
  active: 'bg-teal text-fill-ink',
  project: 'bg-s3 text-ink2',
  archived: 'bg-s3 text-ink2',
}

type IdeaRowsProps = {
  selectedId: string | undefined
  onSelect: (id: string) => void
  onCreate: () => void
}

/** Fikirler görünümü: açık fikirler (karar bekleyen önce) ya da arşiv. */
export function IdeaRows({ selectedId, onSelect, onCreate }: IdeaRowsProps) {
  const { data, isPending } = useIdeas()
  const [archive, setArchive] = useState(false)
  const now = useNow(60_000)
  if (isPending) return <ListSkeleton />

  const all = data ?? []
  const open = all.filter((i) => isOpenStage(i.idea.stage))
  const closed = all.filter((i) => !isOpenStage(i.idea.stage))
  const shown = archive && closed.length ? closed : open

  if (!all.length) {
    return (
      <EmptyState
        className="h-60"
        title="Henüz fikir yok"
        message="Aklına geleni yaz; 14 gün kuluçkada beklesin, sonra hâlâ heyecanlandırıyor mu diye sor."
        action={{ label: 'Fikir', icon: Plus, onClick: onCreate }}
      />
    )
  }

  return (
    <>
      {closed.length > 0 && (
        <div className="flex gap-1.5 px-1 pb-1">
          <Chip selected={shown === open} onClick={() => setArchive(false)}>
            Açık · {open.length}
          </Chip>
          <Chip selected={shown === closed} onClick={() => setArchive(true)}>
            Arşiv · {closed.length}
          </Chip>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="m-0 px-4 py-3 font-semibold text-ink3">Açık fikir yok.</p>
      ) : (
        shown.map((idea) => (
          <IdeaRow
            key={idea.id}
            idea={idea}
            now={now}
            selected={idea.id === selectedId}
            onSelect={onSelect}
          />
        ))
      )}
    </>
  )
}

function IdeaRow({
  idea,
  now,
  selected,
  onSelect,
}: {
  idea: IdeaSummary
  now: number
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <RowButton selected={selected} onClick={() => onSelect(idea.id)}>
      <span className="flex">
        <Pill selected={selected} className={STAGE_PILL[idea.idea.stage]}>
          <span className="cx text-[11px]">{ideaStageLabel(idea.idea)}</span>
        </Pill>
      </span>
      <Title text={idea.title} fallback={UNTITLED_IDEA} />
      {idea.preview && <Preview text={idea.preview} selected={selected} />}
      <div className="flex items-center gap-1.5">
        {idea.tags.slice(0, 3).map((t) => (
          <Pill key={t} selected={selected}>
            {t}
          </Pill>
        ))}
        <span
          className={cn(
            'ml-auto text-[13px] font-semibold',
            selected ? 'text-fill-ink/70' : 'text-ink3',
          )}
        >
          {idea.pinned && 'Sabit · '}
          {formatAgo(idea.updatedAt, now)}
        </span>
      </div>
    </RowButton>
  )
}
