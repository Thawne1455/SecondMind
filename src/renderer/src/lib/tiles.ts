// Bugün karoları 3 × 2. İçeriği olmayan karo gizlenir, yerini diğerleri doldurur (EKRANLAR.md):
// 6 sütunlu ızgarada her karonun kaç sütun kaplayacağı. Karolar satırlara olabildiğince eşit dağılır.

export function tileSpans(count: number): number[] {
  const rows = Math.ceil(count / 3)
  const spans: number[] = []
  for (let row = 0; row < rows; row++) {
    const inRow = Math.ceil((count - spans.length) / (rows - row))
    for (let i = 0; i < inRow; i++) spans.push(6 / inRow)
  }
  return spans
}
