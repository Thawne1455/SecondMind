import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { Reminder, Task } from '@shared/ipc'
import { useNoteTitles } from '../features/bilgi/useKnowledge'
import { useAiSync } from '../features/dokum/useAi'
import { ReminderWorkspace } from '../features/bugun/ReminderWorkspace'
import { TaskWorkspace } from '../features/bugun/TaskWorkspace'
import { planningKeys, useReminders, useTasks } from '../features/bugun/usePlanning'
import { CreateProjectDialog } from '../features/projeler/CreateProjectDialog'
import { ParkBar } from '../features/projeler/ParkBar'
import { SessionCloseDialog } from '../features/projeler/SessionCloseDialog'
import { useProjects, useProjectsSync, useStartSession } from '../features/projeler/useProjects'
import { errorText } from '../lib/errors'
import { DialogFrame, useToast } from '../ui'
import { useSetSetting, useSetting } from '../lib/settings'
import { CommandPalette, type PaletteItem } from './CommandPalette'
import { useBoard } from '../features/okul/useSchool'
import { PANELS } from './panels'
import { QuickDump } from './QuickDump'
import { ShellContext } from './shell-context'
import { Sidebar } from './Sidebar'

type Dialog =
  | { kind: 'palette' }
  | { kind: 'dump' }
  | { kind: 'task'; task: Task | null; planned: string | null }
  | { kind: 'reminder'; reminder: Reminder | null }
  | { kind: 'project-create' }
  | { kind: 'park'; projectId: string | null }
  | { kind: 'session-close'; then?: () => void }

/**
 * Kenar çubuğu + içerik. Her ekrandan: Ctrl K komut paleti, Ctrl N Hızlı Döküm, Ctrl G görev,
 * Ctrl H hatırlatma, Ctrl Shift N yeni proje. Aynı anda tek pencere açık. Ana süreç olaylarını da
 * burada dinler. Oturum başlatma/kapama da burada: her ekrandan (Bugün, şerit, kokpit) aynı akış.
 */
export function AppShell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const theme = useSetting('theme')
  const { mutate: saveTheme } = useSetSetting('theme')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const close = () => setDialog(null)
  const { toast } = useToast()
  const projects = useProjects().data
  const startMutation = useStartSession()
  useProjectsSync()
  useAiSync()
  // startSession kararlı kalsın diye güncel liste ref'te.
  const projectsRef = useRef(projects)
  useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  useEffect(() => {
    const shortcuts: Record<string, Dialog> = {
      n: { kind: 'dump' },
      g: { kind: 'task', task: null, planned: null },
      h: { kind: 'reminder', reminder: null },
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey || e.altKey) return
      const key = e.key.toLocaleLowerCase('tr-TR')
      if (e.shiftKey) {
        if (key === 'n') {
          e.preventDefault()
          setDialog({ kind: 'project-create' })
        }
        return
      }
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

  const { mutate: startMutate } = startMutation
  const startSession = useCallback(
    (projectId: string, opts: { taskId?: string | null; after?: () => void } = {}) => {
      const run = () =>
        startMutate(
          { projectId, taskId: opts.taskId ?? null },
          {
            onSuccess: () => opts.after?.(),
            onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
          },
        )
      const running = projectsRef.current?.find((p) => p.activeSession)
      if (running && running.id !== projectId) setDialog({ kind: 'session-close', then: run })
      else if (running) opts.after?.()
      else run()
    },
    [startMutate, toast],
  )

  const shell = useMemo(
    () => ({
      openPalette: () => setDialog({ kind: 'palette' }),
      openQuickDump: () => setDialog({ kind: 'dump' }),
      openTask: (task: Task | null = null, planned: string | null = null) =>
        setDialog({ kind: 'task', task, planned }),
      openReminder: (reminder: Reminder | null = null) => setDialog({ kind: 'reminder', reminder }),
      openProjectCreate: () => setDialog({ kind: 'project-create' }),
      openPark: (projectId: string | null = null) => setDialog({ kind: 'park', projectId }),
      startSession,
      closeSession: () => setDialog({ kind: 'session-close' }),
    }),
    [startSession],
  )
  const running = projects?.find((p) => p.activeSession) ?? null

  const dark = theme.data === 'dark'
  const noteTitles = useNoteTitles().data
  const openTasks = useTasks('open').data
  const reminders = useReminders().data
  const board = useBoard().data
  const items = useMemo<PaletteItem[]>(
    () => [
      ...(projects ?? [])
        .filter((p) => p.status !== 'archived')
        .map((p) => ({
          id: `project-${p.id}`,
          group: 'Projeler' as const,
          label: `${p.name} — projeyi aç`,
          meta: p.activeSession ? 'oturumda' : undefined,
          dot: p.color,
          run: () => navigate(`/projeler/${p.id}`),
        })),
      ...(board?.courses ?? []).map((c) => ({
        id: `course-${c.id}`,
        group: 'Okul' as const,
        label: `${c.name} — dersi aç`,
        dot: c.tone,
        run: () => navigate(`/okul/ders/${c.id}`),
      })),
      ...(board?.exams ?? []).map((e) => ({
        id: `exam-${e.id}`,
        group: 'Okul' as const,
        label: `${e.courseName} ${e.title} — sınav hazırlığı`,
        meta: e.daysLeft === 0 ? 'bugün' : `${e.daysLeft} gün`,
        dot: e.tone,
        run: () => navigate(`/okul/sinav/${e.id}`),
      })),
      ...(board?.term
        ? [
            {
              id: 'gpa',
              group: 'Okul' as const,
              label: 'Ortalama (GANO)',
              run: () => navigate('/okul/gano'),
            },
          ]
        : []),
      ...(running
        ? [
            {
              id: 'session-close',
              group: 'Komutlar' as const,
              label: `${running.name} oturumunu kapat`,
              run: () => shell.closeSession(),
            },
          ]
        : []),
      {
        id: 'park',
        group: 'Komutlar',
        label: 'Park et (sonraya at)',
        meta: 'Ctrl Alt P',
        run: () => shell.openPark(),
      },
      {
        id: 'project-new',
        group: 'Komutlar',
        label: 'Yeni proje',
        meta: 'Ctrl Shift N',
        run: () => shell.openProjectCreate(),
      },
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
    [navigate, dark, saveTheme, noteTitles, openTasks, reminders, shell, projects, running, board],
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
      <CreateProjectDialog open={dialog?.kind === 'project-create'} onClose={close} />
      <DialogFrame
        open={dialog?.kind === 'park'}
        onClose={close}
        label="Park et"
        width={720}
        placement="top"
      >
        {dialog?.kind === 'park' && (
          <ParkBar
            projects={projects ?? []}
            preferredId={dialog.projectId}
            source="app"
            onDone={close}
            className="h-24 rounded-modal"
          />
        )}
      </DialogFrame>
      <SessionCloseDialog
        project={dialog?.kind === 'session-close' ? running : null}
        onClose={close}
        onClosed={dialog?.kind === 'session-close' ? dialog.then : undefined}
      />
    </ShellContext>
  )
}
