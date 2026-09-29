import { net, protocol } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { relativeInside } from './domain/docTemplates'
import { isMediaFileName } from './domain/media'
import { assetKind } from './domain/shots'

const SCHEME = 'sm-media'
/** Proje klasöründeki varlıklar (5d-4): kopyalanmadan, salt okunur. */
const FILE_SCHEME = 'sm-file'

/** `app.ready` öncesi çağrılmalı (bütün şemalar tek çağrıda). */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, stream: true } },
    { scheme: FILE_SCHEME, privileges: { standard: true, secure: true, stream: true } },
  ])
}

/**
 * `sm-file://f/<klasör id>/<göreli yol>`: sadece bağlı proje klasörlerinin içi ve sadece görsel, ses ve PDF.
 * Klasör id'si DB'den çözülür; `..` ile dışarı çıkan yol reddedilir.
 */
export function handleProjectFileProtocol(folderPath: (folderId: string) => string | null): void {
  protocol.handle(FILE_SCHEME, (request) => {
    const [folderId = '', ...rest] = new URL(request.url).pathname.slice(1).split('/')
    const root = folderPath(folderId)
    const rel = rest.map((p) => decodeURIComponent(p)).join('/')
    const file = root ? join(root, rel) : null
    if (!root || !file || !relativeInside(root, file) || assetKind(rel) === 'other')
      return new Response('Bulunamadı', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
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
