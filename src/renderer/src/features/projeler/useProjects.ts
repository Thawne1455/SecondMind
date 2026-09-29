import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import type {
  Briefing,
  KanbanStatus,
  ParkingAddInput,
  ProjectCreateInput,
  ProjectSummary,
  ProjectUpdateInput,
  SessionCloseInput,
  SessionStartInput,
  Task,
} from '@shared/ipc'
import { planningKeys } from '../bugun/usePlanning'

// Proje, oturum ve park alanı sorguları. Projeler sayfası, kenar çubuğu, komut paleti, Bugün ve park penceresi kullanır.

export const projectKeys = {
  all: ['project'] as const,
  list: ['project', 'list'] as const,
  sessions: (projectId: string) => ['project', 'sessions', projectId] as const,
  parking: (projectId?: string) => ['project', 'parking', projectId ?? 'all'] as const,
  scanInfo: (projectId: string) => ['project', 'scanInfo', projectId] as const,
}

/** Süren oturumun süresi ve ritim dakikada bir ilerlesin. */
export const useProjects = () =>
  useQuery({
    queryKey: projectKeys.list,
    queryFn: () => window.api.invoke('project:list', undefined),
    refetchInterval: 60_000,
  })

/** Canlı projeler id'ye göre (Bugün'deki renkler için). */
export function useProjectMap(): Map<string, ProjectSummary> {
  const list = useProjects().data
  return useMemo(() => new Map((list ?? []).map((p) => [p.id, p])), [list])
}

/** Tüm projeler içinde süren oturum (en fazla bir tane) ve projesi. */
export function useActiveSession() {
  const list = useProjects().data
  const project = list?.find((p) => p.activeSession)
  return project ? { project, session: project.activeSession! } : null
}

export const useSessions = (projectId: string, limit = 20) =>
  useQuery({
    queryKey: projectKeys.sessions(projectId),
    queryFn: () => window.api.invoke('session:list', { projectId, limit }),
  })

export const useParking = (projectId?: string) =>
  useQuery({
    queryKey: projectKeys.parking(projectId),
    queryFn: () => window.api.invoke('parking:list', { projectId }),
  })

/** Başka pencere (park penceresi) veriyi değiştirince önbellek yenilenir. */
export function useProjectsSync(): void {
  const client = useQueryClient()
  useEffect(
    () =>
      window.api.on('projects:changed', () => {
        void client.invalidateQueries({ queryKey: projectKeys.all })
      }),
    [client],
  )
}

function useInvalidating<I, O>(keys: QueryKey[], fn: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))),
  })
}

const P = [projectKeys.all]
// Park öğesini göreve çevirmek ve oturum görevleri görev listesini de değiştirir.
const PT = [projectKeys.all, planningKeys.tasks]

export const useCreateProject = () =>
  useInvalidating(P, (input: ProjectCreateInput) => window.api.invoke('project:create', input))
export const useUpdateProject = () =>
  useInvalidating(P, (input: ProjectUpdateInput) => window.api.invoke('project:update', input))
export const useDeleteProject = () =>
  useInvalidating(PT, (id: string) => window.api.invoke('project:delete', { id }))
export const useRestoreProject = () =>
  useInvalidating(PT, (id: string) => window.api.invoke('project:restore', { id }))

export const useStartSession = () =>
  useInvalidating(P, (input: SessionStartInput) => window.api.invoke('session:start', input))
export const useCloseSession = () =>
  useInvalidating(P, (input: SessionCloseInput) => window.api.invoke('session:close', input))
export const useDiscardSession = () =>
  useInvalidating(P, (id: string) => window.api.invoke('session:discard', { id }))

export const useAddParking = () =>
  useInvalidating(P, (input: ParkingAddInput) => window.api.invoke('parking:add', input))
export const useResolveParking = () =>
  useInvalidating(PT, (input: { id: string; action: 'convert' | 'dismiss' }) =>
    window.api.invoke('parking:resolve', input),
  )
export const useRestoreParking = () =>
  useInvalidating(PT, (id: string) => window.api.invoke('parking:restore', { id }))

/** Güncelle (tüm projeler) ya da Tara (tek proje). Klasörler sadece okunur. */
export const useScan = () =>
  useInvalidating(P, (projectId?: string) => window.api.invoke('scan:run', { projectId }))

/** Projelerin en son taranma anı; hiç taranmadıysa null. */
export function useLastScanAt(): number | null {
  const list = useProjects().data
  return useMemo(() => {
    const times = (list ?? []).map((p) => p.lastScanAt).filter((t): t is number => t !== null)
    return times.length ? Math.max(...times) : null
  }, [list])
}

/**
 * Detay sayfası açıldı: sıralama için açılış kaydedilir (log'a yazılmaz) ve önceki açılışa göre geri dönüş
 * brifingi gelir. Bant o açılışta bir kez görünür; `dismiss` kapatır. Proje değişince bileşen yeniden kurulur.
 */
export function useProjectOpened(id: string): { briefing: Briefing | null; dismiss: () => void } {
  const client = useQueryClient()
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  useEffect(() => {
    let alive = true
    void window.api.invoke('project:opened', { id }).then((b) => {
      if (alive) setBriefing(b)
      return client.invalidateQueries({ queryKey: projectKeys.list })
    })
    return () => {
      alive = false
    }
  }, [id, client])
  return { briefing, dismiss: () => setBriefing(null) }
}

/** Kokpit'in Bu hafta ve Koddaki notlar karoları; Güncelle / Tara sonrası yenilenir. */
export const useScanInfo = (projectId: string) =>
  useQuery({
    queryKey: projectKeys.scanInfo(projectId),
    queryFn: () => window.api.invoke('project:scanInfo', { id: projectId }),
  })

/**
 * Sıradaki adım motoru (Kokpit "Şimdi bunu yap"). Anahtar 'task' altında: her görev değişikliği yeniler;
 * projeden gelen girdiler (yazılan adım, park, tarama) anahtarda, değişince yeniden okunur.
 */
export const useNextSteps = (p: ProjectSummary) =>
  useQuery({
    queryKey: [
      ...planningKeys.tasks,
      'nextSteps',
      p.id,
      p.nextStep,
      p.parkingWaiting,
      p.lastScanAt,
    ],
    queryFn: () => window.api.invoke('project:nextSteps', { id: p.id }),
  })

// ---------------------------------------------------------------- Görevler (kanban, 5c)

/** Kanbanın görevleri. Anahtar 'task' altında: Bugün'deki ve paletteki her görev değişikliği de yeniler. */
export const projectTasksKey = (projectId: string) =>
  [...planningKeys.tasks, 'project', projectId] as const

export const useProjectTasks = (projectId: string) =>
  useQuery({
    queryKey: projectTasksKey(projectId),
    queryFn: () => window.api.invoke('task:listProject', { projectId }),
  })

/** Projenin kilometre taşları (filtre, kart etiketi, panel seçimi). */
export const useMilestones = (projectId: string) =>
  useQuery({
    queryKey: [...projectKeys.all, 'milestones', projectId],
    queryFn: () => window.api.invoke('milestone:list', { projectId }),
  })

/**
 * Kartı başka kolona taşır (sürükle-bırak, ← / →). Kart bırakıldığı kolonda hemen görünür;
 * Bitti'ye geçiş `status`'u ana süreçte senkronlar, sonra tüm görev sorguları yenilenir.
 */
export function useMoveTask(projectId: string) {
  const client = useQueryClient()
  const key = projectTasksKey(projectId)
  return useMutation({
    mutationFn: (input: { id: string; kanbanStatus: KanbanStatus }) =>
      window.api.invoke('task:update', input),
    onMutate: async ({ id, kanbanStatus }) => {
      await client.cancelQueries({ queryKey: key })
      client.setQueryData<Task[]>(key, (list) =>
        list?.map((t) =>
          t.id === id
            ? { ...t, kanbanStatus, status: kanbanStatus === 'done' ? 'done' : 'open' }
            : t,
        ),
      )
    },
    onSettled: () => client.invalidateQueries({ queryKey: planningKeys.tasks }),
  })
}
