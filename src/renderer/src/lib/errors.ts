/** IPC hataları "Error invoking remote method 'x': Error: <mesaj>" biçiminde gelir; mesajı ayıklar. */
export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^.*Error: /, '')
}
