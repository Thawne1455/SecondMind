import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, ChevronDown, ChevronRight, Pencil, X } from 'lucide-react'
import type { GddComparison, ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, cn, IconButton, Input, Tile, useToast } from '../../ui'
import { useSetCountRule } from './useDocs'

// GDD ile gerçeklik (PROJELER.md > 4, 5d-2). Dokümanlar'da GDD sayfasının üstünde şerit; Kokpit'te sadece
// farklar. Eksik (klasör < GDD) mercan, fazla nötr, eşleşenler katlı. Bilinmeyen satır: öneri tek tıkla kabul,
// tek satırda düzeltme.

export const GDD_EMPTY =
  "GDD'de sayı içeren tablo bulunamadı. Ses listesi ya da içerik özeti tablosu ekle, SecondMind klasörle karşılaştırsın."

type Row = GddComparison['rows'][number]

export function GddStrip({ project, data }: { project: ProjectSummary; data: GddComparison }) {
  const [showEqual, setShowEqual] = useState(false)
  if (!data.rows.length)
    return <p className="m-0 rounded-tile bg-s2 px-5 py-4 text-[15px] text-ink2">{GDD_EMPTY}</p>
  const open = data.rows.filter((r) => r.state !== 'equal')
  const equal = data.rows.filter((r) => r.state === 'equal')
  const Chevron = showEqual ? ChevronDown : ChevronRight
  return (
    <section
      aria-label="GDD ile gerçeklik"
      className="flex max-w-[860px] flex-col gap-2 rounded-tile bg-s2 px-5 py-4"
    >
      <span className="cx">GDD ile gerçeklik</span>
      {!data.hasFolder && (
        <span className="text-[14px] text-ink3">
          Projeye klasör bağlı değil; sayılar karşılaştırılamaz.
        </span>
      )}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {open.map((r) => (
          <CompareLine key={r.label} project={project} row={r} data={data} />
        ))}
      </ul>
      {equal.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showEqual}
            onClick={() => setShowEqual(!showEqual)}
            className="flex cursor-pointer items-center gap-1.5 self-start rounded-full px-2 py-1 text-[13px] font-bold text-ink2 hover:bg-hover focus-visible:outline-3 focus-visible:outline-indigo"
          >
            <Chevron size={15} strokeWidth={1.75} aria-hidden />
            {equal.length} sayım eşleşiyor
          </button>
          {showEqual && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {equal.map((r) => (
                <CompareLine key={r.label} project={project} row={r} data={data} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function CompareLine({
  project,
  row: r,
  data,
}: {
  project: ProjectSummary
  row: Row
  data: GddComparison
}) {
  const setRule = useSetCountRule()
  const { toast } = useToast()
  const suggestion = data.suggestions.find((s) => s.label === r.label)
  const currentGlob = r.via?.kind === 'rule' ? r.via.glob : null
  const [editing, setEditing] = useState(false)
  const [glob, setGlob] = useState(currentGlob ?? suggestion?.glob ?? '')
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const save = (value: string | null) =>
    setRule.mutate(
      { projectId: project.id, label: r.label, glob: value },
      { onSuccess: () => setEditing(false), onError },
    )

  return (
    <li className="flex flex-col gap-1 rounded-[14px] bg-bg px-3.5 py-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'grow text-[15px] font-bold',
            r.state === 'missing' && 'text-t-coral',
            r.state === 'equal' && 'text-ink2',
          )}
        >
          {r.text}
        </span>
        {r.via && (
          <span
            className="truncate font-mono text-[12px] font-semibold text-ink3"
            title={viaText(r)}
          >
            {viaText(r)}
          </span>
        )}
        {data.hasFolder && !editing && (
          <IconButton
            label={currentGlob ? 'Kuralı düzelt' : 'Kural yaz'}
            icon={Pencil}
            className="size-8"
            onClick={() => {
              setGlob(currentGlob ?? suggestion?.glob ?? '')
              setEditing(true)
            }}
          />
        )}
      </div>
      {r.state === 'unknown' && suggestion && !editing && (
        <div className="flex items-center gap-2 text-[14px]">
          <span className="text-ink2">Öneri:</span>
          <span className="min-w-0 truncate font-mono text-[13px] font-semibold">
            {suggestion.glob}
          </span>
          <span className="shrink-0 text-ink3">· {suggestion.count} dosya</span>
          <span className="grow" />
          <Button
            size="sm"
            icon={Check}
            loading={setRule.isPending}
            onClick={() => save(suggestion.glob)}
          >
            Kabul
          </Button>
        </div>
      )}
      {editing && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={glob}
            placeholder="Assets/Data/Weapons/*.asset"
            aria-label={`${r.label} sayım kuralı`}
            onChange={(e) => setGlob(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && glob.trim()) save(glob)
              if (e.key === 'Escape') setEditing(false)
            }}
            className="h-[36px] grow font-mono text-[13px]"
          />
          <Button size="sm" disabled={!glob.trim()} onClick={() => save(glob)}>
            Kaydet
          </Button>
          {currentGlob && (
            <Button size="sm" variant="secondary" onClick={() => save(null)}>
              Kuralı sil
            </Button>
          )}
          <IconButton
            label="Vazgeç"
            icon={X}
            className="size-8"
            onClick={() => setEditing(false)}
          />
        </div>
      )}
    </li>
  )
}

function viaText(r: Row): string {
  if (!r.via) return ''
  if (r.via.kind === 'rule') return r.via.glob
  return { scenes: '.unity sahneleri', audio: 'ses dosyaları', scripts: '.cs dosyaları' }[
    r.via.builtin
  ]
}

/** Kokpit karosu: sadece farklar (eksik önce); fark yoksa çizilmez. */
export function GddTile({ project, data }: { project: ProjectSummary; data: GddComparison }) {
  const navigate = useNavigate()
  const diffs = data.rows.filter((r) => r.state === 'missing' || r.state === 'extra')
  return (
    <Tile
      variant="standard"
      className="grow"
      eyebrow="GDD ile gerçeklik"
      actions={[
        <Button
          key="open"
          size="sm"
          variant="secondary"
          className="[--btn-soft:var(--bg)]"
          onClick={() => void navigate(`/projeler/${project.id}/dokumanlar/${data.docId}`)}
        >
          GDD'yi aç
        </Button>,
      ]}
    >
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {diffs.slice(0, 5).map((r) => (
          <li
            key={r.label}
            className={cn(
              'rounded-[14px] bg-bg px-3.5 py-2 text-[15px] font-bold',
              r.state === 'missing' && 'text-t-coral',
            )}
          >
            {r.text}
          </li>
        ))}
      </ul>
      {diffs.length > 5 && (
        <span className="text-[13px] font-semibold text-ink3">+{diffs.length - 5} fark daha</span>
      )}
    </Tile>
  )
}
