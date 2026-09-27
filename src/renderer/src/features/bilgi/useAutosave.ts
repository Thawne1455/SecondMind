import { useCallback, useEffect, useRef, useState } from 'react'
import { useInvalidateKnowledge } from './useKnowledge'

export const AUTOSAVE_DELAY_MS = 800

type Patch = { title?: string; bodyMd?: string }
export type SaveStatus = 'saved' | 'pending' | 'error'

/**
 * Başlık ve gövde için debounce'lu otomatik kayıt. Son değişiklikten 800 ms sonra yazar;
 * not değişince / bileşen kapanınca bekleyen değişiklik hemen yazılır.
 */
export function useAutosave(noteId: string) {
  const invalidate = useInvalidateKnowledge()
  const pending = useRef<Patch>({})
  const timer = useRef<number | undefined>(undefined)
  const [status, setStatus] = useState<SaveStatus>('saved')

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    const patch = pending.current
    if (patch.title === undefined && patch.bodyMd === undefined) return
    pending.current = {}
    try {
      await window.api.invoke('note:update', { id: noteId, ...patch })
      const more = pending.current.title !== undefined || pending.current.bodyMd !== undefined
      setStatus(more ? 'pending' : 'saved')
      void invalidate()
    } catch {
      // Yazılamayan değişiklik bir sonraki denemeye kalır; yeni yazılanlar üstüne gelir.
      pending.current = { ...patch, ...pending.current }
      setStatus('error')
    }
  }, [noteId, invalidate])

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
