/** Yazı alanında ya da açık bir pencere varken tek tuş kısayolları (B, P) çalışmaz. */
export function typingOrDialog(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return (
    el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
    !!document.querySelector('dialog[open]')
  )
}
