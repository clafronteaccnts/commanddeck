export type Level = 'small' | 'everyday' | 'strong' | 'strongest'

declare module 'claude-code' {
  interface PluginState {
    'auto-model': { isOn: boolean; previous: string }
  }
}
