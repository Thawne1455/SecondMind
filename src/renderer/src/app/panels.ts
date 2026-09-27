import type { LucideIcon } from 'lucide-react'
import { BookOpen, Folder, GraduationCap, Inbox, ListChecks, Smile, Sun } from 'lucide-react'
import type { Domain } from '../ui'

export type PanelId = 'bugun' | 'dokum' | 'onay' | 'projeler' | 'okul' | 'zihin' | 'bilgi'

export type Panel = {
  id: PanelId
  path: string
  label: string
  icon: LucideIcon
  domain: Domain
}

/** Kenar çubuğu sırası (TASARIM.md "Uygulama iskeleti"). */
export const PANELS: Panel[] = [
  { id: 'bugun', path: '/', label: 'Bugün', icon: Sun, domain: 'today' },
  { id: 'dokum', path: '/dokum', label: 'Döküm', icon: Inbox, domain: 'dump' },
  { id: 'onay', path: '/onay', label: 'Onay Kutusu', icon: ListChecks, domain: 'today' },
  { id: 'projeler', path: '/projeler', label: 'Projeler', icon: Folder, domain: 'projects' },
  { id: 'okul', path: '/okul', label: 'Okul', icon: GraduationCap, domain: 'school' },
  { id: 'zihin', path: '/zihin', label: 'Zihin', icon: Smile, domain: 'mind' },
  { id: 'bilgi', path: '/bilgi', label: 'Bilgi', icon: BookOpen, domain: 'knowledge' },
]
