import { format } from 'date-fns'
import { tr } from 'date-fns/locale'

// Dokümantasyon şablonları (PROJELER.md > 4. Dokümantasyon). Proje türüne göre sayfa ağacı; Genel türde boş.
// Tablolar GFM markdown; GDD karşılaştırması (5d-2) "İçerik özeti" ve "Ses listesi" tablolarını okur.

export type DocKind = 'page' | 'adr' | 'gdd'
export type ProjectKind = 'unity' | 'software' | 'creative' | 'general'

export type TemplateNode = {
  title: string
  kind: DocKind
  bodyMd: string
  children: TemplateNode[]
}

/** Kararlar (ADR) bu başlıklı kök sayfanın altında toplanır. */
export const DECISIONS_TITLE = 'Kararlar'

const page = (title: string, bodyMd = '', children: TemplateNode[] = []): TemplateNode => ({
  title,
  kind: 'page',
  bodyMd,
  children,
})

function table(headers: string[], rows: string[][] = [headers.map(() => '')]): string {
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n')
}

const decisions = page(
  DECISIONS_TITLE,
  'Projenin teknik ve tasarım kararları. `+ Karar` yeni bir karar kaydı açar.',
)

const GDD: TemplateNode = {
  title: 'Tasarım dokümanı (GDD)',
  kind: 'gdd',
  bodyMd:
    'Oyunun yaşayan tasarım dokümanı. Alt sayfalardaki tablolardaki sayılar klasörle karşılaştırılır.',
  children: [
    page(
      'Oyun özeti',
      [
        'Tek cümlede oyun:',
        '',
        '## İçerik özeti',
        '',
        table(
          ['İçerik', 'Sayı'],
          [
            ['Bölüm', ''],
            ['Düşman tipi', ''],
            ['Müzik parçası', ''],
          ],
        ),
      ].join('\n'),
    ),
    page('Temel döngü'),
    page('Mekanikler', 'Her mekanik için bir alt sayfa aç.'),
    page('Bölümler / Sahneler', table(['Bölüm', 'Sahne', 'Durum'])),
    page('Karakterler'),
    page('Sanat yönü'),
    page('Ses listesi', table(['Parça', 'Sahne', 'Süre', 'Döngü', 'Durum'])),
    page('Arayüz ve menüler'),
    page('Kontroller', table(['Eylem', 'Klavye', 'Gamepad'])),
    page('Teknik notlar'),
    page('Yayın'),
  ],
}

const TECH: TemplateNode = page('Teknik doküman', '', [
  page('Genel bakış'),
  page('Mimari'),
  page('Kurulum'),
  page('Veri modeli'),
])

const CREATIVE: TemplateNode = page('Yaratıcı proje', '', [
  page('Konsept / niyet'),
  page('Parça listesi', table(['Parça', 'Süre', 'Durum'])),
  page('Sözler / metinler'),
  page('Prodüksiyon notları'),
  page('Görsel kimlik'),
])

/** Türün şablon ağacı (kökler, sırayla). Genel türde boş: tek sayfayla başlanır. */
export function docTemplate(kind: ProjectKind): TemplateNode[] {
  if (kind === 'unity') return [GDD, decisions]
  if (kind === 'software') return [TECH, decisions]
  if (kind === 'creative') return [CREATIVE]
  return []
}

/** Yeni karar kaydının (ADR) gövdesi. */
export function adrBody(now: Date): string {
  return [
    `**Tarih:** ${format(now, 'd MMMM yyyy', { locale: tr })}`,
    '',
    '## Bağlam',
    '',
    '## Karar',
    '',
    '## Alternatifler',
    '',
    '## Sonuç',
  ].join('\n')
}

/** Bağlı dosyanın sayfa başlığı: dosya adı, uzantısız, alt çizgi boşluk. */
export function titleFromPath(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path
  return (
    name
      .replace(/\.(md|markdown)$/i, '')
      .replace(/_/g, ' ')
      .trim() || name
  )
}

/** Dosya adı GDD'yi andırıyor mu ("GDD_Runika.md", "tasarim-dokumani.md"). */
export function looksLikeGdd(path: string): boolean {
  const name = (path.split(/[\\/]/).pop() ?? path).toLocaleLowerCase('tr-TR')
  return /(^|[^a-z])gdd([^a-z]|$)|tasar[ıi]m[-_ ]?dok[üu]man/.test(name)
}

const SEP = '\\'

/**
 * Dosya klasörün içindeyse klasöre göre göreli yolu ('/' ayraçlı), değilse null. Windows yolları büyük/küçük
 * harf duyarsız karşılaştırılır; `..` ile dışarı çıkan ya da başka sürücüdeki yol reddedilir.
 */
export function relativeInside(folder: string, file: string): string | null {
  const norm = (p: string) => p.replace(/\//g, SEP).replace(/\\+$/, '')
  const f = norm(folder)
  const p = norm(file)
  if (p.length <= f.length) return null
  if (p.slice(0, f.length).toLocaleLowerCase('en') !== f.toLocaleLowerCase('en')) return null
  if (p[f.length] !== SEP) return null
  const rest = p.slice(f.length + 1)
  if (!rest || rest.split(SEP).some((part) => part === '..' || part === '')) return null
  return rest.split(SEP).join('/')
}
