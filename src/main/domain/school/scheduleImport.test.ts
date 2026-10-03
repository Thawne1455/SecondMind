import { describe, expect, it } from 'vitest'
import { COURSE_TONES } from './term'
import {
  courseChanges,
  defaultRoom,
  importSlots,
  instructorKey,
  matchInstructor,
  movedSlots,
  sameTimes,
  matchCourse,
  normalizeCode,
  normalizeName,
  previewTones,
  resolveTerm,
  sameSlots,
  slotsText,
  type ImportCourseRef,
} from './scheduleImport'

const terms = [
  { id: 't1', name: '2025-2026 Bahar', active: false },
  { id: 't2', name: '2026-2027 Güz', active: true },
]

const course = (over: Partial<ImportCourseRef> = {}): ImportCourseRef => ({
  id: 'c1',
  name: 'Veri Yapıları',
  code: 'BLM 201',
  credit: 6,
  tone: '#7CC4FF',
  instructorName: 'Dr. Ayşe Kaya',
  slots: [{ id: 's1', weekday: 1, startMin: 540, endMin: 650, room: 'D-201' }],
  ...over,
})

describe('normalize', () => {
  it('ad: Türkçe büyük/küçük harf ve boşluk farkı yok', () => {
    expect(normalizeName('  VERİ   YAPILARI ')).toBe(normalizeName('veri yapıları'))
    expect(normalizeName('İstatistik')).toBe('istatistik')
  })
  it('kod: boşluk, tire, nokta yok sayılır', () => {
    expect(normalizeCode('blm-201')).toBe(normalizeCode('BLM 201'))
  })
})

describe('resolveTerm', () => {
  it('aynı adlı dönem varsa o (arşivdeki de)', () => {
    expect(resolveTerm('2026-2027 GÜZ', terms)).toEqual({ kind: 'existing', termId: 't2' })
    expect(resolveTerm('2025-2026 bahar', terms)).toEqual({ kind: 'existing', termId: 't1' })
  })
  it('bilinmeyen ad yeni dönem', () => {
    expect(resolveTerm('2026-2027 Bahar', terms)).toEqual({ kind: 'new' })
  })
  it('ad yoksa aktif dönem, o da yoksa hiçbiri', () => {
    expect(resolveTerm(null, terms)).toEqual({ kind: 'existing', termId: 't2' })
    expect(resolveTerm('  ', terms)).toEqual({ kind: 'existing', termId: 't2' })
    expect(resolveTerm(null, [terms[0]!])).toEqual({ kind: 'none' })
  })
})

describe('matchCourse', () => {
  const list = [course(), course({ id: 'c2', name: 'Lineer Cebir', code: '' })]
  it('önce kod', () => {
    expect(matchCourse({ name: 'Data Structures', code: 'blm201' }, list)?.id).toBe('c1')
  })
  it('kod tutmazsa ad', () => {
    expect(matchCourse({ name: 'LİNEER CEBİR', code: 'MAT 101' }, list)?.id).toBe('c2')
  })
  it('kodsuz derste koda bakılmaz; eşleşme yoksa null', () => {
    expect(matchCourse({ name: 'Fizik', code: '' }, list)).toBeNull()
  })
})

describe('importSlots', () => {
  it('sıralar, aynı gün/başlangıcı teke indirir, mevcut saatin kimliğini korur', () => {
    const out = importSlots(
      [
        { weekday: 3, start: '13:00', end: '14:50', room: null },
        { weekday: 1, start: '09:00', end: '10:50', room: ' D-201 ' },
        { weekday: 1, start: '09:00', end: '10:50', room: 'D-201' },
      ],
      course().slots,
    )
    expect(out).toEqual([
      { id: 's1', weekday: 1, startMin: 540, endMin: 650, room: 'D-201' },
      { weekday: 3, startMin: 780, endMin: 890, room: '' },
    ])
  })
})

describe('courseChanges', () => {
  it('aynı program değişiklik değil', () => {
    expect(
      courseChanges(
        {
          name: 'veri yapıları',
          code: 'BLM201',
          instructor: 'dr. ayşe kaya',
          slots: [{ weekday: 1, start: '09:00', end: '10:50', room: 'd-201' }],
        },
        course(),
      ),
    ).toEqual([])
  })
  it('boş gelen alan korunur, saat ve hoca değişikliği listelenir', () => {
    const changes = courseChanges(
      {
        name: 'Veri Yapıları',
        code: null,
        instructor: 'Prof. Dr. Mehmet Demir',
        slots: [{ weekday: 2, start: '10:00', end: '11:50', room: 'D-201' }],
      },
      course(),
    )
    expect(changes).toEqual([
      { label: 'Hoca', before: 'Dr. Ayşe Kaya', after: 'Prof. Dr. Mehmet Demir' },
      { label: 'Saat', before: 'Pzt 09:00-10:50 D-201', after: 'Sal 10:00-11:50 D-201' },
    ])
  })
  it('boş saat listesi saat değişikliği sayılmaz', () => {
    expect(courseChanges({ name: 'Veri Yapıları', slots: [] }, course())).toEqual([])
  })
  it('hocası olmayan derse hoca: önce "—"', () => {
    expect(
      courseChanges(
        { name: 'Veri Yapıları', instructor: 'X', slots: [] },
        course({ instructorName: null }),
      ),
    ).toEqual([{ label: 'Hoca', before: '—', after: 'X' }])
  })
})

describe('yardımcılar', () => {
  it('slotsText gün sırasıyla; boşsa —', () => {
    expect(
      slotsText([
        { weekday: 3, startMin: 780, endMin: 890, room: '' },
        { weekday: 1, startMin: 540, endMin: 650, room: 'D-201' },
      ]),
    ).toBe('Pzt 09:00-10:50 D-201, Çar 13:00-14:50')
    expect(slotsText([])).toBe('—')
  })
  it('sameSlots sıradan bağımsız', () => {
    const a = { weekday: 1, startMin: 540, endMin: 650, room: 'A' }
    const b = { weekday: 2, startMin: 540, endMin: 650, room: 'B' }
    expect(sameSlots([a, b], [b, a])).toBe(true)
    expect(sameSlots([a], [a, b])).toBe(false)
  })
  it('previewTones: eşleşen kendi tonu, yeniler kullanılmayan tonlar', () => {
    const existing = [course({ tone: COURSE_TONES[0] })]
    expect(previewTones([existing[0]!, null, null], existing)).toEqual([
      COURSE_TONES[0],
      COURSE_TONES[1],
      COURSE_TONES[2],
    ])
  })
  it('defaultRoom: hepsi aynı derslikse o', () => {
    const s = (room: string) => ({ weekday: 1, startMin: 0, endMin: 60, room })
    expect(defaultRoom([s('D-201'), s('D-201')])).toBe('D-201')
    expect(defaultRoom([s('D-201'), s('B-105')])).toBe('')
    expect(defaultRoom([])).toBe('')
  })
})

describe('hoca', () => {
  it('unvan yok sayılır', () => {
    expect(instructorKey('Dr. Öğr. Üyesi Ayşe Kaya')).toBe('ayşe kaya')
    expect(instructorKey('Prof.Dr. MEHMET DEMİR')).toBe('mehmet demir')
    expect(instructorKey('Öğr. Gör. Sarah Miller')).toBe('sarah miller')
    expect(instructorKey('Drake Bell')).toBe('drake bell')
  })
  it('kayıtlı hocayı bulur; değişiklik sayılmaz', () => {
    const list = [{ name: 'Ayşe Kaya' }, { name: 'Mehmet Demir' }]
    expect(matchInstructor('Doç. Dr. Mehmet Demir', list)).toBe(list[1])
    expect(matchInstructor('Hasan Yıldız', list)).toBeNull()
    expect(
      courseChanges(
        { name: 'Veri Yapıları', instructor: 'Dr. Öğr. Üyesi Ayşe Kaya', slots: [] },
        course({ instructorName: 'Ayşe Kaya' }),
      ),
    ).toEqual([])
  })
})

describe('derslik ve kayan saat', () => {
  const at = (weekday: number, startMin: number, room = '') => ({
    weekday,
    startMin,
    endMin: startMin + 110,
    room,
  })
  it('movedSlots: yeni programda aynı gün/saati olmayan eski saatler', () => {
    expect(movedSlots([at(1, 540, 'A'), at(3, 780)], [at(1, 540, 'B')])).toEqual([at(3, 780)])
  })
  it('sameTimes derslik farkını yok sayar', () => {
    expect(sameTimes([at(1, 540, 'A')], [at(1, 540, 'B')])).toBe(true)
    expect(sameSlots([at(1, 540, 'A')], [at(1, 540, 'B')])).toBe(false)
  })
  it('sadece derslik değişince "Derslik"', () => {
    expect(
      courseChanges(
        {
          name: 'Veri Yapıları',
          slots: [{ weekday: 1, start: '09:00', end: '10:50', room: 'D-105' }],
        },
        course(),
      ),
    ).toEqual([{ label: 'Derslik', before: 'D-201', after: 'D-105' }])
  })
})
