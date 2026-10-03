import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DumpCreateInput, DumpStatus } from '@shared/ipc'

export const dumpKeys = {
  all: ['dump'] as const,
  list: (status: DumpStatus) => ['dump', 'list', status] as const,
  count: ['dump', 'count'] as const,
}

export function useDumps(status: DumpStatus) {
  return useQuery({
    queryKey: dumpKeys.list(status),
    queryFn: () => window.api.invoke('dump:list', { status }),
  })
}

/** Kenar çubuğu ve üst çubuk rozeti: bekleyen döküm sayısı. */
export function usePendingDumpCount(): number {
  const { data } = useQuery({
    queryKey: dumpKeys.count,
    queryFn: () => window.api.invoke('dump:count', undefined),
  })
  return data?.pending ?? 0
}

function useDumpMutation<I>(fn: (input: I) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: dumpKeys.all }),
  })
}

export const useCreateDump = () =>
  useDumpMutation((input: DumpCreateInput) => window.api.invoke('dump:create', input))

export const useDeleteDump = () =>
  useDumpMutation((id: string) => window.api.invoke('dump:delete', { id }))

export const useRestoreDump = () =>
  useDumpMutation((id: string) => window.api.invoke('dump:restore', { id }))

export const useRequeueDump = () =>
  useDumpMutation((id: string) => window.api.invoke('dump:requeue', { id }))
