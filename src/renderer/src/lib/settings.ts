import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingValueSchemas, type SettingKey, type SettingValue } from '@shared/ipc'

export const settingQueryKey = (key: SettingKey) => ['settings', key] as const

export function useSetting<K extends SettingKey>(key: K) {
  return useQuery({
    queryKey: settingQueryKey(key),
    queryFn: async () =>
      settingValueSchemas[key].parse(
        await window.api.invoke('settings:get', { key }),
      ) as SettingValue<K>,
  })
}

export function useSetSetting<K extends SettingKey>(key: K) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (value: SettingValue<K>) => window.api.invoke('settings:set', { key, value }),
    onSuccess: (_data, value) => client.setQueryData(settingQueryKey(key), value),
  })
}
