import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Checkin, CheckinSetInput } from '@shared/ipc'

// Günlük kayıt ve haftanın başarıları (Aşama 3c). Bugün'deki Nasılsın? ve başarılar karoları kullanır.

export const mindKeys = {
  checkin: ['checkin', 'today'] as const,
  /** 'task' altında: görev tamamlanınca / geri açılınca sayılar da yenilenir. */
  week: ['task', 'achievement', 'week'] as const,
}

export const useTodayCheckin = () =>
  useQuery({
    queryKey: mindKeys.checkin,
    queryFn: () => window.api.invoke('checkin:today', undefined),
  })

/** Karodaki seçim hemen görünür; sunucu cevabı önbelleği düzeltir. */
export function useSetCheckin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: CheckinSetInput) => window.api.invoke('checkin:set', input),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: mindKeys.checkin })
      const previous = client.getQueryData<Checkin | null>(mindKeys.checkin)
      client.setQueryData<Checkin | null>(mindKeys.checkin, (c) => ({
        day: c?.day ?? '',
        mood: c?.mood ?? null,
        energy: c?.energy ?? null,
        sleepMin: c?.sleepMin ?? null,
        note: c?.note ?? '',
        ...input,
      }))
      return { previous }
    },
    onError: (_e, _input, ctx) => client.setQueryData(mindKeys.checkin, ctx?.previous ?? null),
    onSuccess: (checkin) => client.setQueryData(mindKeys.checkin, checkin),
  })
}

export const useWeekAchievements = () =>
  useQuery({
    queryKey: mindKeys.week,
    queryFn: () => window.api.invoke('achievement:week', undefined),
  })
