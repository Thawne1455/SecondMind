// SAHTE VERİ — Aşama 1b. Bugün ekranı ve kenar çubuğu tasarımla birebir görünsün diye.
// Aşama 3 (Bugün gerçek veri) ve Aşama 5 (Projeler) bu dosyayı tamamen kaldırır.

export type FakeProject = {
  id: string
  name: string
  color: string
  /** Radar: bu kadar gündür açılmadıysa kenar çubuğunda mercan halka. */
  silentDays?: number
}

export const FAKE_PROJECTS: FakeProject[] = [
  { id: 'runika', name: 'Runika', color: '#3BE08F' },
  { id: 'secondmind', name: 'SecondMind', color: '#FF8A3D' },
  { id: 'album', name: 'Albüm', color: '#F59BE6', silentDays: 16 },
]

/** Tasarımdaki an; gerçek saat Aşama 3'te. */
export const FAKE_NOW = '13:40'

export type FlowBlockKind = 'class' | 'exam' | 'task' | 'free' | 'routine'

export type FakeFlowBlock = {
  id: string
  kind: FlowBlockKind
  start: string
  end: string
  title: string
  subtitle?: string
  color?: string
}

export const FAKE_BLOCKS: FakeFlowBlock[] = [
  {
    id: 'b1',
    kind: 'class',
    start: '09:00',
    end: '10:50',
    title: 'Veri Yapıları',
    subtitle: '09:00 · D-201',
  },
  { id: 'b2', kind: 'exam', start: '11:00', end: '12:00', title: 'Vize', subtitle: 'Ağaçlar' },
  {
    id: 'b3',
    kind: 'task',
    start: '13:00',
    end: '14:30',
    title: 'Runika',
    subtitle: 'Müziği kırp',
    color: '#3BE08F',
  },
  {
    id: 'b4',
    kind: 'class',
    start: '15:00',
    end: '16:50',
    title: 'Lineer Cebir',
    subtitle: '15:00 · B-105',
  },
  { id: 'b5', kind: 'free', start: '17:00', end: '19:00', title: 'Boş' },
  { id: 'b6', kind: 'routine', start: '19:00', end: '19:30', title: 'Yürüyüş' },
]

export const FAKE_PINS = [{ id: 'p1', time: '20:00', title: "Erdem'e doğum günü mesajı" }]

export const FAKE_FREE_MINUTES = 260

export const FAKE_NOW_TASK = {
  project: FAKE_PROJECTS[0]!,
  title: "Menü müziğini 1:20'ye kırp",
  minutesLeft: 50,
}

// Kuluçka ve radar karoları 2c'den, hatırlatmalar ve sıradaki adımlar 3a'dan beri gerçek veriyle.
export const FAKE_TILES = {
  sleep: '7:15',
  decision: {
    ago: '3 ay önce',
    decision: 'Yaz boyunca her gün 1 saat Runika.',
    expectation: 'Ağustos sonunda oynanabilir demo.',
  },
  week: [
    { value: 12, label: 'görev' },
    { value: 9, label: 'commit' },
    { value: 1, label: 'quiz' },
  ],
}
