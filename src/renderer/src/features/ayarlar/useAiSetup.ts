import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// Ayarlar > AI: yerel modelin durumu (indirme ilerlemesi `aiModel:changed` ile) ve Claude Code'un yeri / testi.

export const aiSetupKeys = {
  model: ['aiModel'] as const,
  claude: ['claude', 'info'] as const,
}

export function useLocalModel() {
  const client = useQueryClient()
  useEffect(
    () =>
      window.api.on('aiModel:changed', () => {
        void client.invalidateQueries({ queryKey: aiSetupKeys.model })
      }),
    [client],
  )
  return useQuery({
    queryKey: aiSetupKeys.model,
    queryFn: () => window.api.invoke('aiModel:status', undefined),
  })
}

function useModelMutation(fn: () => Promise<void>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: aiSetupKeys.model }),
  })
}

export const useDownloadModel = () =>
  useModelMutation(() => window.api.invoke('aiModel:download', undefined))
export const useCancelDownload = () =>
  useModelMutation(() => window.api.invoke('aiModel:cancelDownload', undefined))
export const useDeleteModel = () =>
  useModelMutation(() => window.api.invoke('aiModel:delete', undefined))

export const useClaudeInfo = () =>
  useQuery({
    queryKey: aiSetupKeys.claude,
    queryFn: () => window.api.invoke('claude:info', undefined),
  })

export const useClaudeTest = () =>
  useMutation({ mutationFn: () => window.api.invoke('claude:test', undefined) })
