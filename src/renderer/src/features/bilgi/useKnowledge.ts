import { useCallback } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CollectionDeleteMode, NoteListInput, NoteUpdateInput } from '@shared/ipc'

export const knowledgeKeys = {
  collections: ['collection'] as const,
  tags: ['tag'] as const,
  notes: ['note'] as const,
  list: (filter: NoteListInput) => ['note', 'list', filter] as const,
  note: (id: string) => ['note', 'get', id] as const,
  search: (query: string) => ['note', 'search', query] as const,
  titles: ['note', 'titles'] as const,
}

export const useCollections = () =>
  useQuery({
    queryKey: knowledgeKeys.collections,
    queryFn: () => window.api.invoke('collection:list', undefined),
  })

export const useTags = () =>
  useQuery({
    queryKey: knowledgeKeys.tags,
    queryFn: () => window.api.invoke('tag:list', undefined),
  })

export const useNotes = (filter: NoteListInput) =>
  useQuery({
    queryKey: knowledgeKeys.list(filter),
    queryFn: () => window.api.invoke('note:list', filter),
    placeholderData: keepPreviousData,
  })

export const useNote = (id: string | undefined) =>
  useQuery({
    queryKey: knowledgeKeys.note(id ?? ''),
    queryFn: () => window.api.invoke('note:get', { id: id ?? '' }),
    enabled: !!id,
  })

export const useNoteSearch = (query: string) =>
  useQuery({
    queryKey: knowledgeKeys.search(query),
    queryFn: () => window.api.invoke('note:search', { query }),
    enabled: query.trim().length > 0,
    placeholderData: keepPreviousData,
  })

export const useNoteTitles = () =>
  useQuery({
    queryKey: knowledgeKeys.titles,
    queryFn: () => window.api.invoke('note:titles', undefined),
  })

/** Not değişince liste, sayılar, etiketler ve arama yenilenir. */
export function useInvalidateKnowledge() {
  const client = useQueryClient()
  return useCallback(
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: knowledgeKeys.collections }),
        client.invalidateQueries({ queryKey: knowledgeKeys.tags }),
        client.invalidateQueries({ queryKey: knowledgeKeys.notes }),
      ]),
    [client],
  )
}

function useKnowledgeMutation<I, O>(fn: (input: I) => Promise<O>) {
  const invalidate = useInvalidateKnowledge()
  return useMutation({ mutationFn: fn, onSettled: invalidate })
}

export const useCreateCollection = () =>
  useKnowledgeMutation((name: string) => window.api.invoke('collection:create', { name }))

export const useRenameCollection = () =>
  useKnowledgeMutation((input: { id: string; name: string }) =>
    window.api.invoke('collection:rename', input),
  )

export const useDeleteCollection = () =>
  useKnowledgeMutation((input: { id: string; mode: CollectionDeleteMode }) =>
    window.api.invoke('collection:delete', input),
  )

export const useRestoreCollection = () =>
  useKnowledgeMutation((id: string) => window.api.invoke('collection:restore', { id }))

export const useCreateNote = () =>
  useKnowledgeMutation((collectionId: string | null) =>
    window.api.invoke('note:create', { collectionId }),
  )

/** Şerit eylemleri (koleksiyon, etiket, sabitle, AI). Gövde kaydı editörün kendi akışında. */
export const useUpdateNote = () =>
  useKnowledgeMutation((input: NoteUpdateInput) => window.api.invoke('note:update', input))

export const useDeleteNote = () =>
  useKnowledgeMutation((id: string) => window.api.invoke('note:delete', { id }))

export const useRestoreNote = () =>
  useKnowledgeMutation((id: string) => window.api.invoke('note:restore', { id }))
