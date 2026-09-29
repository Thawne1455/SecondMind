import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PlaytestPasteInput } from '@shared/ipc'
import { planningKeys } from '../bugun/usePlanning'

// Playtest kutusu sorguları (5c-4). Anahtar 'task' altında: küme hataya çevrilince kanban ve motor, görev
// silinince/bitince kümenin etiketi birlikte yenilenir.

export const playtestKey = (projectId: string) =>
  [...planningKeys.tasks, 'playtest', projectId] as const

export const usePlaytest = (projectId: string) =>
  useQuery({
    queryKey: playtestKey(projectId),
    queryFn: () => window.api.invoke('playtest:overview', { projectId }),
  })

/** "Kim" otomatik tamamlaması. */
export const useKnownTesters = (enabled: boolean) =>
  useQuery({
    queryKey: [...planningKeys.tasks, 'playtest', 'testers'],
    queryFn: () => window.api.invoke('playtest:testers', undefined),
    enabled,
  })

export const usePastePreview = (text: string, receivedOn: string) =>
  useQuery({
    queryKey: ['playtest-preview', text, receivedOn],
    queryFn: () => window.api.invoke('playtest:preview', { text, receivedOn }),
    enabled: text.trim().length > 0,
    placeholderData: (prev) => prev,
    staleTime: Infinity,
  })

function usePlaytestMutation<I, O>(fn: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: planningKeys.tasks }),
  })
}

export const usePastePlaytest = () =>
  usePlaytestMutation((input: PlaytestPasteInput) => window.api.invoke('playtest:paste', input))
export const useMovePoint = () =>
  usePlaytestMutation((input: { pointId: string; clusterId: string }) =>
    window.api.invoke('playtest:move', input),
  )
export const useSplitPoint = () =>
  usePlaytestMutation((pointId: string) => window.api.invoke('playtest:split', { pointId }))
export const useConvertCluster = () =>
  usePlaytestMutation((input: { clusterId: string; kind: 'bug' | 'task' }) =>
    window.api.invoke('playtest:convert', input),
  )
export const useUndoPlaytest = () =>
  usePlaytestMutation((groupId: string) => window.api.invoke('playtest:undo', { groupId }))
