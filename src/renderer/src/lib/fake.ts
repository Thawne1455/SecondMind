// SAHTE VERİ — Aşama 1b. Bugün ekranı ve kenar çubuğu tasarımla birebir görünsün diye.
// Akış bandı ve Şimdi 3b'den beri gerçek; kalan karolar 3c'de, projeler Aşama 5'te kalkar.

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
