import { ipcMain } from 'electron'
import { ipcContract, type IpcChannel, type IpcOutput } from '@shared/ipc'
import type { z } from 'zod'

type ParsedInput<C extends IpcChannel> = z.output<(typeof ipcContract)[C]['input']>

/** Kanal için handler kaydeder; girdi her zaman sözleşmedeki zod şemasıyla doğrulanır. */
export function handle<C extends IpcChannel>(
  channel: C,
  fn: (input: ParsedInput<C>) => IpcOutput<C> | Promise<IpcOutput<C>>,
): void {
  ipcMain.handle(channel, (_event, raw: unknown) => {
    const input = ipcContract[channel].input.parse(raw) as ParsedInput<C>
    return fn(input)
  })
}
