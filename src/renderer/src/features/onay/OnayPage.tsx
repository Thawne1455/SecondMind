import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CheckCheck } from 'lucide-react'
import type { ProposalContexts, ProposalGroup } from '@shared/ipc'
import { TopBar } from '../../app/TopBar'
import { modelLabel } from '../../lib/aiText'
import { errorText } from '../../lib/errors'
import { useNow } from '../../lib/useNow'
import { Button, Chip, EmptyState, ErrorState, Skeleton, Tag, useToast } from '../../ui'
import { ActivityLog } from './ActivityLog'
import { ProposalCard } from './ProposalCard'
import { ScheduleGrid, TermStrip } from './SchedulePreview'
import { groupHeading, proposalAnchor } from './proposalText'
import { useApproveAll, useInbox, usePendingProposalCount } from './useOnay'

// Onay Kutusu — "AI ne yapmak istiyor, onaylıyor muyum?" Birim öneri; düzen kaynağa göre gruplu fark listesi
// (her AI işi bir grup, yeniden eskiye). Alt sekme İşlem günlüğü: uygulanmış değişiklikler ve Geri al.

type Tab = 'pending' | 'log'

export function OnayPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const pending = usePendingProposalCount()

  return (
    <main className="flex min-h-full flex-col gap-8 px-8 pt-[22px] pb-6">
      <TopBar
        title="Onay Kutusu"
        status={
          pending > 0 && (
            <span className="cx inline-flex h-7 shrink-0 items-center rounded-full bg-indigo px-3 text-white">
              {pending} bekliyor
            </span>
          )
        }
      />
      <div className="flex w-full max-w-[880px] flex-col gap-8">
        <nav aria-label="Onay Kutusu sekmeleri" className="flex items-center gap-2">
          <Chip
            selected={tab === 'pending'}
            aria-current={tab === 'pending' ? 'page' : undefined}
            onClick={() => setTab('pending')}
          >
            Bekleyenler
          </Chip>
          <Chip
            selected={tab === 'log'}
            aria-current={tab === 'log' ? 'page' : undefined}
            onClick={() => setTab('log')}
          >
            İşlem günlüğü
          </Chip>
        </nav>
        {tab === 'pending' ? <PendingGroups onShowLog={() => setTab('log')} /> : <ActivityLog />}
      </div>
    </main>
  )
}

function PendingGroups({ onShowLog }: { onShowLog: () => void }) {
  const navigate = useNavigate()
  const inbox = useInbox()
  const nowMs = useNow(60_000)

  if (inbox.isPending)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton shape="pill" className="h-8 w-80" />
        <Skeleton shape="tile" className="h-44" />
        <Skeleton shape="tile" className="h-44" />
      </div>
    )
  if (inbox.isError)
    return (
      <ErrorState
        title="Öneriler okunamadı"
        detail="Veritabanından liste alınamadı."
        onRetry={() => void inbox.refetch()}
        retrying={inbox.isFetching}
      />
    )
  if (!inbox.data.groups.length)
    return (
      <EmptyState
        className="h-56"
        title="Bekleyen öneri yok"
        message="Dökümleri AI ile işlediğinde öneriler burada seni bekler."
        action={{ label: "Döküm'e git", onClick: () => void navigate('/dokum') }}
      />
    )

  return (
    <div className="flex flex-col gap-10">
      {inbox.data.groups.map((g) => (
        <GroupSection
          key={g.jobId}
          group={g}
          contexts={inbox.data.contexts}
          now={new Date(nowMs)}
          onShowLog={onShowLog}
        />
      ))}
    </div>
  )
}

type GroupProps = {
  group: ProposalGroup
  contexts: ProposalContexts
  now: Date
  onShowLog: () => void
}

function GroupSection({ group, contexts, now, onShowLog }: GroupProps) {
  const { toast } = useToast()
  const approveAll = useApproveAll()
  const schedule = group.schedule
  const [focusId, setFocusId] = useState<string | null>(null)
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => clearTimeout(focusTimer.current ?? undefined), [])

  // Ders programında dönem önerisi kendi şeridinde; var olan döneme işaret ediyorsa karo olarak hiç görünmez.
  const termView = schedule?.term.proposalId
    ? group.proposals.find((p) => p.id === schedule.term.proposalId)
    : undefined
  const listed = group.proposals.filter(
    (p) => p.id !== termView?.id || (schedule?.term.mode === 'new' && p.status !== 'pending'),
  )
  const hiddenTerm = !!termView && schedule?.term.mode !== 'new'
  const visible = hiddenTerm ? group.proposals.filter((p) => p.id !== termView.id) : group.proposals
  const pending = visible.filter((p) => p.status === 'pending').length
  const total = visible.length
  const heading = groupHeading({ ...group, proposals: visible }, now)
  const courseInfo = new Map(schedule?.courses.map((c) => [c.proposalId, c]))

  function focus(id: string) {
    document
      .getElementById(proposalAnchor(id))
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFocusId(id)
    clearTimeout(focusTimer.current ?? undefined)
    focusTimer.current = setTimeout(() => setFocusId(null), 1600)
  }

  function runAll() {
    approveAll.mutate(group.jobId, {
      onSuccess: ({ applied, failed }) =>
        toast(
          failed.length
            ? {
                variant: 'band',
                domain: 'warning',
                title: 'Onay Kutusu',
                message: `${applied} öneri uygulandı, ${failed.length} öneri uygulanamadı: ${failed[0]!.error}`,
              }
            : {
                variant: 'band',
                domain: 'today',
                title: 'Onay Kutusu',
                message: `${applied} öneri uygulandı`,
                action: { label: 'Günlük', onClick: onShowLog },
              },
        ),
      onError: (e) =>
        toast({ variant: 'band', domain: 'warning', title: 'Onay Kutusu', message: errorText(e) }),
    })
  }

  return (
    <section aria-label={heading} className="flex flex-col gap-3">
      <header className="flex items-center gap-3 border-b-3 border-ink pb-3">
        <h2 className="x m-0 text-[20px] leading-[1.15] font-black uppercase">{heading}</h2>
        <Tag className="h-6 px-2.5 text-[12px]">{modelLabel(group.model)}</Tag>
        <span className="grow" />
        {pending > 0 && (
          <Button size="sm" icon={CheckCheck} loading={approveAll.isPending} onClick={runAll}>
            {schedule ? 'Programı onayla' : 'Tümünü onayla'}
            {pending < total ? ` (${pending})` : ''}
          </Button>
        )}
      </header>
      {schedule && (
        <>
          <TermStrip term={schedule.term} proposal={termView} contexts={contexts} />
          <ScheduleGrid schedule={schedule} proposals={group.proposals} onSelect={focus} />
        </>
      )}
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {listed.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            contexts={contexts}
            now={now}
            course={courseInfo.get(p.id)}
            focused={focusId === p.id}
          />
        ))}
      </ul>
    </section>
  )
}
