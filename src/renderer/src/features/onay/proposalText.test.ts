import { describe, expect, it } from 'vitest'
import type { Operation } from '@shared/schemas/ai'
import { fromForm, toForm, validateEdit } from './editForm'
import { dayText, groupHeading, proposalLine } from './proposalText'

// Cumartesi 3 Ekim 2026, 14:00.
const now = new Date(2026, 9, 3, 14, 0)

describe('dayText', () => {
  it('yakın günleri adıyla, diğerlerini gün adı + tarihle yazar', () => {
    expect(dayText(new Date(2026, 9, 3), now)).toBe('Bugün')
    expect(dayText(new Date(2026, 9, 4), now)).toBe('Yarın')
    expect(dayText(new Date(2026, 9, 9), now)).toBe('Cuma 9 Eki')
    expect(dayText(new Date(2027, 0, 4), now)).toBe('Pazartesi 4 Oca 2027')
  })
})

describe('proposalLine', () => {
  it('görev: tarih, süre ve proje türü', () => {
    const op: Operation = {
      op: 'create_task',
      sourceDumpIds: [],
      title: 'Menü müziğini kırp',
      dueDate: '2026-10-09',
      estimateMin: 30,
      kind: 'bug',
    }
    expect(proposalLine(op, now)).toEqual({
      title: 'Menü müziğini kırp',
      meta: ['Cuma 9 Eki', '30 dk', 'Hata'],
    })
  })

  it('hatırlatma ve sınav zamanı', () => {
    expect(
      proposalLine(
        { op: 'create_reminder', sourceDumpIds: [], title: 'Mail', at: '2026-10-04T09:00' },
        now,
      ).meta,
    ).toEqual(['Yarın 09:00'])
    expect(
      proposalLine(
        {
          op: 'create_exam',
          sourceDumpIds: [],
          courseId: 'c',
          title: 'Vize',
          date: '2026-11-02',
          time: '10:30',
          weekFrom: 1,
          weekTo: 7,
        },
        now,
      ).meta,
    ).toEqual(['Pazartesi 2 Kas 10:30', '1–7. haftalar'])
  })
})

describe('groupHeading', () => {
  it('kaynak, gün ve saat, öneri sayısı', () => {
    const proposals = [{}, {}, {}, {}] as never
    expect(
      groupHeading(
        { kind: 'dump', startedAt: new Date(2026, 9, 3, 10, 12).getTime(), proposals },
        now,
      ),
    ).toBe("Döküm'den · bugün 10:12 · 4 öneri")
    expect(
      groupHeading(
        { kind: 'dump', startedAt: new Date(2026, 8, 28, 9, 5).getTime(), proposals },
        now,
      ),
    ).toBe("Döküm'den · 28 Eyl 09:05 · 4 öneri")
  })
})

describe('Düzenle formu', () => {
  const task: Operation = {
    op: 'create_task',
    sourceDumpIds: ['d1'],
    title: 'A',
    context: { projectId: 'p1' },
    dueDate: null,
    estimateMin: 30,
    kind: 'bug',
  }

  it('yük forma ve geri çevrilir', () => {
    const form = toForm(task)
    expect(form).toEqual({
      title: 'A',
      context: 'p:p1',
      kind: 'bug',
      dueDate: '',
      estimateMin: '30',
    })
    expect(fromForm('create_task', { ...form, title: ' B ', estimateMin: '' })).toEqual({
      title: 'B',
      context: { projectId: 'p1' },
      kind: 'bug',
      dueDate: null,
      estimateMin: null,
    })
  })

  it('genel görevde tür düşer; ders bağlamı', () => {
    expect(fromForm('create_task', { ...toForm(task), context: '' })).toMatchObject({
      context: null,
      kind: null,
    })
    expect(fromForm('create_task', { ...toForm(task), context: 'c:k1' })).toMatchObject({
      context: { courseId: 'k1' },
    })
  })

  it('doğrulama hatasını alana bağlar', () => {
    expect(validateEdit(task, fromForm('create_task', { ...toForm(task), title: '' }))).toEqual({
      ok: false,
      errors: { title: 'Boş olamaz' },
    })
    expect(
      validateEdit(task, fromForm('create_task', { ...toForm(task), estimateMin: '2' })),
    ).toMatchObject({
      ok: false,
      errors: { estimateMin: 'Geçersiz değer' },
    })
    expect(validateEdit(task, fromForm('create_task', toForm(task)))).toEqual({ ok: true })
  })
})
