import { useState, type FormEvent, type ReactNode } from 'react'
import { Check, Image as ImageIcon, Pencil, Undo2, X } from 'lucide-react'
import type { ProposalContexts, ProposalDiff, ProposalView } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, cn, Field, Input, Select, Tag, Textarea, useToast } from '../../ui'
import { FIELDS, fromForm, toForm, validateEdit, type FieldSpec, type FormValues } from './editForm'
import { OP_TAG, proposalLine } from './proposalText'
import { useApprove, useReject, useUndoProposal } from './useOnay'

// Öneri karosu: işlem türü + hedef alan etiketi, tek cümle (ya da fark karosu), kaynak döküm alıntısı,
// Reddet · Düzenle · Onayla. Düzenle karoyu yerinde forma çevirir. Karar verilen öneri tek satıra iner.

type CardProps = { proposal: ProposalView; contexts: ProposalContexts; now: Date }

export function ProposalCard({ proposal, contexts, now }: CardProps) {
  const [editing, setEditing] = useState(false)
  if (proposal.status !== 'pending') return <DecidedRow proposal={proposal} now={now} />
  return (
    <li className="flex flex-col gap-3.5 rounded-tile bg-s2 px-6 py-5">
      <TagRow proposal={proposal} />
      {editing ? (
        <ProposalEditor
          proposal={proposal}
          contexts={contexts}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {proposal.diff ? (
            <DiffBlock diff={proposal.diff} />
          ) : (
            <Sentence proposal={proposal} now={now} />
          )}
          <Sources proposal={proposal} />
          <Actions proposal={proposal} onEdit={() => setEditing(true)} />
        </>
      )}
    </li>
  )
}

function TagRow({ proposal }: { proposal: ProposalView }) {
  const { target, diff } = proposal
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tag className="bg-s3">{OP_TAG[proposal.payload.op]}</Tag>
      <Tag
        domain={target.missing ? 'warning' : target.domain}
        fill={target.missing ? undefined : (target.fill ?? undefined)}
        title={target.missing ? 'Bu kayıt artık yok; onaylanırsa hata verir' : undefined}
      >
        {target.label}
      </Tag>
      {diff && (
        <>
          <span className="ml-1 min-w-0 truncate text-[15px] font-bold">{diff.title}</span>
          <span className="x ml-auto shrink-0 text-[14px] font-bold">
            <span className="text-[#138A52] dark:text-green">+{diff.added.length}</span>{' '}
            <span className="text-t-coral">−{diff.removed.length}</span>
          </span>
        </>
      )}
    </div>
  )
}

function Sentence({ proposal, now }: { proposal: ProposalView; now: Date }) {
  const { title, meta } = proposalLine(proposal.payload, now)
  return (
    <p className="m-0 text-[17px] leading-[1.4]">
      <span className="font-bold">{title}</span>
      {meta.map((m) => (
        <span key={m} className="text-ink2 tabular-nums">
          {' · '}
          {m}
        </span>
      ))}
    </p>
  )
}

/** Fark karosu (TASARIM.md "Fark"): bağlam satırları soluk, silinen mercan ve üstü çizili, eklenen yeşil. */
function DiffBlock({ diff }: { diff: ProposalDiff }) {
  return (
    <div className="flex flex-col gap-1 rounded-block bg-bg p-3 text-[15px] leading-[1.45]">
      {diff.context.map((line, i) => (
        <DiffLine key={`c${i}`} className="text-ink3">
          {line}
        </DiffLine>
      ))}
      {diff.removed.map((line, i) => (
        <DiffLine key={`r${i}`} sign="−" className="bg-coral/15 text-ink2 line-through">
          {line}
        </DiffLine>
      ))}
      {diff.added.map((line, i) => (
        <DiffLine key={`a${i}`} sign="+" className="bg-green/25">
          {line}
        </DiffLine>
      ))}
    </div>
  )
}

function DiffLine({
  sign,
  className,
  children,
}: {
  sign?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex gap-2.5 rounded-lg px-2.5 py-1', className)}>
      <span aria-hidden className="x w-3 shrink-0 font-bold no-underline">
        {sign}
      </span>
      <span className="min-w-0 break-words whitespace-pre-wrap">{children}</span>
    </div>
  )
}

/** Kaynak döküm alıntısı: amber çizgi, iki satıra kırpılır. */
function Sources({ proposal }: { proposal: ProposalView }) {
  if (!proposal.sources.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      {proposal.sources.map((s) => (
        <blockquote
          key={s.dumpId}
          className="m-0 flex items-start gap-2 border-l-3 border-amber pl-3 text-[13px] leading-[1.45] font-semibold text-ink3"
        >
          {s.attachments > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 pt-px">
              <ImageIcon size={14} strokeWidth={1.75} aria-label="Ekli dosya" />
              {s.attachments > 1 && <span className="x">{s.attachments}</span>}
            </span>
          )}
          <span className="line-clamp-2">{s.excerpt ? `“${s.excerpt}”` : 'Metinsiz döküm'}</span>
        </blockquote>
      ))}
    </div>
  )
}

function Actions({ proposal, onEdit }: { proposal: ProposalView; onEdit: () => void }) {
  const { toast } = useToast()
  const approve = useApprove()
  const reject = useReject()
  const busy = approve.isPending || reject.isPending
  const fail = (e: unknown) =>
    toast({ variant: 'band', domain: 'warning', title: 'Onay Kutusu', message: errorText(e) })

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="secondary"
        size="sm"
        icon={X}
        className="[--btn-soft:var(--s3)]"
        disabled={busy}
        loading={reject.isPending}
        onClick={() => reject.mutate(proposal.id, { onError: fail })}
      >
        Reddet
      </Button>
      <Button
        variant="secondary"
        size="sm"
        icon={Pencil}
        className="[--btn-soft:var(--s3)]"
        disabled={busy}
        onClick={onEdit}
      >
        Düzenle
      </Button>
      <Button
        variant="action"
        size="sm"
        icon={Check}
        disabled={busy}
        loading={approve.isPending}
        onClick={() => approve.mutate({ id: proposal.id }, { onError: fail })}
      >
        Onayla
      </Button>
    </div>
  )
}

const DECIDED: Record<Exclude<ProposalView['status'], 'pending'>, string> = {
  approved: 'Onaylandı',
  edited: 'Düzenlenip onaylandı',
  rejected: 'Reddedildi',
}

/** Karara bağlanmış öneri: tek satır, onaylıysa Geri al. */
function DecidedRow({ proposal, now }: { proposal: ProposalView; now: Date }) {
  const { toast } = useToast()
  const undo = useUndoProposal()
  const applied = proposal.status !== 'rejected'
  const status = proposal.undone ? 'Geri alındı' : DECIDED[proposal.status as keyof typeof DECIDED]
  const { title } = proposalLine(proposal.payload, now)

  return (
    <li className="flex h-12 items-center gap-3 rounded-block px-5 text-[15px] text-ink2">
      <span
        aria-hidden
        className={cn(
          'flex size-6 shrink-0 animate-tick items-center justify-center rounded-full',
          applied && !proposal.undone ? 'bg-indigo text-white' : 'bg-s3 text-ink2',
        )}
      >
        {applied && !proposal.undone ? (
          <Check size={14} strokeWidth={2.5} />
        ) : proposal.undone ? (
          <Undo2 size={14} strokeWidth={2} />
        ) : (
          <X size={14} strokeWidth={2.5} />
        )}
      </span>
      <span className="shrink-0 font-bold text-ink">{status}</span>
      <span className="min-w-0 truncate">
        {OP_TAG[proposal.payload.op].replace(/^\+ /, '')} · {title}
      </span>
      <span className="grow" />
      {applied && !proposal.undone && (
        <Button
          variant="secondary"
          size="xs"
          icon={Undo2}
          loading={undo.isPending}
          onClick={() =>
            undo.mutate(proposal.id, {
              onError: (e) =>
                toast({
                  variant: 'band',
                  domain: 'warning',
                  title: 'Geri alınamadı',
                  message: errorText(e),
                }),
            })
          }
        >
          Geri al
        </Button>
      )}
    </li>
  )
}

type EditorProps = { proposal: ProposalView; contexts: ProposalContexts; onCancel: () => void }

/** Düzenle: önerinin alanları formda; "Kaydet ve onayla" düzenlenmiş yükle uygular. */
function ProposalEditor({ proposal, contexts, onCancel }: EditorProps) {
  const { toast } = useToast()
  const approve = useApprove()
  const op = proposal.payload
  const [values, setValues] = useState<FormValues>(() => toForm(op))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const edited = fromForm(op.op, values)
    const check = validateEdit(op, edited)
    if (!check.ok) {
      setErrors(check.errors)
      return
    }
    setErrors({})
    approve.mutate(
      { id: proposal.id, edited },
      {
        onError: (err) =>
          toast({
            variant: 'band',
            domain: 'warning',
            title: 'Onay Kutusu',
            message: errorText(err),
          }),
      },
    )
  }

  const fields = FIELDS[op.op].filter(
    (f) => f.kind !== 'taskKind' || values.context?.startsWith('p:'),
  )

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        {fields.map((f, i) => (
          <Field
            key={f.key}
            label={f.label}
            optional={f.optional}
            error={errors[f.key]}
            className={f.wide ? 'col-span-2' : undefined}
          >
            <FieldControl
              spec={f}
              value={values[f.key] ?? ''}
              onChange={(v) => set(f.key, v)}
              contexts={contexts}
              autoFocus={i === 0}
            />
          </Field>
        ))}
      </div>
      {errors.form && <p className="m-0 text-[13px] font-semibold text-t-coral">{errors.form}</p>}
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[13px] font-semibold text-ink3">Esc vazgeçer</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="[--btn-soft:var(--s3)]"
          onClick={onCancel}
        >
          Vazgeç
        </Button>
        <Button type="submit" variant="action" size="sm" icon={Check} loading={approve.isPending}>
          Kaydet ve onayla
        </Button>
      </div>
    </form>
  )
}

type ControlProps = {
  spec: FieldSpec
  value: string
  onChange: (value: string) => void
  contexts: ProposalContexts
  autoFocus?: boolean
}

const ON_TILE = 'bg-bg'

function FieldControl({ spec, value, onChange, contexts, autoFocus }: ControlProps) {
  const common = { value, autoFocus, className: ON_TILE }
  switch (spec.kind) {
    case 'textarea':
      return <Textarea {...common} rows={4} onChange={(e) => onChange(e.target.value)} />
    case 'date':
      return <Input {...common} type="date" onChange={(e) => onChange(e.target.value)} />
    case 'time':
      return <Input {...common} type="time" onChange={(e) => onChange(e.target.value)} />
    case 'datetime':
      return <Input {...common} type="datetime-local" onChange={(e) => onChange(e.target.value)} />
    case 'number':
      return (
        <Input
          {...common}
          type="number"
          inputMode="numeric"
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'taskKind':
      return (
        <Select {...common} onChange={(e) => onChange(e.target.value)}>
          <option value="">Görev</option>
          <option value="bug">Hata</option>
          <option value="research">Araştırma</option>
        </Select>
      )
    case 'context':
      return (
        <Select {...common} onChange={(e) => onChange(e.target.value)}>
          <option value="">Genel</option>
          <Missing
            value={value}
            known={[
              ...contexts.projects.map((p) => `p:${p.id}`),
              ...contexts.courses.map((c) => `c:${c.id}`),
            ]}
          />
          {contexts.projects.length > 0 && (
            <optgroup label="Projeler">
              {contexts.projects.map((p) => (
                <option key={p.id} value={`p:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {contexts.courses.length > 0 && (
            <optgroup label="Dersler">
              {contexts.courses.map((c) => (
                <option key={c.id} value={`c:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      )
    case 'project':
      return (
        <Select {...common} onChange={(e) => onChange(e.target.value)}>
          <Missing value={value} known={contexts.projects.map((p) => p.id)} />
          {contexts.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )
    case 'course':
      return (
        <Select {...common} onChange={(e) => onChange(e.target.value)}>
          <Missing value={value} known={contexts.courses.map((c) => c.id)} />
          {contexts.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )
    default:
      return <Input {...common} onChange={(e) => onChange(e.target.value)} />
  }
}

/** Seçicide olmayan (silinmiş/arşivlenmiş) değer seçili kalsın diye. */
function Missing({ value, known }: { value: string; known: string[] }) {
  if (!value || known.includes(value)) return null
  return <option value={value}>Bulunamadı</option>
}
