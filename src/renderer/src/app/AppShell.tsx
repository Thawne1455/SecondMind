import { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { FAKE_PROJECTS } from '../lib/fake'
import { useSetSetting, useSetting } from '../lib/settings'
import { CommandPalette, type PaletteItem } from './CommandPalette'
import { PANELS } from './panels'
import { QuickDump } from './QuickDump'
import { ShellContext } from './shell-context'
import { Sidebar } from './Sidebar'

/** Kenar çubuğu + içerik. Ctrl K komut paleti, Ctrl N Hızlı Döküm her ekrandan açılır. */
export function AppShell() {
  const navigate = useNavigate()
  const theme = useSetting('theme')
  const { mutate: saveTheme } = useSetSetting('theme')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [dumpOpen, setDumpOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return
      const key = e.key.toLocaleLowerCase('tr-TR')
      if (key === 'k') {
        e.preventDefault()
        setDumpOpen(false)
        setPaletteOpen((o) => !o)
      } else if (key === 'n') {
        e.preventDefault()
        setPaletteOpen(false)
        setDumpOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const shell = useMemo(
    () => ({ openPalette: () => setPaletteOpen(true), openQuickDump: () => setDumpOpen(true) }),
    [],
  )

  const dark = theme.data === 'dark'
  // Notlar grubu Aşama 2'de (FTS5 arama) dolar.
  const items = useMemo<PaletteItem[]>(
    () => [
      ...FAKE_PROJECTS.map((p) => ({
        id: `project-${p.id}`,
        group: 'Projeler' as const,
        label: `${p.name} — projeyi aç`,
        dot: p.color,
        run: () => navigate('/projeler'),
      })),
      {
        id: 'quick-dump',
        group: 'Komutlar',
        label: 'Hızlı döküm',
        meta: 'Ctrl N',
        run: () => setDumpOpen(true),
      },
      ...PANELS.map((panel) => ({
        id: `go-${panel.id}`,
        group: 'Komutlar' as const,
        label: `${panel.label} ekranına git`,
        run: () => navigate(panel.path),
      })),
      {
        id: 'go-settings',
        group: 'Komutlar',
        label: 'Ayarlar',
        run: () => navigate('/ayarlar'),
      },
      {
        id: 'theme',
        group: 'Komutlar',
        label: dark ? 'Açık temaya geç' : 'Koyu temaya geç',
        run: () => saveTheme(dark ? 'light' : 'dark'),
      },
      ...(import.meta.env.DEV
        ? [
            {
              id: 'dev-design',
              group: 'Komutlar' as const,
              label: 'Tasarım sistemi (geliştirme)',
              run: () => navigate('/tasarim'),
            },
          ]
        : []),
    ],
    [navigate, dark, saveTheme],
  )

  return (
    <ShellContext value={shell}>
      <div className="flex h-screen overflow-hidden bg-bg">
        <Sidebar />
        <div className="min-w-0 grow overflow-y-auto">
          <Outlet />
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={items} />
      <QuickDump open={dumpOpen} onClose={() => setDumpOpen(false)} />
    </ShellContext>
  )
}
