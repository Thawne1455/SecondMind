import type { ReactNode } from 'react'
import { Play } from 'lucide-react'
import type { Briefing, ProjectSummary } from '@shared/ipc'
import { formatAgo, formatMinutes } from '../../lib/format'
import { Button, cn } from '../../ui'

// Geri dönüş brifingi (PROJELER.md): projeye 3 günden uzun süre dokunulmadıysa Kokpit'in üstünde koyu bant.
// Her satır bir soru; verisi olmayan satır yok. Tamam ya da Başla kapatır, o açılışta bir daha çıkmaz.

type BriefingBandProps = {
  project: ProjectSummary
  briefing: Briefing
  now: number
  onDismiss: () => void
  onStart: () => void
}

export function BriefingBand({ project, briefing: b, now, onDismiss, onStart }: BriefingBandProps) {
  const rows: { label: string; node: ReactNode }[] = []

  if (b.lastSession) {
    const s = b.lastSession
    rows.push({
      label: 'Nerede kaldın',
      node: (
        <>
          <span className="text-white/60">
            {formatAgo(s.endedAt, now)}, {formatMinutes(s.minutes)}.{' '}
          </span>
          {s.leftOff ? (
            <span className="font-bold">{s.leftOff}</span>
          ) : (
            <span className="text-white/60">Not bırakmamışsın.</span>
          )}
        </>
      ),
    })
  }

  if (b.commitCount) {
    const areas = b.commitAreas
      .slice(0, 4)
      .map(([a, n]) => `${a} ${n}`)
      .join(' · ')
    rows.push({
      label: 'Arada gelenler',
      node: (
        <div className="flex flex-col gap-1">
          <span>
            <span className="font-bold">{b.commitCount} commit</span>
            {areas && <span className="text-white/60"> · {areas} dosya</span>}
          </span>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[14px] text-white/75">
            {b.commits.map((c) => (
              <li key={`${c.committedAt}-${c.message}`} className="truncate">
                <span className="text-white/45 tabular-nums">{formatAgo(c.committedAt, now)}</span>{' '}
                {c.message}
              </li>
            ))}
          </ul>
        </div>
      ),
    })
  }

  if (b.files.length)
    rows.push({
      label: 'Üzerinde çalıştıkların',
      node: (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {b.files.map((f) => (
            <li
              key={f}
              title={f}
              className="rounded-full bg-white/10 px-2.5 py-0.5 text-[13px] font-bold"
            >
              {f.split('/').pop()}
            </li>
          ))}
        </ul>
      ),
    })

  if (b.uncommitted)
    rows.push({
      label: "Commit'lenmemiş",
      node: (
        <span className={cn(b.uncommitted.stale && 'font-bold text-coral')}>
          {b.uncommitted.count} dosya
          {b.uncommitted.oldestAt !== null &&
            `, en eskisi ${formatAgo(b.uncommitted.oldestAt, now)}`}
          {b.uncommitted.stale && ' — kaybolmadan commit'}
        </span>
      ),
    })

  if (b.parkedSince)
    rows.push({
      label: 'Park ettiklerin',
      node: <span>{b.parkedSince} yeni öğe Sonra karosunda bekliyor.</span>,
    })

  if (b.nextStep)
    rows.push({
      label: 'Sıradaki adım',
      node: <span className="text-[18px] font-extrabold">{b.nextStep}</span>,
    })

  return (
    <section
      aria-label="Geri dönüş brifingi"
      className="flex gap-8 rounded-tile bg-band px-7 py-6 text-white"
    >
      <div className="flex w-[180px] shrink-0 flex-col gap-1">
        <span className="cx" style={{ color: project.color }}>
          Tekrar hoş geldin
        </span>
        <span className="x text-[56px] leading-[.9] font-black">{b.daysAway}</span>
        <span className="cx text-white/60">gün sonra döndün</span>
      </div>
      <dl className="m-0 grid min-w-0 grow grid-cols-[170px_1fr] content-start gap-x-6 gap-y-3">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="cx pt-[3px] text-white/50">{r.label}</dt>
            <dd className="m-0 min-w-0 text-[15px] leading-[1.4]">{r.node}</dd>
          </div>
        ))}
      </dl>
      <div className="flex shrink-0 flex-col items-end justify-between gap-3">
        <Button size="sm" variant="onTileGhost" className="text-white" onClick={onDismiss}>
          Tamam
        </Button>
        {!project.activeSession && (
          <Button variant="action" icon={Play} onClick={onStart}>
            Başla
          </Button>
        )}
      </div>
    </section>
  )
}
