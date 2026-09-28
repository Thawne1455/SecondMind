import { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { Reminder, Task } from '@shared/ipc'
import { useNoteTitles } from '../features/bilgi/useKnowledge'
import { ReminderWorkspace } from '../features/bugun/ReminderWorkspace'
import { TaskWorkspace } from '../features/bugun/TaskWorkspace'
import { planningKeys, useReminders, useTasks } from '../features/bugun/usePlanning'
import { FAKE_PROJECTS } from '../lib/fake'
import { useSetSetting, useSetting } from '../lib/settings'
import { CommandPalette, type PaletteItem } from './CommandPalette'
import { PANELS } from './panels'
import { QuickDump } from './QuickDump'
import { ShellContext } from './shell-context'
import { Sidebar } from './Sidebar'

type Dialog =
  | { kind: 'palette' }
  | { kind: 'dump' }
  | { kind: 'task'; task: Task | null; planned: string | null }
  | { kind: 'reminder'; reminder: Reminder | null }

/**
 * Kenar çubuğu + içerik. Her ekrandan: Ctrl K komut paleti, Ctrl N Hızlı Döküm, Ctrl G görev,
 * Ctrl H hatırlatma. Aynı anda tek pencere açık. Ana süreç olaylarını da burada dinler.
 */
export function AppShell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const theme = useSetting('theme')
  const { mutate: saveTheme } = useSetSetting('theme')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const close = () => setDialog(null)

  useEffect(() => {
    const shortcuts: Record<string, Dialog> = {
      n: { kind: 'dump' },
      g: { kind: 'task', task: null, planned: null },
      h: { kind: 'reminder', reminder: null },
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return
      const key = e.key.toLocaleLowerCase('tr-TR')
      if (key === 'k') {
        e.preventDefault()
        setDialog((d) => (d?.kind === 'palette' ? null : { kind: 'palette' }))
      } else if (shortcuts[key]) {
        e.preventDefault()
        setDialog(shortcuts[key])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Hatırlatma çaldı / kaçırıldı: listeler yenilenir. Bildirime tıklandı: Bugün.
  useEffect(() => {
    const offChanged = window.api.on('reminders:changed', () => {
      void queryClient.invalidateQueries({ queryKey: planningKeys.reminders })
    })
    const offNav = window.api.on('nav:today', () => void navigate('/'))
    return () => {
      offChanged()
      offNav()
    }
  }, [queryClient, navigate])

  const shell = useMemo(
    () => ({
      openPalette: () => setDialog({ kind: 'palette' }),
      openQuickDump: () => setDialog({ kind: 'dump' }),
      openTask: (task: Task | null = null, planned: string | null = null) =>
        setDialog({ kind: 'task', task, planned }),
      openReminder: (reminder: Reminder | null = null) => setDialog({ kind: 'reminder', reminder }),
    }),
    [],
  )

  const dark = theme.data === 'dark'
  const noteTitles = useNoteTitles().data
  const openTasks = useTasks('open').data
  const reminders = useReminders().data
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
        run: () => shell.openQuickDump(),
      },
      {
        id: 'task-new',
        group: 'Komutlar',
        label: 'Görev ekle',
        meta: 'Ctrl G',
        run: () => shell.openTask(),
      },
      {
        id: 'reminder-new',
        group: 'Komutlar',
        label: 'Hatırlatma ekle',
        meta: 'Ctrl H',
        run: () => shell.openReminder(),
      },
      {
        id: 'tasks',
        group: 'Komutlar',
        label: 'Tüm görevler',
        meta: openTasks ? `${openTasks.length} açık` : undefined,
        run: () => shell.openTask(),
      },
      {
        id: 'reminders',
        group: 'Komutlar',
        label: 'Tüm hatırlatmalar',
        meta: reminders ? `${reminders.length} kurulu` : undefined,
        run: () => shell.openReminder(),
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
      ...(openTasks ?? []).map((t) => ({
        id: `task-${t.id}`,
        group: 'Görevler' as const,
        label: t.title,
        meta: t.plannedDate
          ? format(new Date(`${t.plannedDate}T00:00`), 'd MMM', { locale: tr })
          : undefined,
        run: () => shell.openTask(t),
      })),
      ...(noteTitles ?? []).map((n) => ({
        id: `note-${n.id}`,
        group: 'Notlar' as const,
        label: n.title || 'Adsız not',
        run: () => navigate(`/bilgi/${n.id}`),
      })),
    ],
    [navigate, dark, saveTheme, noteTitles, openTasks, reminders, shell],
  )

  return (
    <ShellContext value={shell}>
      <div className="flex h-screen overflow-hidden bg-bg">
        <Sidebar />
        <div className="min-w-0 grow overflow-y-auto">
          <Outlet />
        </div>
      </div>
      <CommandPalette open={dialog?.kind === 'palette'} onClose={close} items={items} />
      <QuickDump open={dialog?.kind === 'dump'} onClose={close} />
      <TaskWorkspace
        open={dialog?.kind === 'task'}
        task={dialog?.kind === 'task' ? dialog.task : null}
        defaultPlanned={dialog?.kind === 'task' ? dialog.planned : null}
        onClose={close}
      />
      <ReminderWorkspace
        open={dialog?.kind === 'reminder'}
        reminder={dialog?.kind === 'reminder' ? dialog.reminder : null}
        onClose={close}
      />
    </ShellContext>
  )
}
