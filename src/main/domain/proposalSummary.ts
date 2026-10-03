// Önerinin tek satırlık özeti (Döküm > İşlenenler, ileride Onay Kutusu): başlık varsa başlık, yoksa metnin ilk dolu
// satırı. Yük `payload_json`'dan gelir; bozuksa boş döner, liste düşmez.

const MAX = 120

function firstLine(text: string): string {
  const line =
    text
      .split('\n')
      .map((l) => l.replace(/^[#>*\-\s]+/, '').trim())
      .find(Boolean) ?? ''
  return line.length > MAX ? `${line.slice(0, MAX - 1)}…` : line
}

export function proposalSummary(payloadJson: string): string {
  let payload: unknown
  try {
    payload = JSON.parse(payloadJson)
  } catch {
    return ''
  }
  if (!payload || typeof payload !== 'object') return ''
  const p = payload as Record<string, unknown>
  for (const key of ['title', 'text', 'appendMd'] as const) {
    const value = p[key]
    if (typeof value === 'string' && value.trim()) return firstLine(value)
  }
  return ''
}
