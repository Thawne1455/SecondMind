import { useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Moon, Plus, Sparkles, Sun, X } from 'lucide-react'
import { useSetSetting, useSetting } from '../../lib/settings'
import {
  Badge,
  Button,
  Chip,
  DOMAIN_FILL,
  DropZone,
  DropZoneView,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Menu,
  MenuList,
  Modal,
  ModalPanel,
  Scale,
  SectionHeader,
  Select,
  Skeleton,
  StatusBadge,
  Tag,
  Textarea,
  Tile,
  ToastCard,
  useToast,
  type ButtonVariant,
  type Domain,
  type ScaleValue,
} from '../../ui'

// Geliştirme sayfası: tüm ui/ bileşenleri, design/referans/tasarim-sistemi.png ile aynı sırada.

const CAP = 'text-[13px] leading-[1.35] font-semibold text-ink3'

function Cap({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`${CAP} ${className ?? ''}`}>{children}</span>
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title={title} description={description} />
      {children}
    </section>
  )
}

function Later({
  title,
  description,
  stage,
}: {
  title: string
  description: string
  stage: string
}) {
  return (
    <Section title={title} description={description}>
      <div className="flex h-24 items-center justify-center rounded-tile border-2 border-dashed border-line">
        <Cap>{stage}</Cap>
      </div>
    </Section>
  )
}

function Header() {
  const theme = useSetting('theme')
  const setTheme = useSetSetting('theme')
  const dark = theme.data === 'dark'

  return (
    <header className="flex flex-col gap-[18px]">
      <div className="flex items-center gap-3.5">
        <span className="x flex size-14 items-center justify-center rounded-[18px] bg-indigo text-[26px] font-black text-white">
          S
        </span>
        <span className="cx grow text-[15px]">
          SecondMind · v0.2 · {format(new Date(), 'd MMMM yyyy', { locale: tr })}
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon={dark ? Sun : Moon}
          loading={setTheme.isPending}
          onClick={() => setTheme.mutate(dark ? 'light' : 'dark')}
        >
          {dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
        </Button>
      </div>
      <h1 className="x m-0 text-[112px] leading-[.88] font-black uppercase">
        Tasarım
        <br />
        sistemi
      </h1>
      <div className="flex items-end gap-10">
        <p className="m-0 max-w-[640px] text-[18px] leading-[1.5] text-ink2">
          Poster yönü: beyaz zemin, siyah akış bandı, büyük ve geniş başlıklar, düz renk karolar.
          Her karo tek bir soruya cevap verir; renk o sorunun alanını söyler. Gölge yok, derinliği
          renk ve boyut verir.
        </p>
        <span className="grow" />
        <div className="flex gap-2">
          <Tag className="h-[34px]">Archivo 62–125 genişlik</Tag>
          <Tag className="h-[34px]">Lucide 1.75</Tag>
        </div>
      </div>
    </header>
  )
}

const DOMAINS: Array<{ domain: Domain; area: string; name: string; note: ReactNode }> = [
  { domain: 'today', area: 'Bugün', name: 'indigo', note: '#3D3DF5 · beyaz metin AA' },
  { domain: 'dump', area: 'Döküm', name: 'amber', note: '#FFB21E · metin AAA' },
  { domain: 'projects', area: 'Projeler', name: 'yeşil', note: '#3BE08F · metin AAA' },
  { domain: 'school', area: 'Okul', name: 'gök', note: '#7CC4FF · metin AAA' },
  {
    domain: 'mind',
    area: 'Zihin',
    name: 'leylak',
    note: (
      <>
        #DAD5FF · metin AAA
        <br />
        koyu ton #BDB3FF
      </>
    ),
  },
  { domain: 'knowledge', area: 'Bilgi', name: 'turkuaz', note: '#5FE3D0 · metin AAA' },
  { domain: 'warning', area: 'Uyarı', name: 'mercan', note: '#D93A26 · beyaz metin AA' },
]

// Nötrler iki temada yan yana gösterilir; bu yüzden token yerine sabit değerler.
const NEUTRALS = {
  light: [
    ['bg', '#FFFFFF'],
    ['s2', '#F4F4F7'],
    ['s3', '#EAEAF0'],
    ['line', '#E3E3EA'],
    ['ink3', '#5F5F6B'],
    ['ink2', '#4A4A55'],
    ['ink', '#131316'],
    ['band', '#131316'],
  ],
  dark: [
    ['bg', '#0F0F13'],
    ['s2', '#1A1A21'],
    ['s3', '#24242D'],
    ['line', '#2A2A33'],
    ['ink3', '#9C9CAA'],
    ['ink2', '#B5B5C2'],
    ['ink', '#F2F2F5'],
    ['band', '#1D1D25'],
  ],
} as const

function NeutralPanel({ mode }: { mode: 'light' | 'dark' }) {
  const dark = mode === 'dark'
  return (
    <div
      className={
        dark
          ? 'flex flex-col gap-3.5 rounded-tile bg-[#0F0F13] p-5 text-[#F2F2F5]'
          : 'flex flex-col gap-3.5 rounded-tile border-2 border-[#E3E3EA] bg-white p-5 text-[#131316]'
      }
    >
      <span className="cx">Nötr · {dark ? 'koyu' : 'açık'}</span>
      <div className="grid grid-cols-8 gap-2.5">
        {NEUTRALS[mode].map(([name, hex]) => (
          <div key={name} className="flex flex-col gap-1.5">
            <div
              className="h-[52px] rounded-[14px]"
              style={{
                background: hex,
                border: name === 'bg' ? `2px solid ${dark ? '#2A2A33' : '#E3E3EA'}` : undefined,
                boxShadow: name === 'band' ? 'inset 0 0 0 3px #FFB21E' : undefined,
              }}
            />
            <span className={CAP} style={{ color: dark ? '#9C9CAA' : '#5F5F6B' }}>
              {name}
              <br />
              {hex}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Colors() {
  return (
    <Section
      title="Renk"
      description="Dolgu renkleri iki temada da aynı; üstündeki metin hep #131316 (mercan ve indigo hariç: beyaz)."
    >
      <div className="grid grid-cols-7 gap-3.5">
        {DOMAINS.map((d) => (
          <div
            key={d.domain}
            className={`flex h-[190px] flex-col gap-2 rounded-tile px-5 py-[18px] ${DOMAIN_FILL[d.domain]}`}
          >
            <span className="cx">{d.area}</span>
            <span className="grow" />
            <span className="x text-[22px] font-black">{d.name}</span>
            <span className="text-[13px] font-semibold">{d.note}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <NeutralPanel mode="light" />
        <NeutralPanel mode="dark" />
      </div>
      <div className={`${CAP} flex items-center gap-5`}>
        <span className="font-extrabold text-ink">Proje renkleri</span>
        {[
          ['bg-green', 'Runika'],
          ['bg-orange', 'SecondMind #FF8A3D'],
          ['bg-pink', 'Albüm #F59BE6'],
        ].map(([bg, name]) => (
          <span key={name} className="flex items-center gap-1.5">
            <span className={`size-3 rounded ${bg}`} />
            {name}
          </span>
        ))}
        <span>Koyu temada indigo #5454FF olur, geri kalan dolgular aynı kalır.</span>
      </div>
    </Section>
  )
}

const TYPE_ROWS: Array<[string, ReactNode, string]> = [
  ['x text-[64px] leading-[.95] font-black uppercase', 'Müziği kırp', 'Poster · 64/900 · wdth 125'],
  ['x text-[56px] leading-none font-black', '12 · 16 · 1:20', 'Büyük sayı · 56/900 · tabular'],
  ['x text-[28px] font-black uppercase', 'Pazar 27 Eylül', 'Sayfa başlığı · 28/900'],
  [
    'text-[20px] leading-[1.2] font-extrabold',
    'Ders notlarından bilgi kartı çıkaran mod',
    'Karo başlığı · 20/800',
  ],
  ['cx', 'Kuluçka · 14 gün doldu', 'Etiket · 13/800 · büyük harf'],
  ['', 'Aklındakini dök, gerisini SecondMind halleder. Ğğ Şş İı Çç Öö Üü', 'Gövde · 15/400'],
  ['font-bold', "Erdem'in doğum günü — mesaj at", 'Gövde vurgu · 15/700'],
  ['text-[13px] font-semibold text-ink3', 'Son tarama 2 saat önce', 'İkincil · 13/600 · en küçük'],
]

function TypeAndShape() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_440px] items-start gap-10">
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Tipografi"
          description="Archivo. Başlıklar geniş (125) ve büyük harf; gövde normal genişlik."
          className="mb-2"
        />
        {TYPE_ROWS.map(([cls, sample, cap], i) => (
          <div
            key={cap}
            className={`flex items-baseline gap-4 py-2.5 ${i < TYPE_ROWS.length - 1 ? 'border-b border-line' : ''}`}
          >
            <span className={`grow ${cls}`}>{sample}</span>
            <Cap>{cap}</Cap>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-4">
        <SectionHeader title="Şekil" />
        <div className="grid grid-cols-2 gap-3.5">
          {[
            ['h-[84px] rounded-modal', 'Modal · 32'],
            ['h-[84px] rounded-tile', 'Karo, bant · 28'],
            ['h-[84px] rounded-field', 'Input, akış bloğu · 14'],
            ['my-[21px] h-[42px] rounded-full', 'Buton, etiket · pill'],
          ].map(([cls, cap]) => (
            <div key={cap} className="flex flex-col gap-1.5">
              <div className={`bg-s2 ${cls}`} />
              <Cap>{cap}</Cap>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 rounded-tile bg-s2 px-5 py-[18px]">
          <span className="cx">Derinlik</span>
          <span className="text-[14px] text-ink2">
            Karo ve bantta gölge ve kenarlık yok. Hover&apos;da karo 2px yükselir. Gölge yalnızca
            modal ve açılır menüde.
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="cx">Boşluk</span>
          <div className="flex items-end gap-3.5">
            {[6, 10, 16, 20, 32, 64].map((n) => (
              <div key={n} className="flex flex-col items-center gap-1.5">
                <div
                  className="bg-ink"
                  style={{ width: n, height: n, borderRadius: Math.max(2, Math.round(n / 6)) }}
                />
                <Cap>{n}</Cap>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

const BUTTON_ROWS: Array<{
  name: string
  variant: ButtonVariant
  label: string
  count?: number
  loadingLabel: string
}> = [
  { name: 'Birincil', variant: 'primary', label: 'Döküme at', loadingLabel: 'Kaydediliyor' },
  { name: 'Eylem (Başla)', variant: 'action', label: 'Başla', loadingLabel: 'Açılıyor' },
  { name: 'İkincil', variant: 'secondary', label: 'Güncelle', loadingLabel: '3 klasör taranıyor…' },
  { name: 'AI', variant: 'ai', label: 'AI ile İşle', count: 5, loadingLabel: 'İşleniyor 3/5' },
  { name: 'Tehlike', variant: 'danger', label: 'Klasörü kaldır', loadingLabel: 'Kaldırılıyor' },
]

function Buttons() {
  return (
    <Section title="Butonlar" description="Hepsi pill. Basılıyken %96. Yükleniyor genişliği korur.">
      <div className="grid grid-cols-[160px_repeat(5,minmax(0,1fr))] items-center gap-x-3 gap-y-[18px]">
        <span />
        {['Normal', 'Hover', 'Basılı', 'Devre dışı', 'Yükleniyor'].map((h) => (
          <span key={h} className="cx text-ink3">
            {h}
          </span>
        ))}
        {BUTTON_ROWS.map((row) => (
          <ButtonRow key={row.name} {...row} />
        ))}
        <span className="font-extrabold">Karo üstünde</span>
        <div className="col-span-5 flex gap-3">
          <div className={`flex gap-2 rounded-[22px] p-3 ${DOMAIN_FILL.projects}`}>
            <Button size="sm" variant="onTile">
              Projeye çevir
            </Button>
            <Button size="sm" variant="onTileGhost">
              Arşivle
            </Button>
          </div>
          <div className={`flex gap-2 rounded-[22px] p-3 ${DOMAIN_FILL.warning}`}>
            <Button size="sm" variant="onTile">
              Aç
            </Button>
            <Button size="sm" variant="onTileGhost">
              Arşivle
            </Button>
          </div>
          <div className="flex gap-2 rounded-[22px] bg-band p-3 text-white [--ot-ghost-bg:rgba(255,255,255,.12)] [--ot-ghost-fg:#FFFFFF]">
            <Button size="sm" variant="onTileGhost">
              Yeniden yerleştir
            </Button>
          </div>
          <IconButton label="Kapat" icon={X} className="self-center" />
        </div>
      </div>
    </Section>
  )
}

function ButtonRow({ name, variant, label, count, loadingLabel }: (typeof BUTTON_ROWS)[number]) {
  return (
    <>
      <span className="font-extrabold">{name}</span>
      <div>
        <Button variant={variant} count={count}>
          {label}
        </Button>
      </div>
      <div>
        <Button variant={variant} count={count} data-force="hover">
          {label}
        </Button>
      </div>
      <div>
        <Button variant={variant} count={count} data-force="pressed">
          {label}
        </Button>
      </div>
      <div>
        <Button variant={variant} disabled>
          {label}
        </Button>
      </div>
      <div>
        <Button variant={variant} loading loadingLabel={loadingLabel}>
          {label}
        </Button>
      </div>
    </>
  )
}

function Tiles() {
  return (
    <Section
      title="Karolar"
      description="Dört tür. Karo rengi alanı söyler; içinde tek soru, en fazla iki eylem."
    >
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-stretch gap-4">
        <div className="flex flex-col gap-2">
          <Tile
            variant="featured"
            className="h-[200px]"
            eyebrow={
              <>
                <span className="size-2.5 rounded-full bg-green" />
                Şimdi · Runika
              </>
            }
            title="Menü müziğini 1:20'ye kırp"
            actions={[
              <Button key="a" size="sm" variant="action">
                Başla
              </Button>,
              <Button key="b" size="sm" variant="secondary">
                Oturumu kapat
              </Button>,
            ]}
          />
          <Cap>Vurgulu · sıradaki ilk adım (proje detayında)</Cap>
        </div>
        <div className="flex flex-col gap-2">
          <Tile variant="standard" className="h-[200px]" eyebrow="Hatırlatmalar">
            {[
              ['bg-amber text-fill-ink', '20:00', "Erdem'e mesaj"],
              ['bg-s3', 'Sal', 'Olasılık ödevi 2'],
            ].map(([cls, when, what]) => (
              <div key={what} className="flex items-center gap-2.5">
                <span
                  className={`x flex h-[26px] w-16 items-center justify-center rounded-full text-[13px] font-extrabold ${cls}`}
                >
                  {when}
                </span>
                <span className="font-semibold">{what}</span>
              </div>
            ))}
          </Tile>
          <Cap>Standart · nötr</Cap>
        </div>
        <div className="flex flex-col gap-2">
          <Tile
            variant="alert"
            className="h-[200px]"
            metric={{ value: 16, label: 'gün sessiz' }}
            title="Albüm projesi açılmadı."
            actions={[
              <Button key="a" size="sm" variant="onTile">
                Aç
              </Button>,
              <Button key="b" size="sm" variant="onTileGhost">
                Arşivle
              </Button>,
            ]}
          />
          <Cap>Uyarı · radar</Cap>
        </div>
        <div className="flex flex-col gap-2">
          <Tile
            variant="question"
            domain="projects"
            className="h-[200px]"
            eyebrow="Kuluçka · 14 gün"
            title="Ritim tabanlı bulmaca oyunu"
            actions={[
              <Button key="a" size="sm" variant="onTile">
                Evet
              </Button>,
              <Button key="b" size="sm" variant="onTileGhost">
                Arşivle
              </Button>,
            ]}
          >
            <span className="font-semibold opacity-75">Hâlâ heyecanlandırıyor mu?</span>
          </Tile>
          <Cap>Soru · kuluçka, karar</Cap>
        </div>
      </div>
    </Section>
  )
}

const FILTERS = ['Tümü', 'Görevler', 'Notlar', 'Resimler'] as const

function TagsAndBadges() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Tümü')
  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title="Etiket ve rozet" />
      <div className="flex flex-col gap-2.5">
        <span className="cx">Alan etiketleri</span>
        <div className="flex flex-wrap gap-2">
          <Tag domain="today">Bugün</Tag>
          <Tag domain="dump">Döküm</Tag>
          <Tag domain="projects">Runika</Tag>
          <Tag domain="school">Veri Yapıları</Tag>
          <Tag domain="mind">Zihin</Tag>
          <Tag domain="knowledge">Konsept Fikirleri</Tag>
          <Tag fill="#FF8A3D">SecondMind</Tag>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="cx">İşlem türü</span>
        <div className="flex flex-wrap gap-2">
          <Tag>+ Yeni görev</Tag>
          <Tag>Not güncelleme</Tag>
          <Tag>Hatırlatma</Tag>
          <Tag>Proje durumu</Tag>
        </div>
      </div>
      <div className="flex gap-10">
        <div className="flex flex-col gap-2.5">
          <span className="cx">Sayı</span>
          <div className="flex items-center gap-2">
            <Badge count={7} tone="today" />
            <Badge count={5} tone="dump" />
            <Badge count={2} tone="warning" />
            <Badge count={3} tone="dump" size="sm" />
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="cx">Durum</span>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="active" />
            <StatusBadge status="incubating">Kuluçkada · 5 gün</StatusBadge>
            <StatusBadge status="late" />
            <StatusBadge status="archived" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="cx">Filtre</span>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Chip key={f} selected={f === filter} onClick={() => setFilter(f)}>
              {f}
            </Chip>
          ))}
        </div>
      </div>
    </section>
  )
}

function Form() {
  const { toast } = useToast()
  const [mood, setMood] = useState<ScaleValue | null>(4)
  const [model, setModel] = useState('deep')
  const [name, setName] = useState('')

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title="Form" description="Dolgulu alan; odakta 2px mürekkep kenar." />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Proje adı" error={name === 'x' ? 'Bu adla bir proje zaten var.' : undefined}>
          <Input placeholder="Örn. Runika" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Sıradaki ilk adım">
          <Input defaultValue="Boss fazı 2 müziğini hızlandır" data-force="focus" />
        </Field>
        <Field label="Not" className="col-span-2">
          <Textarea placeholder="Nerede bıraktın?" className="h-20" />
        </Field>
        <Field label="Model">
          <Select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="deep">Derin</option>
            <option value="fast">Hızlı</option>
          </Select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="cx">Ruh hâli</span>
          <Scale label="Ruh hâli" value={mood} onChange={setMood} domain="mind" />
        </div>
        <Field label="Sınav tarihi">
          <Input type="date" defaultValue="2026-10-09" strong className="x" />
        </Field>
        <Field label="Saat">
          <Input type="time" defaultValue="09:00" strong className="x" />
        </Field>
        <DropZone
          onFiles={(files) =>
            toast({
              title: 'Dosya alındı',
              domain: 'dump',
              message: files.map((f) => f.name).join(', '),
            })
          }
        />
        <DropZoneView dragCount={2} label="" />
      </div>
      <div className="flex items-center gap-4">
        <Scale label="Enerji" value={mood} onChange={setMood} className="grow" />
        <Cap>Nötr ölçek (domain verilmeden)</Cap>
      </div>
    </section>
  )
}

const MODEL_ITEMS = [
  { id: 'fast', label: 'Hızlı', description: 'Kısa metin dökümleri' },
  { id: 'deep', label: 'Derin', description: 'Resimler, uzun notlar, özet' },
]

function ToastAndMenu() {
  const { toast } = useToast()
  const [model, setModel] = useState('fast')

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title="Bildirim · menü" />
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 grow flex-col gap-2.5">
          <ToastCard
            title="Tarama bitti"
            domain="projects"
            message="Runika'da 4 yeni commit, SecondMind'da 1 değişiklik."
            action={{ label: 'Gör', onClick: () => {} }}
          />
          <ToastCard
            variant="fill"
            domain="dump"
            message="7 öneri Onay Kutusu'nda"
            action={{ label: 'Aç', onClick: () => {} }}
          />
        </div>
        <MenuList
          label="AI ile İşle"
          items={MODEL_ITEMS}
          selectedId={model}
          onSelect={setModel}
          footer="5 döküm işlenecek"
          className="shrink-0"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast({
              title: 'Tarama bitti',
              domain: 'projects',
              message: "Runika'da 4 yeni commit.",
              action: { label: 'Gör', onClick: () => {} },
            })
          }
        >
          Bildirim göster
        </Button>
        <Menu
          label="AI ile İşle"
          items={MODEL_ITEMS}
          selectedId={model}
          onSelect={setModel}
          footer="5 döküm işlenecek"
          trigger={(props) => (
            <Button variant="ai" size="sm" icon={Sparkles} count={5} {...props}>
              AI ile İşle
            </Button>
          )}
        />
        <Cap>Gerçek bileşenler: tıkla, ok tuşları ve Esc çalışır.</Cap>
      </div>
    </section>
  )
}

function SessionForm() {
  return (
    <>
      <Field label="Nerede bıraktın?" optional>
        <Textarea
          className="h-[70px] py-2.5"
          defaultValue="Menü sahnesinde ses geçişleri tamam, müzik hâlâ uzun."
        />
      </Field>
      <Field label="Sıradaki ilk somut adım ne?" hint="Yarın Bugün ekranında ilk bunu göreceksin.">
        <Input defaultValue="Menü müziğini 1:20'ye kırp" data-force="focus" strong />
      </Field>
    </>
  )
}

function ModalDemo() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const actions = (
    <>
      <Button size="sm" variant="secondary" onClick={close}>
        Vazgeç
      </Button>
      <Button size="sm" onClick={close}>
        Kapat ve kaydet
      </Button>
    </>
  )

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title="Modal" description="Köşe 32. Üst şerit alan rengini taşır." />
      <ModalPanel
        title="Runika oturumunu kapat"
        domain="projects"
        onClose={() => {}}
        hints="Enter kaydeder"
        actions={actions}
      >
        <SessionForm />
      </ModalPanel>
      <div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Modalı aç
        </Button>
      </div>
      <Modal
        open={open}
        onClose={close}
        title="Runika oturumunu kapat"
        domain="projects"
        hints="Enter kaydeder · Esc kapatır"
        actions={actions}
      >
        <SessionForm />
      </Modal>
    </section>
  )
}

function States() {
  const [retrying, setRetrying] = useState(false)
  return (
    <Section
      title="Durumlar"
      description="Boş: tek cümle, tek eylem. Yükleniyor: iskelet. Hata: ne oldu ve tekrar dene."
    >
      <div className="grid grid-cols-3 gap-4">
        <EmptyState
          className="h-60"
          title="Henüz proje yok"
          message="Bir klasör bağla, SecondMind takibe başlasın."
          action={{ label: 'Klasör bağla', icon: Plus, onClick: () => {} }}
        />
        <div
          className="flex h-60 flex-col gap-3 rounded-tile bg-s2 px-5 py-[18px]"
          aria-busy="true"
          aria-label="Yükleniyor"
        >
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-[34px] w-[90%]" />
          <Skeleton className="h-[34px] w-[70%]" />
          <span className="grow" />
          <div className="flex gap-2">
            <Skeleton shape="pill" className="h-[34px] w-24" />
            <Skeleton shape="pill" className="h-[34px] w-20" />
          </div>
        </div>
        <ErrorState
          className="h-60"
          title="Tarama olmadı"
          detail="D:\Oyunlar\Runika bulunamadı. Klasör taşındıysa Ayarlar'dan yeniden bağla."
          retrying={retrying}
          onRetry={() => {
            setRetrying(true)
            setTimeout(() => setRetrying(false), 1500)
          }}
        />
      </div>
    </Section>
  )
}

export function TasarimPage() {
  return (
    <main className="flex flex-col gap-16 px-[72px] py-16">
      <Header />
      <Colors />
      <TypeAndShape />
      <Buttons />
      <Tiles />
      <div className="grid grid-cols-2 items-start gap-10">
        <TagsAndBadges />
        <Form />
      </div>
      <Later
        title="Akış bandı"
        description="08–24 tek satır. Üst şerit hatırlatmalar, alt şerit bloklar."
        stage="Aşama 1b"
      />
      <Later
        title="Grafik"
        description="Kalın çizgi, tam yuvarlak çubuk, dolgu renkleri."
        stage="Aşama 7 (Zihin)"
      />
      <div className="grid grid-cols-2 items-start gap-10">
        <Later title="Fark" description="Not güncelleme önerileri." stage="Aşama 4 (Onay Kutusu)" />
        <ToastAndMenu />
      </div>
      <div className="grid grid-cols-2 items-start gap-10">
        <ModalDemo />
        <Later title="Komut paleti" description="Ctrl K. Eşleşme amber vurgulu." stage="Aşama 1b" />
      </div>
      <States />
    </main>
  )
}
