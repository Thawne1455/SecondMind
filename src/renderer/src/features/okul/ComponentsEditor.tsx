import { Plus, Trash2 } from 'lucide-react'
import type { ComponentKind } from '@shared/ipc'
import { cn, Button, IconButton, Input, Select } from '../../ui'
import { COMPONENT_KIND_LABEL, formatScore, toComponents, type ComponentDraft } from './schoolText'

// Değerlendirme şeması elle girilir: bileşen adı, türü ve ağırlığı (%). Kurulum sihirbazı ve yeni ders
// penceresi kullanır; ders açıldıktan sonra Sınavlar ve notlar sekmesinde de düzenlenir.

export function ComponentsEditor({
  rows,
  onChange,
}: {
  rows: ComponentDraft[]
  onChange: (rows: ComponentDraft[]) => void
}) {
  const total = toComponents(rows).reduce((n, c) => n + c.weight, 0)
  const patch = (i: number, p: Partial<ComponentDraft>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_140px_110px_34px] items-center gap-2">
          <Input
            aria-label="Bileşen adı"
            value={r.name}
            maxLength={60}
            onChange={(e) => patch(i, { name: e.target.value })}
          />
          <Select aria-label="Tür" value={r.kind} onChange={(e) => patch(i, { kind: e.target.value as ComponentKind })}>
            {Object.entries(COMPONENT_KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <div className="relative">
            <span className="x pointer-events-none absolute top-[13px] left-3 text-ink3">%</span>
            <Input
              aria-label={`${r.name || 'Bileşen'} ağırlığı`}
              inputMode="decimal"
              placeholder="0"
              value={r.weight}
              onChange={(e) => patch(i, { weight: e.target.value.replace(/[^\d.,]/g, '') })}
              className="pl-7"
              strong
            />
          </div>
          <IconButton label="Bileşeni sil" icon={Trash2} onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          icon={Plus}
          onClick={() => onChange([...rows, { name: '', kind: 'other', weight: '' }])}
        >
          Bileşen
        </Button>
        <span className="grow" />
        <span className={cn('x text-[13px] font-bold', total === 100 ? 'text-ink3' : 'text-t-coral')}>
          Toplam %{formatScore(total)}
          {total !== 100 && ' · 100 olmalı'}
        </span>
      </div>
    </div>
  )
}
