import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import type { IpcChannel, IpcInput, IpcOutput } from '@shared/ipc'

// Okul sorguları. Hepsi 'school' altında; her yazım okul sorgularını, Bugün'ün yerleşimini
// (dersler ve çalışma blokları bantta) ve hatırlatmaları (ödev) yeniler.

export const schoolKeys = {
  all: ['school'] as const,
  board: ['school', 'board'] as const,
  terms: ['school', 'terms'] as const,
  courses: (termId: string) => ['school', 'courses', termId] as const,
  course: (id: string) => ['school', 'course', id] as const,
  prep: (id: string) => ['school', 'prep', id] as const,
  preview: (id: string) => ['school', 'preview', id] as const,
  gpa: ['school', 'gpa'] as const,
  instructors: ['school', 'instructors'] as const,
  questions: ['school', 'questions'] as const,
}

/** Yazımdan sonra yenilenecekler. */
const AFTER_WRITE: QueryKey[] = [schoolKeys.all, ['task', 'schedule'], ['reminder'], ['note']]

export const useBoard = () =>
  useQuery({ queryKey: schoolKeys.board, queryFn: () => window.api.invoke('school:board', undefined) })

export const useTerms = () =>
  useQuery({ queryKey: schoolKeys.terms, queryFn: () => window.api.invoke('term:list', undefined) })

export const useCourses = (termId: string | undefined) =>
  useQuery({
    queryKey: schoolKeys.courses(termId ?? ''),
    queryFn: () => window.api.invoke('course:list', { termId: termId! }),
    enabled: !!termId,
  })

export const useCourse = (id: string | undefined) =>
  useQuery({
    queryKey: schoolKeys.course(id ?? ''),
    queryFn: () => window.api.invoke('course:get', { id: id! }),
    enabled: !!id,
  })

export const useExamPrep = (id: string | undefined) =>
  useQuery({
    queryKey: schoolKeys.prep(id ?? ''),
    queryFn: () => window.api.invoke('exam:prep', { id: id! }),
    enabled: !!id,
  })

export const usePlanPreview = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: schoolKeys.preview(id),
    queryFn: () => window.api.invoke('exam:planPreview', { id }),
    enabled,
  })

export const useGpa = () =>
  useQuery({ queryKey: schoolKeys.gpa, queryFn: () => window.api.invoke('gpa:overview', undefined) })

export const useInstructors = () =>
  useQuery({
    queryKey: schoolKeys.instructors,
    queryFn: () => window.api.invoke('instructor:list', undefined),
  })

export const useAttendanceQuestions = () =>
  useQuery({
    queryKey: schoolKeys.questions,
    queryFn: () => window.api.invoke('attendance:questions', undefined),
    // Ders bitince soru kendiliğinden çıksın.
    refetchInterval: 60_000,
  })

/** Herhangi bir okul kanalı için yazım; bitince okul ve Bugün sorguları yenilenir. */
export function useSchoolWrite<C extends IpcChannel>(channel: C) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: IpcInput<C>): Promise<IpcOutput<C>> => window.api.invoke(channel, input),
    onSettled: () =>
      Promise.all(AFTER_WRITE.map((queryKey) => client.invalidateQueries({ queryKey }))),
  })
}
