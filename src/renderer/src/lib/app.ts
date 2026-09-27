import { useQuery } from '@tanstack/react-query'

export function useAppInfo() {
  return useQuery({
    queryKey: ['app', 'info'],
    queryFn: () => window.api.invoke('app:info', undefined),
    staleTime: Infinity,
  })
}
