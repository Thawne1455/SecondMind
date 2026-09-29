import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import type { GpaOverview } from '@shared/ipc'
import { formatDecimal, gpa, letterPoints, type GpaCourse } from '@shared/school/grades'
import { TopBar } from '../../app/TopBar'
import { errorText } from '../../lib/errors'
import { Button, cn, EmptyState, ErrorState, Select, Skeleton, useToast } from '../../ui'
import { formatScore } from './schoolText'
import { useGpa, useSchoolWrite } from './useSchool'

// Ortalama (GANO) ekranı: bütün dönemler ve dersleri (kredi, harf, katsayı). Harf tahmin edilmez: elle girilen ya da
// bütün notlar girilince çıkan harf. Aktif dönemde harf seçmek sadece simülasyondur ("BB yerine CB gelirse?"), ortalamalar anında güncellenir. Arşiv dönemde
// harf gerçek nottur: seçmek kaydeder. Formül Σ(kredi × katsayı) / Σ kredi, tekrar alınan derste son not.

type Term = GpaOverview['terms'][number]

export function GpaPage() {
  const data = useGpa()
  return (
    <main className="flex min-h-full flex-col gap-[18px] px-8 pt-[22px] pb-8">
      <TopBar title="Okul" />
      {data.isPending ? (
        <Skeleton shape="tile" className="h-[420px]" />
      ) : data.isError ? (
        <ErrorState title="Ortalama açılamadı" detail={errorText(data.error)} onRetry={() => void data.refetch()} />
      ) : data.data.terms.length === 0 ? (
        <EmptyState className="h-60 max-w-[640px]" title="Dönem yok" message="Önce Okul'dan dönemini kur." />
      ) : (
        <GpaView terms={data.data.terms} />
      )}
    </main>
  )
}

function GpaView({ terms }: { terms: Term[] }) {
  const [sim, setSim] = useState<Record<string, string>>({})
  const { toast } = useToast()
  const save = useSchoolWrite('course:save')
  const letterOf = (c: Term['courses'][number]) => sim[c.id] ?? c.letter
  const rows = (t: Term): GpaCourse[] =>
    t.courses.map((c) => {
      const l = letterOf(c)
      return { key: c.code || c.name, credit: c.credit, points: l ? letterPoints(l, c.letterTable) : null, order: t.order }
    })
  const active = terms.find((t) => t.active)
  const termGpa = active ? gpa(rows(active)) : null
  const overall = gpa(terms.flatMap(rows))
  const simulating = Object.keys(sim).length > 0

  return (
    <>
      <header className="flex min-h-[168px] items-end gap-12 rounded-tile bg-sky px-8 pt-5 pb-6 text-fill-ink">
        <div className="flex grow flex-col gap-3 self-stretch">
          <Link
            to="/okul"
            className="cx flex items-center gap-1.5 self-start rounded-full opacity-70 hover:opacity-100 focus-visible:outline-3 focus-visible:outline-indigo"
          >
            <ArrowLeft size={16} strokeWidth={2} aria-hidden /> Okul
          </Link>
          <h2 className="x m-0 mt-auto text-[28px] leading-none font-black uppercase">Ortalama</h2>
          <span className="font-semibold opacity-80">
            {simulating ? 'Simülasyon: değiştirdiğin harflerle.' : 'Aktif dönemde bir derse harf seç, ortalamanın ne olacağını gör.'}
          </span>
        </div>
        {termGpa && <Big label={`${active!.name} · dönem`} value={termGpa.gpa} />}
        <Big label={`Genel · ${formatScore(overall.credits)} kredi`} value={overall.gpa} />
        {simulating && (
          <Button variant="onTile" icon={RotateCcw} onClick={() => setSim({})}>
            Sıfırla
          </Button>
        )}
      </header>

      {[...terms].reverse().map((t) => {
        const g = gpa(rows(t))
        return (
          <section key={t.id} aria-label={t.name} className="flex flex-col gap-2 rounded-tile bg-s2 px-5 py-[18px]">
            <div className="flex items-baseline gap-3">
              <span className="cx grow">
                {t.name}
                {t.active ? ' · aktif' : ' · arşiv'}
              </span>
              <span className="x text-[28px] font-black">{g.gpa === null ? '—' : formatDecimal(g.gpa)}</span>
            </div>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="cx text-[12px] text-ink3">
                  <th className="py-1.5 font-extrabold">Ders</th>
                  <th className="py-1.5 text-right font-extrabold">Kredi</th>
                  <th className="w-[150px] py-1.5 pl-6 font-extrabold">Harf</th>
                  <th className="py-1.5 text-right font-extrabold">Katsayı</th>
                </tr>
              </thead>
              <tbody>
                {t.courses.map((c) => {
                  const l = letterOf(c)
                  const changed = sim[c.id] !== undefined
                  return (
                    <tr key={c.id} className="border-t border-line">
                      <td className="py-2 font-bold">
                        <Link to={`/okul/ders/${c.id}/sinavlar`} className="hover:underline">
                          {c.name}
                        </Link>
                        {c.code && <span className="ml-2 text-[13px] font-semibold text-ink3">{c.code}</span>}
                      </td>
                      <td className="x py-2 text-right">{formatScore(c.credit)}</td>
                      <td className="py-2 pl-6">
                        <Select
                          aria-label={`${c.name} harfi`}
                          value={l ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            if (t.active) setSim((s) => ({ ...s, [c.id]: v }))
                            else
                              save.mutate(
                                { id: c.id, termId: t.id, name: c.name, code: c.code, credit: c.credit, letter: v || null },
                                { onError: (err) => toast({ message: errorText(err), domain: 'warning' }) },
                              )
                          }}
                          className={cn('h-[36px] text-[14px]', changed && 'bg-amber text-fill-ink')}
                        >
                          <option value="">—</option>
                          {c.letterTable.map((r) => (
                            <option key={r.letter} value={r.letter}>
                              {r.letter}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="x py-2 text-right font-bold">
                        {l ? formatDecimal(letterPoints(l, c.letterTable) ?? 0, 1) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
    </>
  )
}

function Big({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="x text-[64px] leading-[.9] font-black">{value === null ? '—' : formatDecimal(value)}</span>
      <span className="cx opacity-70">{label}</span>
    </div>
  )
}
