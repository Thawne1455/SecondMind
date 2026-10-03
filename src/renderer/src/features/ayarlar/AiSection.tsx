import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { Download, FlaskConical, Trash2, X } from 'lucide-react'
import type { ClaudeTestResult, LocalModelInfo } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { formatBytes } from '../../lib/format'
import { useSetSetting, useSetting } from '../../lib/settings'
import {
  Button,
  Chip,
  cn,
  Field,
  IconButton,
  Input,
  Modal,
  SectionHeader,
  Skeleton,
  Textarea,
  useToast,
} from '../../ui'
import { useCollections, useSetCollectionAiExcluded } from '../bilgi/useKnowledge'
import { useAiStatus } from '../dokum/useAi'
import {
  useCancelDownload,
  useClaudeInfo,
  useClaudeTest,
  useDeleteModel,
  useDownloadModel,
  useLocalModel,
} from './useAiSetup'

// Ayarlar > AI (4e-1): profil ("Beni tanı"), varsayılan model, HIZLI (yerel model indir / sil), DERİN (Claude Code yolu,
// model adı, Test et), AI'a kapalı koleksiyonlar. Bölüm dili Rutinler / Okul ile aynı: başlık + satırlar, karo yok.

const PROFILE_MAX = 2000

export function AiSection() {
  const location = useLocation()
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (location.hash === '#ai') ref.current?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  return (
    <section ref={ref} id="ai" className="flex max-w-[980px] flex-col gap-5 pt-4">
      <SectionHeader
        title="AI"
        description="Dökümleri öneriye çevirir; hiçbir şeyi onaysız yazmaz."
      />
      <Profile />
      <DefaultModel />
      <FastModel />
      <DeepModel />
      <Excluded />
    </section>
  )
}

function Profile() {
  const profile = useSetting('aiProfile')
  const save = useSetSetting('aiProfile')
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? profile.data ?? ''

  function commit() {
    if (draft === null || draft === profile.data) return setDraft(null)
    save.mutate(draft.trim(), { onSuccess: () => setDraft(null) })
  }

  return (
    <Field
      label="Beni tanı"
      hint={`AI her işte bunu görür · ${value.length}/${PROFILE_MAX}${save.isSuccess && draft === null ? ' · kaydedildi' : ''}`}
      error={save.error ? errorText(save.error) : undefined}
    >
      <Textarea
        rows={4}
        maxLength={PROFILE_MAX}
        value={value}
        disabled={profile.isPending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder="Bilgisayar mühendisliği 3. sınıf. Runika adında bir Unity oyunu yapıyorum. Sabahları ders, akşamları proje."
      />
    </Field>
  )
}

function DefaultModel() {
  const model = useSetting('aiModel')
  const set = useSetSetting('aiModel')
  return (
    <div className="flex flex-col gap-2">
      <Label>Varsayılan model</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Chip selected={model.data === 'fast'} onClick={() => set.mutate('fast')}>
          HIZLI · yerel Qwen
        </Chip>
        <Chip selected={model.data === 'deep'} onClick={() => set.mutate('deep')}>
          DERİN · Claude Code
        </Chip>
        <span className="text-[13px] font-semibold text-ink3">
          Üst çubuktaki menüyle aynı. Resim ya da PDF olan dökümler her zaman DERİN ile işlenir.
        </span>
      </div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <span className="x text-[13px] font-extrabold uppercase">{children}</span>
}

type BadgeTone = 'green' | 'amber' | 'muted' | 'coral'

function Pill({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'cx inline-flex h-7 shrink-0 items-center rounded-full px-3 whitespace-nowrap',
        tone === 'green' && 'bg-green text-fill-ink',
        tone === 'amber' && 'bg-amber text-fill-ink',
        tone === 'muted' && 'bg-s3 text-ink2',
        tone === 'coral' && 'bg-coral text-white',
      )}
    >
      {children}
    </span>
  )
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[28px] bg-s2 p-5 [--btn-soft:var(--bg)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

function FastModel() {
  const model = useLocalModel()
  const download = useDownloadModel()
  const cancel = useCancelDownload()
  const [confirm, setConfirm] = useState(false)
  const m = model.data

  return (
    <Row>
      <div className="flex items-center gap-3">
        <span className="x font-black">HIZLI</span>
        <span className="font-bold">{m?.label ?? 'Yerel model'}</span>
        {m && <ModelBadge m={m} />}
        <span className="grow" />
        {m &&
          (m.download ? (
            <Button
              size="sm"
              variant="secondary"
              icon={X}
              loading={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              İptal
            </Button>
          ) : m.downloaded ? (
            <Button size="sm" variant="secondary" icon={Trash2} onClick={() => setConfirm(true)}>
              Sil
            </Button>
          ) : (
            <>
              {m.partial && (
                <IconButton
                  label="Yarım indirmeyi sil"
                  icon={Trash2}
                  size="sm"
                  onClick={() => setConfirm(true)}
                />
              )}
              <Button
                size="sm"
                variant="ai"
                icon={Download}
                loading={download.isPending}
                onClick={() => download.mutate()}
              >
                {m.partial ? 'Kaldığı yerden indir' : `İndir · ~${formatBytes(m.approxBytes)}`}
              </Button>
            </>
          ))}
      </div>
      {model.isPending && <Skeleton lines={1} />}
      {m?.download && <Progress downloaded={m.download.downloaded} total={m.download.total} />}
      {m && !m.download && (
        <span className="x text-[13px] font-semibold text-ink3">
          {m.downloaded
            ? `${formatBytes(m.bytes)} · ${m.path}${m.loaded ? ' · bellekte' : ''}`
            : m.partial
              ? `İndirme yarım kaldı; kaldığı yerden sürer · ${m.path}`
              : `Bilgisayarında çalışır, internet ve ücret gerektirmez. Bir kez indirilir: ${m.path}`}
        </span>
      )}
      {(m?.error || download.error) && (
        <span className="text-[14px] font-semibold text-t-coral">
          {m?.error ?? errorText(download.error)}
        </span>
      )}
      {m && <DeleteModelModal open={confirm} model={m} onClose={() => setConfirm(false)} />}
    </Row>
  )
}

function ModelBadge({ m }: { m: LocalModelInfo }) {
  if (m.download) return <Pill tone="amber">İndiriliyor</Pill>
  if (m.downloaded) return <Pill tone="green">İndirildi</Pill>
  return <Pill tone="muted">Yok</Pill>
}

function Progress({ downloaded, total }: { downloaded: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, downloaded / total) : 0
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Model indiriliyor"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className="h-2.5 grow overflow-hidden rounded-full bg-bg"
      >
        <div
          className="h-full rounded-full bg-amber transition-[width] duration-200"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="x w-[200px] shrink-0 text-right text-[13px] font-extrabold">
        {total > 0
          ? `%${Math.floor(ratio * 100)} · ${formatBytes(downloaded)} / ${formatBytes(total)}`
          : 'Başlıyor…'}
      </span>
    </div>
  )
}

function DeleteModelModal({
  open,
  model,
  onClose,
}: {
  open: boolean
  model: LocalModelInfo
  onClose: () => void
}) {
  const remove = useDeleteModel()
  const running = !!useAiStatus().data?.running
  const { toast } = useToast()

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      title={model.downloaded ? 'Modeli sil' : 'Yarım indirmeyi sil'}
      domain="warning"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant="danger"
            disabled={running}
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  onClose()
                  toast({
                    variant: 'band',
                    domain: 'dump',
                    title: 'AI',
                    message: 'Yerel model silindi.',
                  })
                },
              })
            }
          >
            Sil
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="m-0 text-ink2">
          {model.downloaded
            ? `${formatBytes(model.bytes)} yer açılır. HIZLI, model yeniden indirilene kadar çalışmaz.`
            : 'Yarım kalan indirme silinir; İndir baştan başlar.'}
          {model.loaded && ' Model şu an bellekte; önce bırakılır.'}
        </p>
        {running && (
          <p className="m-0 font-semibold text-t-coral">
            AI şu an çalışıyor. Bitince silebilirsin.
          </p>
        )}
        {remove.error && (
          <p className="m-0 font-semibold text-t-coral">{errorText(remove.error)}</p>
        )}
      </div>
    </Modal>
  )
}

function DeepModel() {
  const info = useClaudeInfo()
  const path = useSetting('aiClaudePath')
  const setPath = useSetSetting('aiClaudePath')
  const deepModel = useSetting('aiDeepModel')
  const setDeepModel = useSetSetting('aiDeepModel')
  const test = useClaudeTest()
  const [pathDraft, setPathDraft] = useState<string | null>(null)
  const [modelDraft, setModelDraft] = useState<string | null>(null)

  function commitPath() {
    if (pathDraft === null) return
    const next = pathDraft.trim().replace(/^"|"$/g, '') || null
    setPathDraft(null)
    if (next === (path.data ?? null)) return
    setPath.mutate(next, {
      onSuccess: () => {
        void info.refetch()
        test.reset()
      },
    })
  }

  function commitModel() {
    if (modelDraft === null) return
    const next = modelDraft.trim()
    setModelDraft(null)
    if (!next || next === deepModel.data) return
    setDeepModel.mutate(next, { onSuccess: () => test.reset() })
  }

  const found = info.data?.found
  const configured = info.data?.configured
  const pathHint = configured
    ? found
      ? 'Elle girilen yol kullanılıyor. Boşaltırsan otomatik aranır.'
      : undefined
    : found
      ? 'Otomatik bulundu. Başka bir claude.exe kullanmak için yolunu yaz.'
      : undefined
  const pathError =
    info.isSuccess && !found
      ? configured
        ? 'Bu yolda claude.exe yok.'
        : "Claude Code bulunamadı. Kurduysan claude.exe'nin yolunu yaz."
      : setPath.error
        ? errorText(setPath.error)
        : undefined

  return (
    <Row>
      <div className="flex items-center gap-3">
        <span className="x font-black">DERİN</span>
        <span className="font-bold">Claude Code</span>
        {info.isSuccess &&
          (found ? <Pill tone="green">Bulundu</Pill> : <Pill tone="coral">Yok</Pill>)}
        <span className="grow" />
        <Button
          size="sm"
          variant="secondary"
          icon={FlaskConical}
          loading={test.isPending}
          loadingLabel="Deneniyor"
          disabled={!found}
          onClick={() => test.mutate()}
        >
          Test et
        </Button>
      </div>
      <div className="flex items-start gap-3">
        <Field label="Yol" hint={pathHint} error={pathError} className="grow">
          <Input
            value={pathDraft ?? configured ?? ''}
            placeholder={found ?? 'C:\\Users\\…\\.local\\bin\\claude.exe'}
            spellCheck={false}
            maxLength={500}
            onChange={(e) => setPathDraft(e.target.value)}
            onBlur={commitPath}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="x bg-bg text-[14px]"
          />
        </Field>
        <Field label="Model" hint="sonnet, opus ya da tam ad" className="w-[220px]">
          <Input
            value={modelDraft ?? deepModel.data ?? ''}
            spellCheck={false}
            maxLength={80}
            onChange={(e) => setModelDraft(e.target.value)}
            onBlur={commitModel}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="bg-bg"
          />
        </Field>
      </div>
      {test.isPending && (
        <span className="text-[13px] font-semibold text-ink3">
          Claude Code'a kısa bir soru soruluyor; 10-30 saniye sürebilir.
        </span>
      )}
      {test.data && <TestResult r={test.data} />}
      {test.error && (
        <span className="text-[14px] font-semibold text-t-coral">{errorText(test.error)}</span>
      )}
    </Row>
  )
}

function TestResult({ r }: { r: ClaudeTestResult }) {
  const secs = `${(r.ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn`
  return (
    <div className="flex items-start gap-3">
      {r.ok ? <Pill tone="green">Çalışıyor</Pill> : <Pill tone="coral">Hata</Pill>}
      <span
        className={cn(
          'pt-0.5 text-[14px] font-semibold break-words',
          r.ok ? 'x text-ink2' : 'text-t-coral',
        )}
      >
        {r.ok ? `Sürüm ${r.version ?? '?'} · ${r.model} yanıt verdi · ${secs}` : r.error}
      </span>
    </div>
  )
}

function Excluded() {
  const collections = useCollections()
  const set = useSetCollectionAiExcluded()
  const list = collections.data ?? []
  const closed = list.filter((c) => c.aiExcluded).length

  return (
    <div className="flex flex-col gap-2">
      <Label>AI'a kapalı koleksiyonlar</Label>
      <span className="text-[14px] text-ink2">
        Seçtiğin koleksiyonlardaki notlar AI'a hiç gönderilmez. Tek bir notu Bilgi'de "AI'a kapalı"
        ile de kapatabilirsin.
      </span>
      {collections.isPending && <Skeleton lines={1} />}
      {collections.isSuccess && list.length === 0 && (
        <span className="text-ink3">Henüz koleksiyon yok.</span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {list.map((c) => (
          <Chip
            key={c.id}
            selected={c.aiExcluded}
            onClick={() => set.mutate({ id: c.id, aiExcluded: !c.aiExcluded })}
            title={
              c.aiExcluded
                ? 'AI bu koleksiyonu görmüyor. Açmak için tıkla.'
                : "AI'a kapatmak için tıkla"
            }
          >
            {c.name}
            <span className="ml-2 text-[12px] font-semibold opacity-60">
              {c.aiExcluded ? 'kapalı' : c.noteCount}
            </span>
          </Chip>
        ))}
        {closed > 0 && (
          <span className="text-[13px] font-semibold text-ink3">{closed} koleksiyon kapalı</span>
        )}
      </div>
      {set.error && <span className="font-semibold text-t-coral">{errorText(set.error)}</span>}
    </div>
  )
}
