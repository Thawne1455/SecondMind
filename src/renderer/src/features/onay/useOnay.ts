import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ActivityFilter } from '@shared/ipc'

export const proposalKeys = {
  all: ['proposals'] as const,
  list: ['proposals', 'list'] as const,
  count: ['proposals', 'count'] as const,
  activity: (actor: ActivityFilter, days: number) =>
    ['proposals', 'activity', actor, days] as const,
}

export function useInbox() {
  return useQuery({
    queryKey: proposalKeys.list,
    queryFn: () => window.api.invoke('proposal:list', undefined),
  })
}

/** Kenar çubuğu rozeti: bekleyen öneri sayısı. */
export function usePendingProposalCount(): number {
  const { data } = useQuery({
    queryKey: proposalKeys.count,
    queryFn: () => window.api.invoke('proposal:count', undefined),
  })
  return data?.pending ?? 0
}

export function useActivity(actor: ActivityFilter, days: number) {
  return useQuery({
    queryKey: proposalKeys.activity(actor, days),
    queryFn: () => window.api.invoke('activity:list', { actor, days }),
    placeholderData: (prev) => prev,
  })
}

/**
 * Onay, ret ve geri alma her panelin verisine dokunabilir (görev, not, hatırlatma, sınav, proje, döküm
 * İşlenenler): bütün sorgular bayatlar, sadece ekrandakiler yeniden okunur.
 */
function useDecision<I, O>(fn: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => client.invalidateQueries() })
}

export const useApprove = () =>
  useDecision((input: { id: string; edited?: Record<string, unknown> }) =>
    window.api.invoke('proposal:approve', input),
  )

export const useReject = () =>
  useDecision((id: string) => window.api.invoke('proposal:reject', { id }))

export const useApproveAll = () =>
  useDecision((jobId: string) => window.api.invoke('proposal:approveAll', { jobId }))

export const useUndoProposal = () =>
  useDecision((id: string) => window.api.invoke('proposal:undo', { id }))

export const useUndoActivity = () =>
  useDecision((groupId: string) => window.api.invoke('activity:undo', { groupId }))
