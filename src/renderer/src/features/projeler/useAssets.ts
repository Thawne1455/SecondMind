import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AssetAddInput, ShotAddInput } from '@shared/ipc'
import { planningKeys } from '../bugun/usePlanning'

// Zaman makinesi ve varlıklar (5d-4). Anahtar 'task' altında: Günlük kareleri de gösterir, birlikte yenilensin.

export const assetKeys = {
  machine: (projectId: string) => [...planningKeys.tasks, 'shots', projectId] as const,
  assets: (projectId: string) => [...planningKeys.tasks, 'assets', projectId] as const,
}

export const useTimeMachine = (projectId: string) =>
  useQuery({
    queryKey: assetKeys.machine(projectId),
    queryFn: () => window.api.invoke('shot:machine', { projectId }),
  })

export const useAssets = (projectId: string) =>
  useQuery({
    queryKey: assetKeys.assets(projectId),
    queryFn: () => window.api.invoke('asset:list', { projectId }),
  })

function useAssetMutation<I, O>(fn: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: planningKeys.tasks }),
  })
}

export const useAddShot = () =>
  useAssetMutation((input: ShotAddInput) => window.api.invoke('shot:add', input))
export const useUpdateShot = () =>
  useAssetMutation((input: { id: string; starred?: boolean; deleted?: boolean }) =>
    window.api.invoke('shot:update', input),
  )
export const useBindImageDir = () =>
  useAssetMutation((input: { folderId: string; path: string; bound: boolean }) =>
    window.api.invoke('shot:bindDir', input),
  )
export const useAddAsset = () =>
  useAssetMutation((input: AssetAddInput) => window.api.invoke('asset:add', input))
export const useUpdateAsset = () =>
  useAssetMutation(
    (input: {
      id: string
      title?: string
      docId?: string | null
      taskId?: string | null
      deleted?: boolean
    }) => window.api.invoke('asset:update', input),
  )

/** Pano/sürükle dosyasını IPC girdisine çevirir. */
export async function fileInput(
  file: File,
): Promise<{ name: string; mime: string; bytes: Uint8Array<ArrayBuffer> }> {
  return {
    name: file.name || 'dosya',
    mime: file.type || 'application/octet-stream',
    bytes: new Uint8Array(await file.arrayBuffer()),
  }
}
