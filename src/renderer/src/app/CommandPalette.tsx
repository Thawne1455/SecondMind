import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { matchText, type Range } from '../lib/match'
import { cn } from '../ui'

export type PaletteGroup = 'Projeler' | 'Komutlar' | 'Görevler' | 'Notlar'
const GROUP_ORDER: PaletteGroup[] = ['Projeler', 'Komutlar', 'Görevler', 'Notlar']

export type PaletteItem = {
  id: string
  group: PaletteGroup
  label: string
  /** Proje rengi noktası. */
  dot?: string
  /** Sağda ikincil bilgi ("2 gün önce", "Ctrl N"). */
  meta?: string
  run: () => void
}

type Result = PaletteItem & { ranges: Range[] }

function Highlighted({ text, ranges }: { text: string; ranges: Range[] }) {
  const parts: ReactNode[] = []
  let at = 0
  ranges.forEach(([start, end]) => {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>)
    at = end
  })
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}

type CommandPaletteProps = { open: boolean; onClose: () => void; items: PaletteItem[] }

/** Ctrl K. Gruplar PROJELER, KOMUTLAR, NOTLAR; eşleşen metin amber, seçili satır ink + ENTER. */
export function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label="Komut paleti"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="mx-auto mt-[12vh] w-[640px] max-w-[calc(100vw-64px)] overflow-visible bg-transparent p-0 text-ink"
    >
      {/* Her açılışta sorgu ve seçim sıfırlansın diye içerik kapalıyken çizilmez. */}
      {open && <PaletteBody items={items} onClose={onClose} />}
    </dialog>
  )
}

function PaletteBody({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const matched: Result[] = []
    for (const item of items) {
      const ranges = matchText(item.label, query)
      if (ranges) matched.push({ ...item, ranges })
    }
    // Düz liste grup sırasıyla: klavye seçimi ekrandaki sırayı izler.
    return GROUP_ORDER.flatMap((g) => matched.filter((r) => r.group === g))
  }, [items, query])

  const active = Math.min(selected, Math.max(0, results.length - 1))

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function run(item: PaletteItem) {
    onClose()
    item.run()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!results.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setSelected((active + step + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = results[active]
      if (item) run(item)
    }
  }

  return (
    <div className="overflow-hidden rounded-modal bg-bg shadow-modal" onKeyDown={onKeyDown}>
      <label className="flex items-center gap-3 border-b-2 border-s2 px-6 py-[18px]">
        <Search size={20} strokeWidth={1.75} aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(0)
          }}
          placeholder="Ara veya komut yaz…"
          aria-label="Ara veya komut yaz"
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          className="x grow border-0 bg-transparent text-[22px] font-extrabold text-ink outline-none placeholder:font-semibold placeholder:text-ink3"
        />
      </label>

      <div
        ref={listRef}
        id="palette-results"
        role="listbox"
        aria-label="Sonuçlar"
        className="flex max-h-[420px] flex-col gap-0.5 overflow-y-auto p-2"
      >
        {results.length === 0 && (
          <span className="px-4 py-3 font-semibold text-ink3">Eşleşme yok.</span>
        )}
        {results.map((item, i) => (
          <PaletteRow
            key={item.id}
            item={item}
            index={i}
            selected={i === active}
            showGroup={i === 0 || results[i - 1]?.group !== item.group}
            onHover={() => setSelected(i)}
            onRun={() => run(item)}
          />
        ))}
      </div>
    </div>
  )
}

type PaletteRowProps = {
  item: Result
  index: number
  selected: boolean
  showGroup: boolean
  onHover: () => void
  onRun: () => void
}

function PaletteRow({ item, index, selected, showGroup, onHover, onRun }: PaletteRowProps) {
  return (
    <>
      {showGroup && (
        <span className="cx px-4 pt-2 pb-1 text-ink3" role="presentation">
          {item.group}
        </span>
      )}
      <div
        id={`palette-${item.id}`}
        role="option"
        aria-selected={selected}
        data-index={index}
        onMouseMove={onHover}
        onClick={onRun}
        className={cn(
          'flex cursor-pointer items-center gap-3 rounded-[18px] px-4 py-2.5',
          selected ? 'bg-ink text-on-ink' : 'text-ink',
        )}
      >
        {item.dot && <span className="size-3 shrink-0 rounded" style={{ background: item.dot }} />}
        <span className={cn('grow', selected || item.dot ? 'font-bold' : 'font-semibold')}>
          <Highlighted text={item.label} ranges={item.ranges} />
        </span>
        {selected ? (
          <span className="cx">Enter</span>
        ) : (
          item.meta && (
            <span className="text-[13px] leading-[1.35] font-semibold text-ink3">{item.meta}</span>
          )
        )}
      </div>
    </>
  )
}
