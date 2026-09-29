import { useState } from 'react'
import { format } from 'date-fns'
import { Bot, Check, Gavel, ListPlus, ParkingSquare, Bug } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { LogItem, ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatMinutes } from '../../lib/format'
import { Button, useToast } from '../../ui'

// Günlük'te Claude Code oturum raporu (5e). Aşama 4'e (Onay Kutusu) kadar rapordaki maddeler burada elle alınır:
// görev önerisi → görev, açık sorun → hata, "Sonra" → park, karar → ADR sayfası.

type Report = Extract<LogItem, { kind: 'report' }>
type Action = 'task' | 'bug' | 'park' | 'adr'

const SECTIONS: {
  key: keyof Pick<Report, 'taskSuggestions' | 'issues' | 'later' | 'decisions'>
  title: string
  action: Action
}[] = [
  { key: 'taskSuggestions', title: 'Yeni görev önerileri', action: 'task' },
  { key: 'issues', title: 'Açık sorunlar', action: 'bug' },
  { key: 'later', title: 'Sonra', action: 'park' },
  { key: 'decisions', title: 'Kararlar', action: 'adr' },
]

const ACTION = {
  task: { label: 'Göreve çevir', icon: ListPlus },
  bug: { label: 'Hata olarak ekle', icon: Bug },
  park: { label: 'Park et', icon: ParkingSquare },
  adr: { label: 'Karar olarak kaydet', icon: Gavel },
} as const

export function ReportItem({ project, item }: { project: ProjectSummary; item: Report }) {
  const client = useQueryClient()
  const { toast } = useToast()
  const [taken, setTaken] = useState<Set<string>>(new Set())

  async function take(action: Action, text: string) {
    try {
      if (action === 'task' || action === 'bug')
        await window.api.invoke('task:create', {
          title: text.slice(0, 300),
          projectId: project.id,
          kind: action === 'bug' ? 'bug' : 'task',
        })
      else if (action === 'park')
        await window.api.invoke('parking:add', { projectId: project.id, text: text.slice(0, 500) })
      else
        await window.api.invoke('doc:create', {
          projectId: project.id,
          title: text.slice(0, 200),
          kind: 'adr',
        })
      setTaken((s) => new Set(s).add(`${action}:${text}`))
      void client.invalidateQueries()
    } catch (e) {
      toast({ message: errorText(e), domain: 'warning' })
    }
  }

  return (
    <li className="relative flex flex-col gap-2 rounded-[18px] bg-s2 px-4 py-3">
      <span
        className="absolute top-3.5 -left-[33px] grid size-6 place-items-center rounded-full bg-lilac2 text-fill-ink ring-4 ring-bg"
        aria-hidden
      >
        <Bot size={13} strokeWidth={2} />
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-[15px] font-bold">
          Claude Code raporu{item.minutes ? ` · ${formatMinutes(item.minutes)}` : ''}
        </span>
        <span className="ml-auto text-[13px] font-semibold text-ink3 tabular-nums">
          {format(item.at, 'HH:mm')}
        </span>
      </span>
      {item.done.length > 0 && (
        <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-[14px] text-ink2">
          {item.done.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      {item.nextStep && (
        <span className="text-[13px] font-semibold text-ink3">Sıradaki: {item.nextStep}</span>
      )}
      {SECTIONS.filter((s) => item[s.key].length).map((s) => (
        <div key={s.key} className="flex flex-col gap-1">
          <span className="cx text-ink2">{s.title}</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {item[s.key].map((text) => {
              const done = taken.has(`${s.action}:${text}`)
              const A = ACTION[s.action]
              return (
                <li
                  key={text}
                  className="flex items-center gap-2 rounded-[12px] bg-bg py-1 pr-1 pl-3"
                >
                  <span className="min-w-0 grow text-[14px]">{text}</span>
                  {done ? (
                    <span className="flex items-center gap-1 pr-2 text-[13px] font-bold text-ink3">
                      <Check size={14} strokeWidth={2} aria-hidden /> Alındı
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={A.icon}
                      onClick={() => void take(s.action, text)}
                    >
                      {A.label}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </li>
  )
}
