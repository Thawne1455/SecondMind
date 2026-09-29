import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { planningKeys } from '../bugun/usePlanning'

// Günlük ve devlog taslağı sorguları (5d-3). Anahtar 'task' altında: görev bitince, oturum kapanınca
// (proje anahtarı ayrıca), playtest yapıştırılınca Günlük de yenilensin.

export const logKey = (projectId: string) => [...planningKeys.tasks, 'log', projectId] as const

export const useProjectLog = (projectId: string) =>
  useInfiniteQuery({
    queryKey: logKey(projectId),
    queryFn: ({ pageParam }) => window.api.invoke('log:list', { projectId, until: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextUntil,
  })

export const useDevlogDraft = (projectId: string, weekOf: string | null, enabled: boolean) =>
  useQuery({
    queryKey: [...logKey(projectId), 'devlog', weekOf],
    queryFn: () => window.api.invoke('devlog:draft', { projectId, weekOf }),
    enabled,
  })

function useLogMutation<I, O>(fn: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: planningKeys.tasks }),
  })
}

export const useAddLogNote = () =>
  useLogMutation((input: { projectId: string; bodyMd: string; kind?: 'note' | 'devlog' }) =>
    window.api.invoke('log:addNote', input),
  )
export const useDeleteLogNote = () =>
  useLogMutation((id: string) => window.api.invoke('log:deleteNote', { id }))
export const useRestoreLogNote = () =>
  useLogMutation((id: string) => window.api.invoke('log:restoreNote', { id }))
