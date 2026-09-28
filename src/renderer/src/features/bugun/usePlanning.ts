import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import type {
  ReminderCreateInput,
  ReminderResolveInput,
  ReminderUpdateInput,
  RoutineCreateInput,
  RoutineUpdateInput,
  ScheduleDay,
  Task,
  TaskCreateInput,
  TaskSplitInput,
  TaskStatus,
  TaskUpdateInput,
} from '@shared/ipc'
import { useToast } from '../../ui'

// Görev, hatırlatma, rutin ve günün yerleşimi sorguları. Bugün, komut paleti ve Ayarlar > Rutinler kullanır.

export const planningKeys = {
  tasks: ['task'] as const,
  taskList: (status: TaskStatus) => ['task', 'list', status] as const,
  /** 'task' altında: her görev değişikliği yerleşimi de yeniler (okuma yeni görevi yerleştirir). */
  schedule: ['task', 'schedule'] as const,
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
const RT = [planningKeys.routines, planningKeys.schedule]

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
export const useSplitTask = () =>
  useInvalidating(T, (input: TaskSplitInput) => window.api.invoke('task:split', input))

/** Tamamla / geri aç; tamamlanınca "Geri al" toast'u. */
export function useToggleDone() {
  const setDone = useSetTaskDone()
  const { toast } = useToast()
  return (task: Pick<Task, 'id' | 'title' | 'status'>) => {
    const done = task.status !== 'done'
    setDone.mutate(
      { id: task.id, done },
      {
        onSuccess: () => {
          if (!done) return
          toast({
            variant: 'fill',
            domain: 'projects',
            message: `Bitti: ${task.title}`,
            action: {
              label: 'Geri al',
              onClick: () => setDone.mutate({ id: task.id, done: false }),
            },
          })
        },
      },
    )
  }
}

// ---------------------------------------------------------------- günün yerleşimi

/**
 * Bugünün yerleşimi. Dakikada bir yenilenir: okuma ana süreçte gün sonu kaydırmasını ve yeni görevlerin
 * yerleşmesini de yapar (gece yarısını açık geçiren uygulama da ertesi güne geçer).
 */
export function useSchedule() {
  const client = useQueryClient()
  return useQuery({
    queryKey: planningKeys.schedule,
    queryFn: async () => {
      const day = await window.api.invoke('schedule:today', undefined)
      if (day.rolledOver) void client.invalidateQueries({ queryKey: ['task', 'list'] })
      return day
    },
    refetchInterval: 60_000,
  })
}

/** Yerleşimi değiştiren işlemler yeni günü döner; önbelleğe hemen yazılır, görevler de yenilenir. */
function useScheduleMutation<I>(
  fn: (input: I) => Promise<ScheduleDay>,
  optimistic?: (day: ScheduleDay, input: I) => ScheduleDay,
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onMutate: async (input: I) => {
      if (!optimistic) return
      await client.cancelQueries({ queryKey: planningKeys.schedule })
      client.setQueryData<ScheduleDay>(planningKeys.schedule, (day) =>
        day ? optimistic(day, input) : day,
      )
    },
    onSuccess: (day) => client.setQueryData(planningKeys.schedule, day),
    onError: () => client.invalidateQueries({ queryKey: planningKeys.schedule }),
    onSettled: () => client.invalidateQueries({ queryKey: ['task', 'list'] }),
  })
}

export const useReschedule = () =>
  useScheduleMutation(() => window.api.invoke('schedule:reschedule', undefined))

/** Sürükle-bırak: blok bırakıldığı yerde hemen görünür (sunucu 5 dk'ya oturtup düzeltir). */
export const useMoveBlock = () =>
  useScheduleMutation(
    (input: { id: string; start: number }) => window.api.invoke('schedule:move', input),
    (day, { id, start }) => ({
      ...day,
      blocks: day.blocks.map((b) =>
        b.id === id ? { ...b, start, end: start + (b.end - b.start), pinned: true } : b,
      ),
    }),
  )

export const useUnpinBlock = () =>
  useScheduleMutation((id: string) => window.api.invoke('schedule:unpin', { id }))

export const useStartTask = () =>
  useScheduleMutation((taskId: string) => window.api.invoke('schedule:start', { taskId }))

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
