import type { KeyboardEvent, Ref } from 'react'
import { useNavigate } from 'react-router'
import { Play, Square } from 'lucide-react'
import type { ProjectSummary } from '@shared/ipc'
import { useShell } from '../../app/shell-context'
import { formatAgo, formatMinutes } from '../../lib/format'
import { Button, cn, Kbd } from '../../ui'
import { formatTimer, KIND_LABEL, SILENT_AFTER_DAYS, STATUS_LABEL } from './labels'
import { Rhythm } from './Rhythm'

// Proje şeridi (PROJELER.md "Liste ekranı"): tam genişlikte yatay şerit, kart ızgarası değil.
// Soldan sağa: proje renginde ad bloğu · sıradaki adım + Başla · ritim, son oturum, sessizlik, Sonra.
// Klavye: Enter açar, B başlatır / kapatır, P park eder (liste ↑ ↓ ile gezer).

type Props = {
  project: ProjectSummary
  now: number
  ref?: Ref<HTMLElement>
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void
}

export function ProjectStrip({ project: p, now, ref, onKeyDown }: Props) {
  const navigate = useNavigate()
  const { startSession, closeSession, openPark } = useShell()
  const open = () => void navigate(`/projeler/${p.id}`)
  const session = p.activeSession
  const silent = !session && p.status === 'active' && p.silentDays >= SILENT_AFTER_DAYS
  const dim = p.status !== 'active'
  const last = p.lastSession

  function keys(e: KeyboardEvent<HTMLElement>) {
    if (e.target !== e.currentTarget) return
    const k = e.key.toLocaleLowerCase('tr-TR')
    if (e.key === 'Enter') open()
    else if (k === 'b' && !e.ctrlKey) {
      if (session) closeSession()
      else startSession(p.id)
    } else if (k === 'p' && !e.ctrlKey) openPark(p.id)
    else {
      onKeyDown?.(e)
      return
    }
    e.preventDefault()
  }

  return (
    <article
      ref={ref}
      tabIndex={0}
      aria-label={`${p.name}${session ? ', oturum sürüyor' : ''}`}
      onKeyDown={keys}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) open()
      }}
      className={cn(
        'group flex min-h-[148px] cursor-pointer overflow-hidden rounded-tile bg-s2',
        'transition-transform duration-[180ms] ease-out hover:-translate-y-0.5',
        'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-indigo',
      )}
    >
      {/* Ad bloğu */}
      <div
        className={cn(
          'flex w-[300px] shrink-0 flex-col justify-between gap-3 px-6 py-5 text-fill-ink',
          dim && 'opacity-60 saturate-50',
        )}
        style={{ backgroundColor: p.color }}
      >
        <span className="cx flex items-center gap-2">
          {KIND_LABEL[p.kind]}
          {p.status !== 'active' && <span>· {STATUS_LABEL[p.status]}</span>}
        </span>
        <h2
          className="x m-0 line-clamp-2 leading-[.95] font-black uppercase"
          style={{ fontSize: p.name.length <= 8 ? 34 : p.name.length <= 11 ? 27 : 22 }}
        >
          {p.name}
        </h2>
        {session ? (
          <span className="cx flex w-fit items-center gap-2 rounded-full bg-fill-ink px-3 py-1 text-white">
            <span
              className="size-2 animate-pulse rounded-full"
              style={{ backgroundColor: p.color }}
            />
            Oturumda · {formatTimer(now - session.startedAt)}
          </span>
        ) : (
          <span className="h-[26px]" />
        )}
      </div>

      {/* Sıradaki adım */}
      <div className="flex min-w-0 grow flex-col justify-center gap-2 px-7 py-5">
        <span className="cx text-ink3">Sıradaki adım</span>
        {p.nextStep ? (
          <p className="m-0 line-clamp-2 text-[22px] leading-[1.2] font-extrabold">{p.nextStep}</p>
        ) : (
          <p className="m-0 text-[18px] font-bold text-ink3">
            Yazılmadı. Oturumu kapatırken sıradaki adımı yaz.
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          {session ? (
            <Button size="sm" icon={Square} onClick={closeSession}>
              Oturumu kapat
            </Button>
          ) : (
            <Button size="sm" variant="action" icon={Play} onClick={() => startSession(p.id)}>
              Başla
            </Button>
          )}
          <span className="flex items-center gap-1 text-[13px] font-semibold text-ink3 opacity-0 transition-opacity group-focus-visible:opacity-100">
            <Kbd>B</Kbd> {session ? 'kapat' : 'başla'} · <Kbd>P</Kbd> park · <Kbd>Enter</Kbd> aç
          </span>
        </div>
      </div>

      {/* Ritim ve hafıza */}
      <div className="flex w-[330px] shrink-0 flex-col justify-between gap-3 px-6 py-5">
        <div className="flex items-end justify-between gap-3">
          <Rhythm days={p.rhythm} color={p.color} />
          <span className="flex flex-col items-end leading-tight">
            <span className="x text-[22px] font-black whitespace-nowrap">
              {formatTimer(p.weekMinutes * 60_000)}
            </span>
            <span className="cx text-ink3">Bu hafta</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {silent ? (
            <span className="cx rounded-full bg-coral px-3 py-1 text-white">
              {p.silentDays} gün sessiz
            </span>
          ) : (
            <span className="text-[13px] font-semibold text-ink3">
              {session
                ? `Başladı ${formatAgo(session.startedAt, now)}`
                : last
                  ? `Son oturum ${formatAgo(last.endedAt!, now)} · ${formatMinutes(Math.round((last.endedAt! - last.startedAt) / 60_000))}`
                  : 'Henüz oturum yok'}
            </span>
          )}
          {p.parkingWaiting > 0 && (
            <span className="cx rounded-full bg-bg px-3 py-1 text-ink">
              Sonra · {p.parkingWaiting}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
