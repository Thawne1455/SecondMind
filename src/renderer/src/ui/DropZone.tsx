import { useRef, useState, type DragEvent } from 'react'
import { Upload } from 'lucide-react'
import { cn } from './cn'

const SURFACE =
  'flex h-[88px] w-full items-center justify-center gap-2.5 rounded-[20px] border-2 border-dashed'

type DropZoneViewProps = { dragCount: number | null; label: string; className?: string }

/** Bırakma alanının görünüşü. /tasarim sürükleme durumunu bununla sabit gösterir. */
export function DropZoneView({ dragCount, label, className }: DropZoneViewProps) {
  if (dragCount !== null) {
    return (
      <div className={cn(SURFACE, 'border-fill-ink bg-amber text-fill-ink', className)}>
        <span className="x text-[18px] font-black uppercase">
          Bırak{dragCount > 0 && ` · ${dragCount} dosya`}
        </span>
      </div>
    )
  }
  return (
    <div className={cn(SURFACE, 'border-line font-semibold text-ink2', className)}>
      <Upload size={20} strokeWidth={1.75} aria-hidden />
      {label}
    </div>
  )
}

type DropZoneProps = {
  onFiles: (files: File[]) => void
  /** input[type=file] accept değeri, örn. "image/*,.pdf". */
  accept?: string
  multiple?: boolean
  label?: string
  className?: string
}

function hasFiles(e: DragEvent) {
  return e.dataTransfer.types.includes('Files')
}

/** Sürükle-bırak veya tıklayıp seç. Kesikli kenar; sürüklenirken amber ve "BIRAK · N DOSYA". */
export function DropZone({
  onFiles,
  accept,
  multiple = true,
  label = 'Resim ya da dosya bırak',
  className,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // İç öğelere girip çıkarken dragleave erken tetiklenmesin diye derinlik sayılır.
  const depth = useRef(0)
  const [dragCount, setDragCount] = useState<number | null>(null)

  function onDragEnter(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth.current += 1
    setDragCount(e.dataTransfer.items.length)
  }

  function onDragLeave(e: DragEvent) {
    if (!hasFiles(e)) return
    depth.current -= 1
    if (depth.current <= 0) {
      depth.current = 0
      setDragCount(null)
    }
  }

  function onDrop(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth.current = 0
    setDragCount(null)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(multiple ? files : files.slice(0, 1))
  }

  // input butonun dışında: içindeyken tıklaması butona kabarıp seçiciyi tekrar açardı.
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragOver={(e) => {
          if (hasFiles(e)) e.preventDefault()
        }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'block w-full cursor-pointer rounded-[20px] transition-colors duration-150 hover:bg-hover',
          'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo',
          className,
        )}
      >
        <DropZoneView dragCount={dragCount} label={label} className="pointer-events-none" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) onFiles(files)
          e.target.value = ''
        }}
      />
    </>
  )
}
