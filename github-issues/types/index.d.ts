export type Issue = { number: number; title: string; url: string; labels: string[] }

declare module 'claude-code' {
  interface PluginState {
    'github-issues': { issues: Issue[]; status: string }
  }
}
