import { useState } from 'react'
import { Check } from 'lucide-react'
import type { ProposalContexts, ProposalView, SchedulePreview } from '@shared/ipc'
import { cn } from '../../ui'
import { clock, WEEKDAY_SHORT } from '../okul/schoolText'
import { Actions, ProposalEditor } from './ProposalCard'
import { importSlotToSlot, termRangeText } from './proposalText'

// Ders programı önerisinin üst kısmı (4e-2, Taha'nın onayladığı düzen): dönem şeridi (gök mavisi) ve haftalık önizleme.
// Önizleme Okul'daki "Haftalık program"ın dilinde: Pzt–Cum kolonları (hafta sonu doluysa o da), saat satırları, her ders
// kendi gök tonunda blok. Saati değişen mevcut dersin eski yeri kesikli çerçeve. Reddedilen ders ızgaradan düşer.

type TermStripProps = {
  term: SchedulePreview['term']
  proposal: ProposalView | undefined
  contexts: ProposalContexts
}

/** Dönem şeridi: yeni dönemse Reddet · Düzenle · Onayla; var olan döneme ekleniyorsa bilgi. */
export function TermStrip({ term, proposal, contexts }: TermStripProps) {
  const [editing, setEditing] = useState(false)
  const pending = proposal?.status === 'pending'

  if (term.mode === 'none')
    return (
      <div className="flex min-h-12 items-center gap-3 rounded-tile bg-coral px-5 py-3 text-white">
        <span className="cx">Dönem yok</span>
        <span className="text-[15px] font-semibold">
          Dersler eklenemez: Okul'da dönem oluştur ya da dönem önerisini reddetme.
        </span>
      </div>
    )

  const range = termRangeText(term.startDate, term.endDate)
  const label =
    term.mode === 'new'
      ? 'Yeni dönem'
      : term.active
        ? 'Aktif döneme eklenecek'
        : 'Arşivdeki döneme eklenecek'
  const done = term.mode === 'new' && proposal && !pending

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 rounded-tile bg-sky px-5 py-3 text-fill-ink">
        <span className="cx">{label}</span>
        <span className="text-[17px] font-extrabold">{term.name}</span>
        {range ? (
          <span className="x text-[14px] font-bold">{range}</span>
        ) : (
          term.mode === 'new' && (
            <span className="rounded-full bg-coral px-2.5 text-[13px] leading-6 font-bold text-white">
              Başlangıç tarihi yok · Düzenle'den ekle
            </span>
          )
        )}
        {term.weekCount !== null && (
          <span className="x text-[14px] font-bold">{term.weekCount} hafta</span>
        )}
        <span className="grow" />
        {done && (
          <span className="cx inline-flex items-center gap-1.5">
            <Check size={14} strokeWidth={2.5} aria-hidden />
            {proposal.undone ? 'Geri alındı' : 'Oluşturuldu'}
          </span>
        )}
        {term.mode === 'new' && pending && !editing && (
          <Actions proposal={proposal} onEdit={() => setEditing(true)} />
        )}
      </div>
      {editing && proposal && pending && (
        <div className="rounded-tile bg-s2 px-6 py-5">
          <ProposalEditor
            proposal={proposal}
            contexts={contexts}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  )
}

const HOUR_PX = 40
const HEAD_PX = 28

type Block = {
  key: string
  proposalId: string
  name: string
  tone: string
  weekday: number
  startMin: number
  endMin: number
  room: string
  old: boolean
  applied: boolean
}

/** Gün içinde çakışan bloklar yan yana şeritlere bölünür. */
function lanes(blocks: Block[]): Map<string, { lane: number; of: number }> {
  const out = new Map<string, { lane: number; of: number }>()
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  let cluster: Block[] = []
  let clusterEnd = -1
  const flush = () => {
    const ends: number[] = []
    const lane = new Map<string, number>()
    for (const b of cluster) {
      let i = ends.findIndex((e) => e <= b.startMin)
      if (i < 0) i = ends.push(0) - 1
      ends[i] = b.endMin
      lane.set(b.key, i)
    }
    for (const b of cluster) out.set(b.key, { lane: lane.get(b.key)!, of: ends.length })
    cluster = []
  }
  for (const b of sorted) {
    if (cluster.length && b.startMin >= clusterEnd) flush()
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.endMin)
    if (cluster.length === 1) clusterEnd = b.endMin
  }
  if (cluster.length) flush()
  return out
}

type GridProps = {
  schedule: SchedulePreview
  proposals: ProposalView[]
  onSelect: (proposalId: string) => void
}

export function ScheduleGrid({ schedule, proposals, onSelect }: GridProps) {
  const byId = new Map(proposals.map((p) => [p.id, p]))
  const blocks: Block[] = []
  for (const c of schedule.courses) {
    const p = byId.get(c.proposalId)
    if (!p || p.payload.op !== 'import_course' || p.status === 'rejected' || p.undone) continue
    const applied = p.status !== 'pending'
    p.payload.slots.forEach((s, i) => {
      blocks.push({
        key: `${p.id}:${i}`,
        proposalId: p.id,
        name: p.payload.op === 'import_course' ? p.payload.name : '',
        tone: c.tone,
        ...importSlotToSlot(s),
        old: false,
        applied,
      })
    })
    if (!applied)
      c.oldSlots.forEach((s, i) =>
        blocks.push({
          key: `${p.id}:old${i}`,
          proposalId: p.id,
          name: '',
          tone: c.tone,
          ...s,
          old: true,
          applied,
        }),
      )
  }
  if (!blocks.length) return null
  // Eski saat çerçeveleri önce çizilir: yeni blokların altında kalsın.
  blocks.sort((a, b) => Number(b.old) - Number(a.old))

  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 5 || blocks.some((b) => b.weekday === d))
  const from = Math.floor(Math.min(8 * 60, ...blocks.map((b) => b.startMin)) / 60)
  const to = Math.ceil(Math.max(18 * 60, ...blocks.map((b) => b.endMin)) / 60)
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const top = (min: number) => ((min - from * 60) / 60) * HOUR_PX
  const unplaced = schedule.courses.filter((c) => {
    const p = byId.get(c.proposalId)
    return p?.payload.op === 'import_course' && p.status === 'pending' && !p.payload.slots.length
  }).length

  return (
    <section
      aria-label="Haftalık önizleme"
      className="flex flex-col gap-3 rounded-tile bg-s2 px-5 py-[18px]"
    >
      <div className="flex items-center gap-3">
        <span className="cx">Haftalık önizleme</span>
        <span className="text-[13px] font-semibold text-ink3">
          Bloğa tıkla, aşağıda o dersi göster.
          {unplaced > 0 && ` ${unplaced} dersin saati okunamadı.`}
        </span>
      </div>
      <div className="flex">
        <div className="relative w-10 shrink-0" style={{ height: (to - from) * HOUR_PX + HEAD_PX }}>
          {hours.map((h) => (
            <span
              key={h}
              className="x absolute right-2 text-[13px] font-bold text-ink3"
              style={{ top: HEAD_PX + top(h * 60) - 9 }}
            >
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const dayBlocks = blocks.filter((b) => b.weekday === d)
          // Eski saat çerçevesi şerit almaz: yeni blokların arkasında tam genişlikte durur.
          const lane = lanes(dayBlocks.filter((b) => !b.old))
          return (
            <div key={d} className="relative min-w-0 flex-1 border-l border-line">
              <div className="cx flex items-center justify-center" style={{ height: HEAD_PX }}>
                {WEEKDAY_SHORT[d - 1]}
              </div>
              <div className="relative" style={{ height: (to - from) * HOUR_PX }}>
                {hours.slice(1).map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 h-px bg-line"
                    style={{ top: top(h * 60) }}
                  />
                ))}
                {dayBlocks.map((b) => {
                  const { lane: i, of } = lane.get(b.key) ?? { lane: 0, of: 1 }
                  const style = {
                    top: top(b.startMin),
                    height: Math.max(18, top(b.endMin) - top(b.startMin) - 3),
                    left: `calc(${(i / of) * 100}% + 4px)`,
                    width: `calc(${100 / of}% - 8px)`,
                  }
                  if (b.old)
                    return (
                      <div
                        key={b.key}
                        title={`Eski saat · ${clock(b.startMin)}–${clock(b.endMin)}`}
                        className="absolute rounded-block border-2 border-dashed border-ink3"
                        style={style}
                      />
                    )
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => onSelect(b.proposalId)}
                      title={`${b.name} · ${clock(b.startMin)}–${clock(b.endMin)}${b.room ? ` · ${b.room}` : ''}`}
                      className={cn(
                        'absolute flex cursor-pointer flex-col overflow-hidden rounded-block px-2 py-1 text-left text-fill-ink',
                        'focus-visible:outline-3 focus-visible:outline-indigo',
                        b.applied && 'opacity-60',
                      )}
                      style={{ ...style, background: b.tone }}
                    >
                      <span className="flex items-center gap-1 text-[13px] leading-[1.2] font-extrabold">
                        {b.applied && (
                          <Check size={12} strokeWidth={3} aria-hidden className="shrink-0" />
                        )}
                        <span className="truncate">{b.name}</span>
                      </span>
                      <span className="x truncate text-[12px] font-semibold">
                        {clock(b.startMin)}
                        {b.room && ` · ${b.room}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
