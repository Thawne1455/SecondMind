import { NavLink } from 'react-router'
import { Moon, Settings, Sun } from 'lucide-react'
import { usePendingDumpCount } from '../features/dokum/useDumps'
import { SILENT_AFTER_DAYS } from '../features/projeler/labels'
import { useProjects } from '../features/projeler/useProjects'
import { useSetSetting, useSetting } from '../lib/settings'
import { Badge, cn } from '../ui'
import { PANELS, type PanelId } from './panels'

const LINK =
  'relative flex w-12 items-center justify-center rounded-2xl text-ink2 transition-colors duration-150 ' +
  'hover:bg-s3 hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo'
const LINK_ACTIVE = 'bg-ink text-on-ink hover:bg-ink hover:text-on-ink'

// Sayı rozetleri: Döküm'de işlenmemiş öğe, Onay Kutusu'nda bekleyen öneri.
// Sayı 0 ise rozet gösterilmez.
const BADGES: Partial<Record<PanelId, { tone: 'dump' | 'today'; noun: string }>> = {
  dokum: { tone: 'dump', noun: 'işlenmemiş' },
  onay: { tone: 'today', noun: 'öneri' },
}

export function Sidebar() {
  const theme = useSetting('theme')
  const setTheme = useSetSetting('theme')
  const dark = theme.data === 'dark'
  const projects = (useProjects().data ?? []).filter((p) => p.status === 'active').slice(0, 5)
  const counts: Partial<Record<PanelId, number>> = {
    dokum: usePendingDumpCount(),
    // onay: bekleyen öneri sayısı Aşama 4'te (proposals).
  }

  return (
    <nav
      aria-label="Ana menü"
      className="flex w-20 shrink-0 flex-col items-center gap-1.5 bg-s2 px-4 py-5"
    >
      <span className="x mb-3.5 flex size-12 items-center justify-center rounded-2xl bg-indigo text-[20px] font-black text-white">
        S
      </span>

      {PANELS.map(({ id, path, label, icon: Icon }) => {
        const count = counts[id] ?? 0
        const badge = count > 0 ? BADGES[id] : undefined
        return (
          <NavLink
            key={id}
            to={path}
            end={path === '/'}
            aria-label={badge ? `${label}, ${count} ${badge.noun}` : label}
            title={label}
            className={({ isActive }) => cn(LINK, 'h-12', isActive && LINK_ACTIVE)}
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden />
            {badge && (
              <Badge
                count={count}
                tone={badge.tone}
                size="sm"
                className="absolute top-0.5 right-0"
              />
            )}
          </NavLink>
        )
      })}

      <span className="my-2.5 h-0.5 w-7 rounded-sm bg-line" />

      {/* Aktif projeler (en fazla 5, liste sırasıyla). Sessiz proje mercan halkalı, oturumu süren ink halkalı. */}
      {projects.map((p) => {
        const silent = p.silentDays >= SILENT_AFTER_DAYS
        const label = p.activeSession
          ? `${p.name}, oturum sürüyor`
          : silent
            ? `${p.name}, ${p.silentDays} gün sessiz`
            : p.name
        return (
          <NavLink
            key={p.id}
            to={`/projeler/${p.id}`}
            aria-label={label}
            title={label}
            className={({ isActive }) => cn(LINK, 'h-9', isActive && 'bg-s3')}
          >
            <span
              className="size-3.5 rounded-[5px]"
              style={{
                background: p.color,
                boxShadow: p.activeSession
                  ? '0 0 0 2px var(--s2), 0 0 0 4px var(--ink)'
                  : silent
                    ? '0 0 0 2px var(--s2), 0 0 0 4px var(--color-coral)'
                    : undefined,
              }}
            />
          </NavLink>
        )
      })}

      <span className="grow" />

      <button
        type="button"
        onClick={() => setTheme.mutate(dark ? 'light' : 'dark')}
        aria-label={dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
        title={dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
        className={cn(LINK, 'h-10 cursor-pointer')}
      >
        {dark ? (
          <Sun size={20} strokeWidth={1.75} aria-hidden />
        ) : (
          <Moon size={20} strokeWidth={1.75} aria-hidden />
        )}
      </button>
      <NavLink
        to="/ayarlar"
        aria-label="Ayarlar"
        title="Ayarlar"
        className={({ isActive }) => cn(LINK, 'h-10', isActive && LINK_ACTIVE)}
      >
        <Settings size={20} strokeWidth={1.75} aria-hidden />
      </NavLink>
      <span
        aria-label="Taha"
        className="x mt-1.5 flex size-10 items-center justify-center rounded-full bg-lilac font-extrabold text-fill-ink"
      >
        T
      </span>
    </nav>
  )
}
