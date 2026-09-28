import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import type {
  ReminderCreateInput,
  ReminderResolveInput,
  ReminderUpdateInput,
  RoutineCreateInput,
  RoutineUpdateInput,
  TaskCreateInput,
  TaskStatus,
  TaskUpdateInput,
} from '@shared/ipc'

// Görev, hatırlatma ve rutin sorguları. Bugün, komut paleti ve Ayarlar > Rutinler kullanır.

export const planningKeys = {
  tasks: ['task'] as const,
  taskList: (status: TaskStatus) => ['task', 'list', status] as const,
  reminders: ['reminder'] as const,
  routines: ['routine'] as const,
}

export const useTasks = (status: TaskStatus) =>
  useQuery({
    queryKey: planningKeys.taskList(status),
    queryFn: () => window.api.invoke('task:list', { status }),
  })

export const useReminders = () =>
  useQuery({
    queryKey: planningKeys.reminders,
    queryFn: () => window.api.invoke('reminder:list', undefined),
  })

export const useRoutines = () =>
  useQuery({
    queryKey: planningKeys.routines,
    queryFn: () => window.api.invoke('routine:list', undefined),
  })

function useInvalidating<I, O>(keys: QueryKey[], fn: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))),
  })
}

const T = [planningKeys.tasks]
const R = [planningKeys.reminders]
const RT = [planningKeys.routines]

export const useCreateTask = () =>
  useInvalidating(T, (input: TaskCreateInput) => window.api.invoke('task:create', input))
export const useUpdateTask = () =>
  useInvalidating(T, (input: TaskUpdateInput) => window.api.invoke('task:update', input))
export const useSetTaskDone = () =>
  useInvalidating(T, (input: { id: string; done: boolean }) =>
    window.api.invoke('task:setDone', input),
  )
export const useDeleteTask = () =>
  useInvalidating(T, (id: string) => window.api.invoke('task:delete', { id }))
export const useRestoreTask = () =>
  useInvalidating(T, (id: string) => window.api.invoke('task:restore', { id }))

export const useCreateReminder = () =>
  useInvalidating(R, (input: ReminderCreateInput) => window.api.invoke('reminder:create', input))
export const useUpdateReminder = () =>
  useInvalidating(R, (input: ReminderUpdateInput) => window.api.invoke('reminder:update', input))
export const useDeleteReminder = () =>
  useInvalidating(R, (id: string) => window.api.invoke('reminder:delete', { id }))
export const useRestoreReminder = () =>
  useInvalidating(R, (id: string) => window.api.invoke('reminder:restore', { id }))
/** Kaçırılanları ele alır; 'today' görev de oluşturduğu için görevler de yenilenir. */
export const useResolveMissed = () =>
  useInvalidating([...R, ...T], (input: ReminderResolveInput) =>
    window.api.invoke('reminder:resolveMissed', input),
  )

export const useCreateRoutine = () =>
  useInvalidating(RT, (input: RoutineCreateInput) => window.api.invoke('routine:create', input))
export const useUpdateRoutine = () =>
  useInvalidating(RT, (input: RoutineUpdateInput) => window.api.invoke('routine:update', input))
export const useDeleteRoutine = () =>
  useInvalidating(RT, (id: string) => window.api.invoke('routine:delete', { id }))
export const useRestoreRoutine = () =>
  useInvalidating(RT, (id: string) => window.api.invoke('routine:restore', { id }))
