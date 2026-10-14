export type Limit = { kind: string; percent: number; resetsAt: number | null }

export type Snapshot = {
  now: number
  folder: string
  branch: string | null
  changed: number | null
  ahead: number
  behind: number
  startedAt: number
  prompts: number
  costUsd: number | null
  contextPercent: number | null
  contextTokens: number | null
  contextWindow: number
  limits: Limit[]
  model: string
}

declare module 'claude-code' {
  interface PluginState {
    'command-deck': {
      snap: Snapshot | null
      isCollapsed: boolean
      model: string
      effort: string
      warned: Record<string, number>
    }
  }
}
