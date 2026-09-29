import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DocCreateInput, DocMoveInput, DocUpdateInput } from '@shared/ipc'
import { AUTOSAVE_DELAY_MS, type SaveStatus } from '../bilgi/useAutosave'

// Proje dokümantasyonu sorguları (5d-1). Anahtar 'project-doc' altında; GDD karşılaştırması (5d-2) da
// GDD değişince yenilensin diye aynı kökten okur.

export const docKeys = {
  all: ['project-doc'] as const,
  list: (projectId: string) => ['project-doc', 'list', projectId] as const,
  one: (id: string) => ['project-doc', 'one', id] as const,
  files: (projectId: string) => ['project-doc', 'files', projectId] as const,
  search: (projectId: string, query: string) =>
    ['project-doc', 'search', projectId, query] as const,
}

export const useDocs = (projectId: string) =>
  useQuery({
    queryKey: docKeys.list(projectId),
    queryFn: () => window.api.invoke('doc:list', { projectId }),
  })

export const useDoc = (id: string | undefined) =>
  useQuery({
    queryKey: docKeys.one(id ?? ''),
    queryFn: () => window.api.invoke('doc:get', { id: id! }),
    enabled: !!id,
  })

export const useDocFileSuggestions = (projectId: string, enabled: boolean) =>
  useQuery({
    queryKey: docKeys.files(projectId),
    queryFn: () => window.api.invoke('doc:suggestFiles', { projectId }),
    enabled,
  })

export const useDocSearch = (projectId: string, query: string) =>
  useQuery({
    queryKey: docKeys.search(projectId, query),
    queryFn: () => window.api.invoke('doc:search', { query, projectId }),
    enabled: query.trim().length > 1,
    placeholderData: (prev) => prev,
  })

function useDocMutation<I, O>(fn: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: docKeys.all }),
  })
}

export const useCreateDoc = () =>
  useDocMutation((input: DocCreateInput) => window.api.invoke('doc:create', input))
export const useUpdateDoc = () =>
  useDocMutation((input: DocUpdateInput) => window.api.invoke('doc:update', input))
export const useMoveDoc = () =>
  useDocMutation((input: DocMoveInput) => window.api.invoke('doc:move', input))
export const useDeleteDoc = () =>
  useDocMutation((id: string) => window.api.invoke('doc:delete', { id }))
export const useRestoreDoc = () =>
  useDocMutation((id: string) => window.api.invoke('doc:restore', { id }))
export const useApplyDocTemplate = () =>
  useDocMutation((projectId: string) => window.api.invoke('doc:applyTemplate', { projectId }))
export const useLinkDocFile = () =>
  useDocMutation((input: { projectId: string; path: string }) =>
    window.api.invoke('doc:linkFile', input),
  )

type Patch = { title?: string; bodyMd?: string }

/**
 * Sayfa başlığı ve gövdesi için debounce'lu otomatik kayıt (Bilgi'dekiyle aynı ritim). Liste yenilenir,
 * açık sayfanın sorgusu yenilenmez (editör kendi durumunu tutar).
 */
export function useDocAutosave(docId: string) {
  const client = useQueryClient()
  const pending = useRef<Patch>({})
  const timer = useRef<number | undefined>(undefined)
  const [status, setStatus] = useState<SaveStatus>('saved')

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    const patch = pending.current
    if (patch.title === undefined && patch.bodyMd === undefined) return
    pending.current = {}
    try {
      await window.api.invoke('doc:update', { id: docId, ...patch })
      const more = pending.current.title !== undefined || pending.current.bodyMd !== undefined
      setStatus(more ? 'pending' : 'saved')
      void client.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'project-doc' && q.queryKey[1] !== 'one',
      })
    } catch {
      pending.current = { ...patch, ...pending.current }
      setStatus('error')
    }
  }, [docId, client])

  const schedule = useCallback(
    (patch: Patch) => {
      pending.current = { ...pending.current, ...patch }
      setStatus('pending')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
    },
    [flush],
  )

  useEffect(() => () => void flush(), [flush])

  return { status, schedule, flush }
}

// ---------------------------------------------------------------- GDD ile gerçeklik (5d-2)

/** GDD ↔ klasör karşılaştırması; doküman ya da kural değişince yenilenir (aynı kök anahtar). */
export const useGddCompare = (projectId: string) =>
  useQuery({
    queryKey: ['project-doc', 'gdd', projectId],
    queryFn: () => window.api.invoke('gdd:compare', { projectId }),
  })

export const useSetCountRule = () =>
  useDocMutation((input: { projectId: string; label: string; glob: string | null }) =>
    window.api.invoke('gdd:setRule', input),
  )
