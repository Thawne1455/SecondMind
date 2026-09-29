import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { errorText } from '../../lib/errors'
import { cn, IconButton, Skeleton } from '../../ui'

// Satır içi PDF görüntüleyici (pdf.js): solda sayfa küçük resimleri, sağda seçili sayfa kutu genişliğinde.
// Dosya baytları IPC ile gelir (`material:bytes`); renderer dosya sistemine dokunmaz. ← → sayfa değiştirir.

GlobalWorkerOptions.workerSrc = workerUrl

/** Küçük resim sayısı sınırı (çok sayfalı kitaplarda şerit yavaşlamasın). */
const THUMB_MAX = 80

type Props = { materialId: string; title: string; onClose: () => void; onOpenExternal: () => void }

export function PdfViewer({ materialId, title, onClose, onOpenExternal }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    let task: ReturnType<typeof getDocument> | null = null
    window.api
      .invoke('material:bytes', { id: materialId })
      .then((bytes) => {
        if (cancelled) return null
        task = getDocument({ data: bytes })
        return task.promise
      })
      .then((d) => {
        if (d && !cancelled) setDoc(d)
      })
      .catch((e: unknown) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [materialId])

  const pages = doc?.numPages ?? 0

  return (
    <section
      aria-label={`${title} PDF`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') setPage((p) => Math.min(pages, p + 1))
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPage((p) => Math.max(1, p - 1))
        else return
        e.preventDefault()
      }}
      className="flex flex-col gap-3 rounded-tile bg-s2 p-4 outline-none"
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 grow truncate font-bold">{title}</span>
        {pages > 0 && (
          <>
            <IconButton label="Önceki sayfa" icon={ChevronLeft} onClick={() => setPage((p) => Math.max(1, p - 1))} />
            <span className="x min-w-[64px] text-center text-[13px] font-bold">
              {page} / {pages}
            </span>
            <IconButton
              label="Sonraki sayfa"
              icon={ChevronRight}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            />
          </>
        )}
        <IconButton label="Varsayılan uygulamada aç" icon={ExternalLink} onClick={onOpenExternal} />
        <IconButton label="Kapat" icon={X} onClick={onClose} />
      </div>
      {error ? (
        <span className="font-semibold text-t-coral">PDF açılamadı: {error}</span>
      ) : !doc ? (
        <Skeleton className="h-[480px]" />
      ) : (
        <div className="flex h-[70vh] min-h-[420px] gap-3">
          <div className="flex w-[92px] shrink-0 flex-col gap-2 overflow-y-auto pr-1">
            {Array.from({ length: Math.min(pages, THUMB_MAX) }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Sayfa ${i + 1}`}
                aria-current={page === i + 1}
                onClick={() => setPage(i + 1)}
                className={cn(
                  'shrink-0 cursor-pointer rounded-lg bg-bg p-1 focus-visible:outline-3 focus-visible:outline-indigo',
                  page === i + 1 ? 'ring-3 ring-ink' : 'opacity-80 hover:opacity-100',
                )}
              >
                <PageCanvas doc={doc} page={i + 1} width={76} />
                <span className="x block text-center text-[11px] font-bold text-ink3">{i + 1}</span>
              </button>
            ))}
          </div>
          <div className="min-w-0 grow overflow-auto rounded-xl bg-bg">
            <FitPage doc={doc} page={page} />
          </div>
        </div>
      )}
    </section>
  )
}

/** Sayfa kutunun genişliğine sığar. */
function FitPage({ doc, page }: { doc: PDFDocumentProxy; page: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return <div ref={ref}>{width > 0 && <PageCanvas doc={doc} page={page} width={width} />}</div>
}

function PageCanvas({ doc, page, width }: { doc: PDFDocumentProxy; page: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | null = null
    void doc.getPage(page).then((p) => {
      const canvas = ref.current
      if (cancelled || !canvas) return
      const base = p.getViewport({ scale: 1 })
      const ratio = window.devicePixelRatio || 1
      const viewport = p.getViewport({ scale: (width / base.width) * ratio })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${width}px`
      canvas.style.height = `${Math.floor(viewport.height / ratio)}px`
      const render = p.render({ canvas, viewport })
      task = render
      render.promise.catch(() => {})
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, page, width])
  return <canvas ref={ref} className="block" />
}
