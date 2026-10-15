export type DevState = 'stopped' | 'starting' | 'running'

declare module 'claude-code' {
  interface PluginState {
    'dev-server': {
      state: DevState
      port: number | null
      log: string[]
    }
  }
}
