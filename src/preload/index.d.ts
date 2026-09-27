import type { WindowApi } from '@shared/ipc'

declare global {
  interface Window {
    api: WindowApi
  }
}
