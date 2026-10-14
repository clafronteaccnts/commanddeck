export type Question = { text: string; options: string[] }

export type Run = {
  id: string
  step: 'input' | 'reading' | 'questions' | 'rewrite' | 'review' | 'error'
  isBusy: boolean
  isFromHistory: boolean
  original: string
  questions: Question[]
  answers: Record<string, string | null>
  otherFor: number
  upgraded: string
  added: string[]
  isEditing: boolean
  failedStage: '' | 'questions' | 'rewrite'
}

export type HistoryItem = {
  id: string
  original: string
  upgraded: string
  added: string[]
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-upgrade': {
      run: Run | null
      view: 'run' | 'history'
      isArmed: boolean
      isAuto: boolean
      history: HistoryItem[]
    }
  }
}
