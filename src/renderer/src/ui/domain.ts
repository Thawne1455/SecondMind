/** Renk alanı söyler (TASARIM.md "Alan renkleri"). */
export type Domain = 'today' | 'dump' | 'projects' | 'school' | 'mind' | 'knowledge' | 'warning'

/**
 * Dolgulu yüzey: zemin + metin + üstündeki butonların renkleri.
 * `--ot-*` değişkenlerini Button'ın `onTile` / `onTileGhost` türleri okur;
 * beyaz metinli dolgularda (indigo, mercan) karo üstü butonlar beyaz olur.
 */
const DARK_TEXT = 'text-fill-ink'
const LIGHT_TEXT =
  'text-white [--ot-solid-bg:#FFFFFF] [--ot-solid-fg:#131316] [--ot-ghost-bg:rgba(19,19,22,.2)] [--ot-ghost-fg:#FFFFFF]'

export const DOMAIN_FILL: Record<Domain, string> = {
  today: `bg-indigo ${LIGHT_TEXT}`,
  dump: `bg-amber ${DARK_TEXT}`,
  projects: `bg-green ${DARK_TEXT}`,
  school: `bg-sky ${DARK_TEXT}`,
  mind: `bg-lilac ${DARK_TEXT}`,
  knowledge: `bg-teal ${DARK_TEXT}`,
  warning: `bg-coral ${LIGHT_TEXT}`,
}

/** Koyu zemin (akış bandı, bildirim) üstünde alan rengi metin olarak. */
export const DOMAIN_TEXT: Record<Domain, string> = {
  today: 'text-indigo',
  dump: 'text-amber',
  projects: 'text-green',
  school: 'text-sky',
  mind: 'text-lilac',
  knowledge: 'text-teal',
  warning: 'text-t-coral',
}

/** Koyu zemin üstündeki butonlar (akış bandı, bildirim). */
export const ON_BAND =
  'text-white [--ot-solid-bg:#FFFFFF] [--ot-solid-fg:#131316] [--ot-ghost-bg:rgba(255,255,255,.14)] [--ot-ghost-fg:#FFFFFF]'

/** Proje rengi gibi paletten gelen özel dolgu; üstündeki metin her iki temada #131316. */
export function customFill(color: string): {
  className: string
  style: { backgroundColor: string }
} {
  return { className: DARK_TEXT, style: { backgroundColor: color } }
}
