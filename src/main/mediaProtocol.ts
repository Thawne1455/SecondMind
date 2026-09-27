import { net, protocol } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isMediaFileName } from './domain/media'

const SCHEME = 'sm-media'

/** `app.ready` öncesi çağrılmalı. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, stream: true } },
  ])
}

/**
 * Renderer dosya sistemine dokunmaz; resimleri `sm-media://m/<hash>.<ext>` ile ister.
 * Salt okunur, sadece `media/` klasörü ve sadece depo biçimindeki adlar.
 */
export function handleMediaProtocol(mediaDir: string): void {
  protocol.handle(SCHEME, (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname.slice(1))
    if (!isMediaFileName(name)) return new Response('Bulunamadı', { status: 404 })
    return net.fetch(pathToFileURL(join(mediaDir, name)).toString())
  })
}
