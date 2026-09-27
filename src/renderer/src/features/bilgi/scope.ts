import type { NoteListInput } from '@shared/ipc'

/** Sol sütunda seçili kapsam. Etiket filtresi bundan bağımsız, üstüne eklenir. */
export type Scope =
  { kind: 'all' } | { kind: 'pinned' } | { kind: 'none' } | { kind: 'collection'; id: string }

export function scopeFilter(scope: Scope, tagId: string | null): NoteListInput {
  const tag = tagId ? { tagId } : {}
  switch (scope.kind) {
    case 'all':
      return tag
    case 'pinned':
      return { pinned: true, ...tag }
    case 'none':
      return { collectionId: 'none', ...tag }
    case 'collection':
      return { collectionId: scope.id, ...tag }
  }
}
