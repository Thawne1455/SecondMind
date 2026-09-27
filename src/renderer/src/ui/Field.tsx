import { createContext, useContext, useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

type FieldContextValue = { id: string; describedBy?: string; invalid: boolean }
const FieldContext = createContext<FieldContextValue | null>(null)

/** Etiketi, ipucunu ve hatayı içindeki kontrole bağlar (id, aria-describedby). */
function useFieldControl(id: string | undefined) {
  const field = useContext(FieldContext)
  return {
    id: id ?? field?.id,
    'aria-describedby': field?.describedBy,
    'aria-invalid': field?.invalid || undefined,
  }
}

type FieldProps = {
  label: ReactNode
  /** Etiketin yanında "isteğe bağlı". */
  optional?: boolean
  hint?: ReactNode
  error?: ReactNode
  className?: string
  children: ReactNode
}

export function Field({ label, optional, hint, error, className, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <FieldContext value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="cx">
          {label}
          {optional && (
            <span className="ml-1.5 font-semibold tracking-normal text-ink3 normal-case [font-stretch:100%]">
              isteğe bağlı
            </span>
          )}
        </label>
        {children}
        {hint && (
          <span id={hintId} className="text-[13px] leading-[1.35] font-semibold text-ink3">
            {hint}
          </span>
        )}
        {error && (
          <span id={errorId} className="text-[13px] leading-[1.35] font-semibold text-t-coral">
            {error}
          </span>
        )}
      </div>
    </FieldContext>
  )
}

// Dolgulu alan; odakta 2px ink kenar ve bg zemin. /tasarim `data-force="focus"` ile sabitler.
const CONTROL =
  'w-full rounded-field border-2 border-transparent bg-s2 px-4 text-[15px] text-ink outline-none ' +
  'transition-[border-color,background-color] duration-150 placeholder:text-ink3 ' +
  'focus:border-ink focus:bg-bg data-[force=focus]:border-ink data-[force=focus]:bg-bg ' +
  'aria-invalid:border-t-coral disabled:cursor-not-allowed disabled:opacity-[.38]'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Kalın değer (tarih, saat, sıradaki adım gibi vurgulu alanlar). */
  strong?: boolean
  ref?: Ref<HTMLInputElement>
}

export function Input({ id, strong, className, ...rest }: InputProps) {
  const control = useFieldControl(id)
  return (
    <input
      {...control}
      className={cn(CONTROL, 'h-[46px]', strong ? 'font-bold' : 'font-medium', className)}
      {...rest}
    />
  )
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({ id, className, rows = 3, ...rest }: TextareaProps) {
  const control = useFieldControl(id)
  return (
    <textarea
      {...control}
      rows={rows}
      className={cn(CONTROL, 'resize-none py-3 leading-[1.5] font-medium', className)}
      {...rest}
    />
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }

export function Select({ id, className, children, ...rest }: SelectProps) {
  const control = useFieldControl(id)
  return (
    <div className="relative">
      <select
        {...control}
        className={cn(
          CONTROL,
          'h-[46px] cursor-pointer appearance-none pr-10 font-bold',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        strokeWidth={1.75}
        aria-hidden
        className="pointer-events-none absolute top-[15px] right-4"
      />
    </div>
  )
}
