import type { DumpResult } from '@shared/ipc'

// AI önerilerinin arayüz metinleri (Döküm > İşlenenler, Onay Kutusu).

export const OP_LABEL: Record<string, string> = {
  create_task: 'Görev',
  create_note: 'Not',
  append_to_note: 'Nota ekleme',
  create_reminder: 'Hatırlatma',
  create_idea: 'Fikir',
  create_exam: 'Sınav',
  set_project_next_step: 'Sıradaki adım',
  add_instructor_note: 'Hoca notu',
}

export const opLabel = (op: string): string => OP_LABEL[op] ?? op

export function resultStatusText(r: Pick<DumpResult, 'status' | 'undone'>): string {
  if (r.undone) return 'Geri alındı'
  switch (r.status) {
    case 'pending':
      return 'Onay bekliyor'
    case 'approved':
      return 'Onaylandı'
    case 'edited':
      return 'Düzenlenip onaylandı'
    case 'rejected':
      return 'Reddedildi'
  }
}

export const modelLabel = (model: 'fast' | 'deep'): string => (model === 'fast' ? 'Hızlı' : 'Derin')

/** "İşleniyor 3/5" (üst çubuk butonu, Döküm şeridi). */
export function progressLabel(run: { done: number; total: number } | null | undefined): string {
  return run ? `İşleniyor ${run.done}/${run.total}` : 'Başlıyor…'
}
