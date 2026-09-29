import type { DocSummary } from '@shared/ipc'

// Doküman ağacı (5d-1): düz listeden görünen satırlar (derinlik, alt sayfa var mı) ve sürükle-bırak hedefi.

/** Sayfa türünün etiketi (düz sayfada yok). */
export const KIND_TAG: Record<DocSummary['kind'], string | null> = {
  page: null,
  adr: 'Karar',
  gdd: 'GDD',
}

export type TreeRow = { doc: DocSummary; depth: number; hasChildren: boolean }

/** Kök → alt sayfalar sırasıyla; kapalı düğümün altı gösterilmez. Sahipsiz (üstü silinmiş) sayfa köke düşer. */
export function visibleRows(
  docs: readonly DocSummary[],
  collapsed: ReadonlySet<string>,
): TreeRow[] {
  const ids = new Set(docs.map((d) => d.id))
  const children = new Map<string | null, DocSummary[]>()
  for (const d of docs) {
    const parent = d.parentId && ids.has(d.parentId) ? d.parentId : null
    const list = children.get(parent)
    if (list) list.push(d)
    else children.set(parent, [d])
  }
  for (const list of children.values())
    list.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
  const out: TreeRow[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const d of children.get(parent) ?? []) {
      const kids = children.get(d.id) ?? []
      out.push({ doc: d, depth, hasChildren: kids.length > 0 })
      if (!collapsed.has(d.id)) walk(d.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/** Satırın üst çeyreği önüne, alt çeyreği arkasına, ortası içine (son alt sayfa). */
export type DropZone = 'before' | 'inside' | 'after'

export function dropZone(offsetY: number, height: number): DropZone {
  if (offsetY < height * 0.25) return 'before'
  if (offsetY > height * 0.75) return 'after'
  return 'inside'
}

/** Bırakmanın `doc:move` girdisi; kendi üstüne ya da kendi alt ağacına bırakma null. */
export function moveTarget(
  docs: readonly DocSummary[],
  dragId: string,
  targetId: string,
  zone: DropZone,
): { parentId: string | null; index: number } | null {
  if (dragId === targetId) return null
  const byId = new Map(docs.map((d) => [d.id, d]))
  const target = byId.get(targetId)
  if (!target) return null
  // Hedef, sürüklenenin altında mı?
  for (let p = target.parentId; p; p = byId.get(p)?.parentId ?? null) if (p === dragId) return null
  const siblingsOf = (parentId: string | null) =>
    docs
      .filter((d) => d.parentId === parentId && d.id !== dragId)
      .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
  if (zone === 'inside') return { parentId: target.id, index: siblingsOf(target.id).length }
  const list = siblingsOf(target.parentId)
  const i = list.findIndex((d) => d.id === target.id)
  return { parentId: target.parentId, index: zone === 'before' ? i : i + 1 }
}
