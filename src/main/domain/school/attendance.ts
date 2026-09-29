// Devamsızlık (OKUL.md "Devamsızlık"). Birim "ders saati": bir oturum süresinin saate yuvarlanmışı
// (en az 1). 09:00–10:50 = 2 ders saati. Sınır yüzde (dönemin toplam ders saatinin %'si, aşağı yuvarlanır)
// ya da doğrudan ders saati.

export type AttendanceLimit = { kind: 'percent' | 'hours'; value: number }

export type AttendanceMark = 'present' | 'absent' | 'cancelled'

export type AttendanceSession = { durationMin: number; status: AttendanceMark | null }

export type AttendanceState = 'none' | 'ok' | 'warn' | 'over'

export type AttendanceStatus = {
  /** Katılmadığı ders saati. */
  used: number
  /** Sınır (ders saati); sınır yoksa null. */
  limit: number | null
  /** Kalan hak; sınır yoksa null. Aşıldıysa negatif. */
  remaining: number | null
  state: AttendanceState
  /** Dönemin toplam ders saati (iptaller hariç). */
  total: number
}

/** Sınıra bu kadar ders saati (ya da daha az) kalınca amber. */
export const ATTENDANCE_WARN_AT = 2

export const sessionHours = (durationMin: number) => Math.max(1, Math.round(durationMin / 60))

/**
 * @param sessions dönemin bütün oturumları (geleceği de; yüzde sınırı toplamdan hesaplanır). İşaretsizler
 *   katıldı sayılmaz ama devamsızlığa da yazılmaz.
 */
export function attendanceStatus(
  sessions: readonly AttendanceSession[],
  limit: AttendanceLimit | null,
): AttendanceStatus {
  let used = 0
  let total = 0
  for (const s of sessions) {
    if (s.status === 'cancelled') continue
    const h = sessionHours(s.durationMin)
    total += h
    if (s.status === 'absent') used += h
  }
  if (!limit || limit.value <= 0) return { used, limit: null, remaining: null, state: 'none', total }
  const max = limit.kind === 'hours' ? Math.floor(limit.value) : Math.floor((total * limit.value) / 100)
  const remaining = max - used
  const state: AttendanceState = remaining < 0 ? 'over' : remaining <= ATTENDANCE_WARN_AT ? 'warn' : 'ok'
  return { used, limit: max, remaining, state, total }
}
