import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import { AlertTriangle, ArrowLeft, Check, CircleHelp, Star } from 'lucide-react'
import type { ExamPrep, PrepBlock, PrepTopic } from '@shared/ipc'
import { TopBar } from '../../app/TopBar'
import { errorText } from '../../lib/errors'
import { formatMinutes } from '../../lib/format'
import { useSetSetting } from '../../lib/settings'
import { Button, cn, EmptyState, ErrorState, Skeleton, useToast } from '../../ui'
import { clock, daysLeftText, LEVEL_LABELS, stripes, WEEKDAY_SHORT } from './schoolText'
import { useExamPrep, usePlanPreview, useSchoolWrite } from './useSchool'

// Sınav hazırlık ekranı (OKUL.md, "Okul'un en değerli ekranı"): geri sayım posteri, konu listesi (hazırlık
// seviyesi 0–3, hoca vurgusu, anlamadımlar, süre) ve sınavdan geriye plan: önizle → Planı onayla →
// çalışma blokları Bugün'ün bandına ve Okul programına düşer. Kaçırılan blok ertesi gün kendiliğinden yayılır.

export function ExamPrepPage() {
  const { examId } = useParams()
  const prep = useExamPrep(examId)
  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-8">
      <TopBar title="Okul" />
      {prep.isPending ? (
        <>
          <Skeleton shape="tile" className="h-[200px]" />
          <Skeleton shape="tile" className="h-[420px]" />
        </>
      ) : prep.isError ? (
        <ErrorState title="Sınav açılamadı" detail={errorText(prep.error)} onRetry={() => void prep.refetch()} />
      ) : !prep.data ? (
        <EmptyState
          className="h-60 max-w-[640px]"
          title="Sınav bulunamadı"
          message="Silinmiş olabilir."
          action={{ label: "Okul'a dön", icon: ArrowLeft, onClick: () => history.back() }}
        />
      ) : (
        <PrepView prep={prep.data} />
      )}
    </main>
  )
}

function PrepView({ prep }: { prep: ExamPrep }) {
  const e = prep.exam
  const included = prep.topics.filter((t) => t.included)
  const excluded = prep.topics.filter((t) => !t.included)
  const past = prep.daysLeft < 0

  return (
    <>
      <header
        className="flex min-h-[200px] flex-col justify-between gap-4 rounded-tile px-8 pt-5 pb-6 text-fill-ink"
        style={{ backgroundColor: prep.tone }}
      >
        <div className="flex items-center gap-3">
          <Link
            to={`/okul/ders/${prep.courseId}/sinavlar`}
            className="cx flex items-center gap-1.5 rounded-full opacity-70 hover:opacity-100 focus-visible:outline-3 focus-visible:outline-indigo"
          >
            <ArrowLeft size={16} strokeWidth={2} aria-hidden /> {prep.courseName}
          </Link>
          <span className="cx opacity-70">
            · {format(parseISO(e.day), 'd MMMM EEEE', { locale: tr })}
            {e.startMin !== null && ` · ${clock(e.startMin)}`}
            {e.place && ` · ${e.place}`}
          </span>
        </div>
        <h2 className="x m-0 text-[64px] leading-[.95] font-black uppercase">
          {past ? 'Geçti' : daysLeftText(prep.daysLeft)} · {prep.courseName} {e.title}
        </h2>
        <div className="flex items-end gap-10">
          <PosterStat value={e.readiness === null ? '—' : `%${e.readiness}`} label="hazır" />
          <PosterStat value={formatMinutes(prep.doneMin)} label={`çalışıldı · planlı ${formatMinutes(prep.plannedMin)}`} />
          <PosterStat value={String(included.length)} label="konu" />
        </div>
      </header>

      {prep.reviews.length > 0 && (
        <section aria-label="Önceki sınavlardan" className="flex flex-col gap-2 rounded-tile bg-lilac px-5 py-[18px] text-fill-ink">
          <span className="cx">Geçen sefer ne oldu</span>
          {prep.reviews.map((r) => (
            <p key={r.id} className="m-0 whitespace-pre-wrap">
              <span className="font-extrabold">{r.title}: </span>
              {r.reviewMd}
            </p>
          ))}
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(380px,1fr)] items-start gap-6">
        <section aria-label="Konular" className="flex flex-col gap-2">
          <span className="cx">Konular · önce zor ve vurgulananlar planlanır</span>
          {prep.topics.length === 0 && (
            <EmptyState
              className="h-40"
              title="Konu yok"
              message="Dersin Hafta hafta sekmesinde haftalara konu ekle; kapsam haftalarındakiler buraya düşer."
            />
          )}
          {included.map((t) => (
            <TopicRow key={t.topicId} prep={prep} t={t} />
          ))}
          {excluded.length > 0 && (
            <details className="mt-2">
              <summary className="cx cursor-pointer text-ink3">Kapsam dışı · {excluded.length}</summary>
              <div className="mt-2 flex flex-col gap-2">
                {excluded.map((t) => (
                  <TopicRow key={t.topicId} prep={prep} t={t} />
                ))}
              </div>
            </details>
          )}
        </section>
        <PlanPanel prep={prep} />
      </div>
    </>
  )
}

function PosterStat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex items-end gap-2">
      <span className="x text-[44px] leading-[.9] font-black">{value}</span>
      <span className="cx pb-1 opacity-75">{label}</span>
    </span>
  )
}

function TopicRow({ prep, t }: { prep: ExamPrep; t: PrepTopic }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const set = useSchoolWrite('examTopic:set')
  const topic = useSchoolWrite('topic:save')
  const ro = prep.readOnly
  const examId = prep.exam.id
  const [minutes, setMinutes] = useState(t.estimateMin === null ? '' : String(t.estimateMin))

  return (
    <div className={cn('flex flex-col gap-2 rounded-[20px] bg-s2 px-4 py-3', !t.included && 'opacity-60')}>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          aria-label={`${t.name} sınava dahil`}
          checked={t.included}
          disabled={ro}
          onChange={() => set.mutate({ examId, topicId: t.topicId, included: !t.included }, { onError })}
          className="size-4 accent-[var(--ink)]"
        />
        <span className="min-w-0 grow truncate font-bold">{t.name}</span>
        {t.weekNo !== null && (
          <button
            type="button"
            onClick={() => void navigate(`/okul/ders/${prep.courseId}?hafta=${t.weekNo}`)}
            className="cx cursor-pointer text-ink3 hover:text-ink hover:underline"
            title="Hafta notuna git"
          >
            {t.weekNo}. hafta
          </button>
        )}
        <button
          type="button"
          disabled={ro}
          aria-pressed={t.emphasized}
          title={t.emphasized ? 'Hoca vurguladı' : 'Hoca vurguladı mı?'}
          onClick={() =>
            topic.mutate({ id: t.topicId, courseId: prep.courseId, name: t.name, emphasized: !t.emphasized }, { onError })
          }
          className={cn(
            'grid size-8 cursor-pointer place-items-center rounded-full',
            t.emphasized ? 'bg-sky text-fill-ink' : 'text-ink3 hover:bg-hover',
          )}
        >
          <Star size={16} strokeWidth={2} fill={t.emphasized ? 'currentColor' : 'none'} aria-hidden />
        </button>
      </div>
      {t.included && (
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label={`${t.name} hazırlık`} className="flex gap-1 rounded-full bg-s3 p-[3px]">
            {LEVEL_LABELS.map((label, level) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={t.level === level}
                disabled={ro}
                onClick={() => set.mutate({ examId, topicId: t.topicId, level }, { onError })}
                className={cn(
                  'h-[30px] cursor-pointer rounded-full px-3 text-[13px] font-bold transition-colors',
                  t.level === level ? 'bg-ink text-on-ink' : 'hover:bg-hover',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[13px] font-semibold text-ink3">
            <input
              inputMode="numeric"
              aria-label="Tahmini süre (dk)"
              disabled={ro}
              value={minutes}
              placeholder={String(t.minutes)}
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
              onBlur={() => {
                const v = minutes === '' ? null : Number(minutes)
                if (v !== t.estimateMin) set.mutate({ examId, topicId: t.topicId, estimateMin: v }, { onError })
              }}
              className="x h-[30px] w-[64px] rounded-lg bg-bg px-2 text-right font-bold text-ink outline-none focus:ring-2 focus:ring-ink"
            />
            dk
          </label>
          {t.openFlags.length > 0 && (
            <span
              className="flex items-center gap-1 rounded-full bg-coral px-2.5 py-1 text-[13px] font-bold text-white"
              title={t.openFlags.map((f) => `• ${f.excerpt}`).join('\n')}
            >
              <CircleHelp size={14} strokeWidth={2.25} aria-hidden /> {t.openFlags.length} anlamadım
            </span>
          )}
        </div>
      )}
    </div>
  )
}

const dayTitle = (day: string) => {
  const d = parseISO(day)
  return `${WEEKDAY_SHORT[(d.getDay() + 6) % 7]} ${format(d, 'd MMM', { locale: tr })}`
}

function groupByDay<T extends { day: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const b of items) map.set(b.day, [...(map.get(b.day) ?? []), b])
  return [...map]
}

function PlanPanel({ prep }: { prep: ExamPrep }) {
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const [previewing, setPreviewing] = useState(false)
  const preview = usePlanPreview(prep.exam.id, previewing)
  const apply = useSchoolWrite('exam:planApply')
  const clear = useSchoolWrite('exam:planClear')
  const status = useSchoolWrite('study:setStatus')
  const setMax = useSetSetting('studyDailyMaxMin')
  const ro = prep.readOnly || prep.daysLeft <= 0
  const active = prep.blocks.filter((b) => b.status !== 'missed')
  const today = format(new Date(), 'yyyy-MM-dd')

  function changeMax(delta: number) {
    const next = Math.min(720, Math.max(30, prep.dailyMaxMin + delta))
    setMax.mutate(next, { onSuccess: () => void preview.refetch() })
  }

  if (previewing) {
    const p = preview.data
    return (
      <section aria-label="Plan önizlemesi" className="flex flex-col gap-3 rounded-tile bg-s2 px-5 py-[18px]">
        <span className="cx">Önizleme</span>
        <DailyMax value={prep.dailyMaxMin} onChange={changeMax} />
        {!p ? (
          <Skeleton className="h-40" lines={5} />
        ) : (
          <>
            <span className="text-[15px] font-semibold">
              {p.blocks.length} blok · {formatMinutes(p.totalMin)}
              {p.reviewMin > 0 && ` · son gün ${formatMinutes(p.reviewMin)} tekrar`}
              {p.replaces > 0 && ` · ${p.replaces} eski bloğun yerine`}
            </span>
            {p.unfitMin > 0 && <UnfitWarning min={p.unfitMin} />}
            <BlockList
              groups={groupByDay(
                p.blocks.map((b, i) => ({
                  id: String(i),
                  day: b.day,
                  startMin: b.startMin,
                  endMin: b.endMin,
                  topicId: b.topicId,
                  topicName: b.topicName,
                  status: 'planned' as const,
                })),
              )}
              tone={prep.tone}
            />
            <div className="flex gap-2">
              <Button
                variant="action"
                disabled={!p.blocks.length}
                loading={apply.isPending}
                onClick={() =>
                  apply.mutate(
                    { id: prep.exam.id },
                    {
                      onSuccess: ({ blocks }) => {
                        setPreviewing(false)
                        toast({ message: `Plan kuruldu · ${blocks} blok Bugün'e yerleşecek.`, domain: 'school' })
                      },
                      onError,
                    },
                  )
                }
              >
                Planı onayla
              </Button>
              <Button variant="secondary" onClick={() => setPreviewing(false)}>
                Vazgeç
              </Button>
            </div>
          </>
        )}
      </section>
    )
  }

  return (
    <section aria-label="Çalışma planı" className="flex flex-col gap-3 rounded-tile bg-s2 px-5 py-[18px]">
      <div className="flex items-center gap-2">
        <span className="cx grow">Çalışma planı</span>
        {!ro && active.some((b) => b.status === 'planned' && b.day >= today) && (
          <Button size="sm" variant="secondary" loading={clear.isPending} onClick={() => clear.mutate({ id: prep.exam.id }, { onError })}>
            Kaldır
          </Button>
        )}
      </div>
      {prep.unfitMin > 0 && active.length > 0 && <UnfitWarning min={prep.unfitMin} />}
      {active.length === 0 ? (
        <span className="text-ink2">
          {ro
            ? 'Plan yok.'
            : 'Henüz plan yok. Seviyeleri işaretle, SecondMind bugünden sınava kadar boş saatlere yerleştirsin.'}
        </span>
      ) : (
        <BlockList
          groups={groupByDay(active)}
          tone={prep.tone}
          onToggle={(b) =>
            b.day <= today &&
            status.mutate({ id: b.id, status: b.status === 'done' ? 'planned' : 'done' }, { onError })
          }
        />
      )}
      {!ro && (
        <div>
          <Button variant="action" onClick={() => setPreviewing(true)} disabled={!prep.topics.some((t) => t.included)}>
            {active.length ? 'Planı yeniden kur' : 'Plan kur'}
          </Button>
        </div>
      )}
    </section>
  )
}

function DailyMax({ value, onChange }: { value: number; onChange: (delta: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-[14px] font-semibold">
      Günlük en fazla
      <Button size="xs" variant="secondary" onClick={() => onChange(-30)} aria-label="30 dk azalt">
        −
      </Button>
      <span className="x min-w-[64px] text-center font-black">{formatMinutes(value)}</span>
      <Button size="xs" variant="secondary" onClick={() => onChange(30)} aria-label="30 dk artır">
        +
      </Button>
    </div>
  )
}

function UnfitWarning({ min }: { min: number }) {
  return (
    <span className="flex items-center gap-2 rounded-2xl bg-coral px-3 py-2 text-[14px] font-bold text-white">
      <AlertTriangle size={16} strokeWidth={2} aria-hidden />
      {formatMinutes(min)} sığmadı · günlük sınırı artır ya da konuları azalt.
    </span>
  )
}

function BlockList({
  groups,
  tone,
  onToggle,
}: {
  groups: [string, PrepBlock[]][]
  tone: string
  onToggle?: (b: PrepBlock) => void
}) {
  return (
    <div className="flex max-h-[520px] flex-col gap-3 overflow-y-auto pr-1">
      {groups.map(([day, blocks]) => (
        <div key={day} className="flex flex-col gap-1">
          <span className="cx text-ink3">
            {dayTitle(day)} · {formatMinutes(blocks.reduce((n, b) => n + b.endMin - b.startMin, 0))}
          </span>
          {blocks.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={!onToggle}
              onClick={() => onToggle?.(b)}
              title={onToggle ? 'Tıkla: yapıldı / yapılmadı' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-1.5 text-left text-fill-ink',
                onToggle && 'cursor-pointer',
                b.status === 'done' && 'opacity-60',
              )}
              style={stripes(tone)}
            >
              <span className="x rounded bg-white/75 px-1.5 text-[13px] font-bold">
                {clock(b.startMin)}–{clock(b.endMin)}
              </span>
              <span className="grow truncate rounded bg-white/75 px-1.5 text-[14px] font-bold">{b.topicName}</span>
              {b.status === 'done' && <Check size={16} strokeWidth={3} aria-label="Yapıldı" />}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
