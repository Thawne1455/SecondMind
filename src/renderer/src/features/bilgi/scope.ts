import type { NoteListInput } from '@shared/ipc'

/** Sol sütunda seçili kapsam. Etiket filtresi bundan bağımsız, üstüne eklenir. */
export type Scope =
  | { kind: 'all' }
  | { kind: 'pinned' }
  | { kind: 'ideas' }
  | { kind: 'none' }
  | { kind: 'collection'; id: string }

export function scopeFilter(scope: Scope, tagId: string | null): NoteListInput {
  const tag = tagId ? { tagId } : {}
  switch (scope.kind) {
    case 'all':
      return tag
    // Fikirler kendi listesinden gelir (`idea:list`); etiket filtresi orada uygulanmaz.
    case 'ideas':
      return {}
    case 'pinned':
      return { pinned: true, ...tag }
    case 'none':
      return { collectionId: 'none', ...tag }
    case 'collection':
      return { collectionId: scope.id, ...tag }
  }
}
