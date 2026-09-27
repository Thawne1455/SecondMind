import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels, THEME_ARG_PREFIX, type IpcChannel } from '@shared/ipc-channels'
import type { WindowApi } from '@shared/ipc'

const themeArg = process.argv.find((a) => a.startsWith(THEME_ARG_PREFIX))

const api: WindowApi = {
  invoke: (channel, input) => {
    if (!(ipcChannels as readonly IpcChannel[]).includes(channel))
      throw new Error(`Bilinmeyen kanal: ${channel}`)
    return ipcRenderer.invoke(channel, input)
  },
  initialTheme: themeArg?.slice(THEME_ARG_PREFIX.length) === 'dark' ? 'dark' : 'light',
}

contextBridge.exposeInMainWorld('api', api)
