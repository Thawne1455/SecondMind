import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AiModel, AiRunResult, ScheduleImportInput } from '@shared/ipc'
import { useToast } from '../../ui'
import { proposalKeys } from '../onay/useOnay'
import { dumpKeys } from './useDumps'

export const aiKeys = { status: ['ai', 'status'] as const }

/** Süren çalıştırma ve son sonuç; `ai:changed` geldikçe yenilenir (useAiSync). */
export function useAiStatus() {
  return useQuery({
    queryKey: aiKeys.status,
    queryFn: () => window.api.invoke('ai:status', undefined),
  })
}

export function useAiProcess() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (model: AiModel) => window.api.invoke('ai:process', { model }),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: aiKeys.status }),
        client.invalidateQueries({ queryKey: dumpKeys.all }),
      ]),
  })
}

/** Okul > Programdan doldur: dosya döküm olur ve DERİN ile hemen işlenir. */
export function useImportSchedule() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: ScheduleImportInput) => window.api.invoke('ai:importSchedule', input),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: aiKeys.status }),
        client.invalidateQueries({ queryKey: dumpKeys.all }),
      ]),
  })
}

export function useAiCancel() {
  return useMutation({ mutationFn: () => window.api.invoke('ai:cancel', undefined) })
}

function resultToast(r: AiRunResult): { message: string; error: boolean } {
  if (r.cancelled) return { message: 'AI işlemi iptal edildi. Dökümler bekliyor.', error: false }
  const parts: string[] = []
  if (r.proposals) parts.push(`${r.proposals} öneri Onay Kutusu'nda`)
  if (r.skipped) parts.push(`${r.skipped} döküm atlandı`)
  if (r.errors.length) parts.push(r.errors.join(' · '))
  return { message: parts.join(' · ') || 'Öneri çıkmadı.', error: !r.proposals }
}

/**
 * AppShell'de bir kez: `ai:changed` olayında durum, döküm listeleri ve Onay Kutusu yenilenir; çalıştırma bitince hangi ekranda
 * olunursa olunsun sonuç toast'u ("7 öneri Onay Kutusu'nda" + Aç).
 */
export function useAiSync(): void {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const status = useAiStatus().data
  const shown = useRef<string | null | undefined>(undefined)

  useEffect(
    () =>
      window.api.on('ai:changed', () => {
        void client.invalidateQueries({ queryKey: aiKeys.status })
        void client.invalidateQueries({ queryKey: dumpKeys.all })
        void client.invalidateQueries({ queryKey: proposalKeys.all })
      }),
    [client],
  )

  useEffect(() => {
    if (!status) return
    const runId = status.last?.runId ?? null
    // İlk okuma: uygulama açılmadan önce biten çalıştırma için toast yok.
    if (shown.current === undefined) {
      shown.current = runId
      return
    }
    if (!status.last || runId === shown.current) return
    shown.current = runId
    const { message, error } = resultToast(status.last)
    toast(
      status.last.proposals
        ? {
            variant: 'fill',
            domain: 'dump',
            message,
            duration: 0,
            action: { label: 'Aç', onClick: () => void navigate('/onay') },
          }
        : { variant: 'band', domain: error ? 'warning' : 'dump', title: 'AI', message },
    )
  }, [status, toast, navigate])
}
