// SAHTE VERİ — Aşama 1b. Kenar çubuğu tasarımla birebir görünsün diye.
// Bugün ekranı 3c'den beri tamamen gerçek; bu dosya projelerle (Aşama 5) birlikte kalkar.

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
