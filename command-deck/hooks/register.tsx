import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

import type { Limit, Snapshot } from '../types'

const snap = atom({ plugin: 'command-deck', key: 'snap' } as const, null)
const isCollapsed = atom({ plugin: 'command-deck', key: 'isCollapsed' } as const, false)
const model = atom({ plugin: 'command-deck', key: 'model' } as const, 'default')
const effort = atom({ plugin: 'command-deck', key: 'effort' } as const, 'default')
const warned = atom({ plugin: 'command-deck', key: 'warned' } as const, {})

// Owned by the auto-model and prompt-upgrade mods; read here only to show their state.
const autoModelIsOn = atom({ plugin: 'auto-model', key: 'isOn' } as const, false)
const upgradeIsArmed = atom({ plugin: 'prompt-upgrade', key: 'isArmed' } as const, false)

const GOLD = '#F2C46D'
const HAIR = '#262B33'
const MUTED = '#7D8590'
const TEXT = '#E6EDF3'
const GREEN = '#3DD68C'
const AMBER = '#E3B341'
const RED = '#F47067'
const DARK = '#0D1117'
const SLATE = '#262B33'

const TITLE = 'COMMAND DECK'
const REFRESH_MS = 60_000

const MODELS = [
  { value: 'default', label: 'Session default' },
  { value: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { value: 'claude-opus-5-5', label: 'Opus 5.5' },
  { value: 'claude-fable-5-1', label: 'Fable 5.1' },
]
const EFFORTS = [
  { value: 'default', label: 'Default' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
  { value: 'max', label: 'Max' },
]

export function parseGit(stdout: string): { branch: string | null; changed: number; ahead: number; behind: number } {
  let branch: string | null = null
  let ahead = 0
  let behind = 0
  let changed = 0
  for (const line of stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim()
      branch = head === '(detached)' ? 'detached' : head
    } else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) {
        ahead = Number(m[1])
        behind = Number(m[2])
      }
    } else if (line.trim() !== '' && !line.startsWith('#')) {
      changed += 1
    }
  }
  return { branch, changed, ahead, behind }
}

export function bar(percent: number, width: number): { on: string; off: string } {
  const cells = Math.max(4, width)
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * cells)
  return { on: '▰'.repeat(filled), off: '▱'.repeat(cells - filled) }
}

export function tone(percent: number): string {
  return percent >= 95 ? RED : percent >= 80 ? AMBER : GREEN
}

export function span(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`.replace('.0M', 'M')
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export function limitLabel(kind: string): string {
  if (kind === 'five_hour') return '5-HOUR'
  if (kind === 'seven_day') return 'WEEKLY'
  return kind.replace(/_/g, ' ').toUpperCase().slice(0, 10)
}

// The port a project's `dev` script serves on: `-p 9002`, `--port=9002`, `PORT=9002` and the like.
export function parsePort(script: unknown): number | null {
  if (typeof script !== 'string') return null
  const m = /(?:--port[= ]|-p[= ]?|\bPORT=)(\d{2,5})\b/.exec(script)
  const port = m ? Number(m[1]) : NaN
  return port > 0 && port < 65536 ? port : null
}

function modelLabel(id: string): string {
  const m = /(haiku|sonnet|opus|fable)-(\d+)-(\d+)/i.exec(id)
  if (!m) return id.toUpperCase()
  return `${m[1].toUpperCase()} ${m[2]}.${m[3]}`
}

function fit(text: string, columns: number): string {
  return text.length <= columns ? text : `${text.slice(0, Math.max(0, columns - 1))}…`
}

let isRefreshing = false

async function refresh($: Engine): Promise<void> {
  if (isRefreshing) return
  isRefreshing = true
  try {
    const now = await $.clock.now()
    const cwd = await $.session.cwd()
    const usage = await $.session.usage()
    let git = { branch: null as string | null, changed: null as number | null, ahead: 0, behind: 0 }
    try {
      const r = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { cwd, timeoutMs: 5000 })
      if (r.exitCode === 0) git = parseGit(r.stdout)
    } catch {
      // not a git folder, or git is missing
    }
    let commands: string[] = []
    try {
      commands = (await $.command.list()).map(c => c.name)
    } catch {
      // show no mod chips until the list is available
    }
    let isGitHub = false
    if (git.branch !== null) {
      try {
        const r = await $.process.run(['git', 'remote', 'get-url', 'origin'], { cwd, timeoutMs: 5000 })
        isGitHub = r.exitCode === 0 && /github\.com[:/]/i.test(r.stdout)
      } catch {
        // no origin remote
      }
    }
    let version: string | null = null
    let devPort: number | null = null
    try {
      const pkg = JSON.parse(await $.fs.read(`${cwd.replace(/[\\/]+$/, '')}/package.json`))
      if (typeof pkg.version === 'string') version = pkg.version
      devPort = parsePort(pkg.scripts?.dev)
    } catch {
      // no package.json, or it is not valid JSON
    }
    let isDevUp: boolean | null = null
    if (devPort !== null) {
      try {
        const r = await $.process.run(['curl', '-s', '-I', '-m', '2', '-w', '\n%{http_code}', `http://localhost:${devPort}`], { cwd, timeoutMs: 5000 })
        isDevUp = r.stdout.trim().split('\n').pop()?.trim() !== '000' && r.exitCode === 0
      } catch {
        isDevUp = false
      }
    }
    const limits: Limit[] = usage.rateLimits.map(l => ({
      kind: l.kind,
      percent: l.percentUsed,
      resetsAt: l.resetsAt ? Date.parse(l.resetsAt) : null,
    }))
    const next: Snapshot = {
      now,
      folder: cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? cwd,
      version,
      commands,
      isGitHub,
      devPort,
      isDevUp,
      branch: git.branch,
      changed: git.changed,
      ahead: git.ahead,
      behind: git.behind,
      startedAt: usage.startedAt,
      prompts: await $.session.turns(),
      costUsd: usage.cost?.usd ?? null,
      contextPercent: usage.context.percent ?? null,
      contextTokens: usage.context.tokens ?? null,
      contextWindow: usage.context.window,
      limits,
      model: await $.session.model(),
    }
    await update($, snap, () => next)
    await warn($, limits)
  } catch {
    // keep the last snapshot
  } finally {
    isRefreshing = false
  }
}

// One quiet toast per limit window at 80% and again at 95%.
async function warn($: Engine, limits: Limit[]): Promise<void> {
  const seen = await read($, warned)
  const marks: Record<string, number> = { ...seen }
  for (const l of limits) {
    const level = l.percent >= 95 ? 95 : l.percent >= 80 ? 80 : 0
    const key = `${l.kind}@${l.resetsAt ?? 0}`
    if (level > 0 && (marks[key] ?? 0) < level) {
      marks[key] = level
      $.ui.toast(`${limitLabel(l.kind).toLowerCase()} limit at ${Math.round(l.percent)}%`)
    }
  }
  await update($, warned, () => marks)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      await $.command.register({ name: 'deck', description: 'Collapse or expand the command deck' })
      await refresh($)
      $.clock.every(REFRESH_MS, () => void refresh($))
    } catch {
      // the band draws once a refresh lands
    }
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)
    return done
  })

  on('command.run', { command: 'deck' }, async $ => {
    try {
      const isNow = !(await read($, isCollapsed))
      await update($, isCollapsed, () => isNow)
      return { text: isNow ? 'Command deck collapsed.' : 'Command deck expanded.' }
    } catch {
      return { text: 'The command deck could not do that.' }
    }
  })

  // The model and effort picked on the deck apply to the main conversation's requests.
  on('turn.step', async function* ($, e, next) {
    let m = 'default'
    let f = 'default'
    try {
      if (e.agentId === undefined) {
        m = await read($, model)
        f = await read($, effort)
      }
    } catch {
      // send the request as it is
    }
    return yield* next({
      ...e,
      ...(m !== 'default' ? { model: m } : {}),
      ...(f !== 'default' ? { effort: f as 'low' | 'medium' | 'high' | 'xhigh' | 'max' } : {}),
    })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button, Select } = $.ui.resolve(e)
    const cols = Math.max(40, e.props.bodyColumns)
    const s = await read($, snap)
    const collapsed = await read($, isCollapsed)
    const m = await read($, model)
    const f = await read($, effort)
    const isAuto = await read($, autoModelIsOn)
    const isArmed = await read($, upgradeIsArmed)

    // A chip only shows when the mod that serves its command is installed.
    const has = (name: string) => (s?.commands ?? []).some(c => c === name || c.endsWith(`:${name}`))

    const chip = (key: string, label: string, onPress: () => void, isActive = false, dot?: string) => (
      <Button key={key} plain onPress={onPress}>
        <Text backgroundColor={isActive ? GOLD : SLATE} color={isActive ? DARK : TEXT} bold={isActive}>{' '}</Text>
        {dot !== undefined && <Text backgroundColor={isActive ? GOLD : SLATE} color={dot}>{'● '}</Text>}
        <Text backgroundColor={isActive ? GOLD : SLATE} color={isActive ? DARK : TEXT} bold={isActive}>{`${label} `}</Text>
      </Button>
    )
    // Everything on the deck is one row tall and never wraps, so the band stays short and never scrolls.
    const dim = (text: string) => <Text color={MUTED} wrap="truncate">{text}</Text>
    const meter = (key: string, name: string, percent: number | null, detail: string, barCells: number) => (
      <Box key={key} flexDirection="row" flexShrink={0}>
        <Text color={MUTED} wrap="truncate">{`${name} `}</Text>
        {percent === null ? (
          <Text color={MUTED} wrap="truncate">waiting</Text>
        ) : (
          <Box flexDirection="row" flexShrink={0}>
            <Text color={tone(percent)}>{bar(percent, barCells).on}</Text>
            <Text color={HAIR}>{bar(percent, barCells).off}</Text>
            <Text color={tone(percent)} bold wrap="truncate">{` ${Math.round(percent)}%`}</Text>
            {detail !== '' && <Text color={MUTED} wrap="truncate">{` ${detail}`}</Text>}
          </Box>
        )}
      </Box>
    )

    const modelName = m !== 'default' ? modelLabel(m) : s ? modelLabel(s.model) : ''
    const effortName = f !== 'default' ? f.toUpperCase() : ''
    const right = [isAuto ? 'AUTO' : '', modelName, effortName].filter(Boolean).join(' · ')
    const toggle = (
      <Button key="collapse" plain onPress={() => void update($, isCollapsed, v => !v)}>
        <Text color={MUTED}>{collapsed ? ' [+]' : ' [–]'}</Text>
      </Button>
    )

    const title = (
      <Box key="title" flexDirection="column" width={cols}>
        <Box flexDirection="row" justifyContent="space-between" width={cols}>
          <Text bold color={TEXT}>{TITLE}</Text>
          <Box flexDirection="row" flexShrink={0}>
            <Text color={GOLD} wrap="truncate">{right}</Text>
            {toggle}
          </Box>
        </Box>
        <Box flexDirection="row" width={cols} overflow="hidden">
          <Text color={GOLD}>{'━'.repeat(12)}</Text>
          <Text color={HAIR} wrap="truncate">{'─'.repeat(400)}</Text>
        </Box>
      </Box>
    )

    if (collapsed) {
      const ctx = s?.contextPercent
      const five = s?.limits.find(l => l.kind === 'five_hour')
      const bits = [
        s?.branch ? `⎇ ${s.branch}` : '',
        ctx != null ? `CTX ${Math.round(ctx)}%` : '',
        five ? `5H ${Math.round(five.percent)}%` : '',
        s?.costUsd != null ? `$${s.costUsd.toFixed(2)}` : '',
      ].filter(Boolean)
      return (
        <Box flexDirection="row" justifyContent="space-between" width={cols}>
          <Box flexDirection="row">
            <Text bold color={TEXT}>{TITLE}</Text>
            <Text color={MUTED}>{fit(`   ${bits.join('   ')}`, Math.max(0, cols - TITLE.length - 12))}</Text>
          </Box>
          <Box flexDirection="row">
            <Text color={GOLD}>{fit(right, 20)}</Text>
            {toggle}
          </Box>
        </Box>
      )
    }

    const rows: unknown[] = [title]

    if (s !== null) {
      const where = [
        s.version ? `${s.folder} v${s.version}` : s.folder,
        s.branch ? `⎇ ${s.branch}` : '',
        s.changed != null ? `● ${s.changed} changed` : '',
        s.ahead > 0 ? `↑${s.ahead}` : '',
        s.behind > 0 ? `↓${s.behind}` : '',
      ].filter(Boolean).join('  ')
      const dev = s.devPort !== null ? (
        <Text key="dev" color={s.isDevUp ? GREEN : RED} wrap="truncate">{`  dev :${s.devPort} ${s.isDevUp ? 'up' : 'down'}`}</Text>
      ) : null
      const session = [
        span(s.now - s.startedAt),
        `${s.prompts} prompt${s.prompts === 1 ? '' : 's'}`,
        s.costUsd != null ? `$${s.costUsd.toFixed(2)}` : '',
      ].filter(Boolean).join(' · ')
      rows.push(
        <Box key="where" flexDirection="row" justifyContent="space-between" width={cols}>
          <Box flexShrink={1} flexDirection="row"><Text color={TEXT} wrap="truncate">{where}</Text>{dev}</Box>
          <Box flexShrink={0}>{dim(`  ${session}`)}</Box>
        </Box>,
      )

      // All meters share one row; the bars shrink to fit, and the reset countdowns drop on a narrow band.
      const short: Record<string, string> = { five_hour: '5H', seven_day: 'WK' }
      const meters: [string, string, number | null, string][] = [
        ['ctx', 'CTX', s.contextPercent, s.contextTokens != null ? `${tokens(s.contextTokens)}/${tokens(s.contextWindow)}` : ''],
        ...s.limits.map(l => [l.kind, short[l.kind] ?? limitLabel(l.kind), l.percent, l.resetsAt ? span(l.resetsAt - s.now) : ''] as [string, string, number, string]),
      ]
      const isRoomy = cols >= 110
      const barCells = isRoomy ? 10 : 6
      rows.push(
        <Box key="usage" flexDirection="row" gap={3} width={cols} overflow="hidden">
          {meters.map(([key, name, pct, detail]) => meter(key, name, pct, isRoomy || key !== 'ctx' ? detail : '', barCells))}
        </Box>,
      )
    }

    const modelValue = isAuto ? 'auto' : m
    const modelOptions = isAuto ? [{ value: 'auto', label: 'Auto' }, ...MODELS] : MODELS
    rows.push(
      <Box key="mods" flexDirection="row" justifyContent="space-between" width={cols}>
        <Box flexDirection="row" gap={1} flexShrink={0}>
          {s?.isGitHub && has('issues') && chip('issues', 'Issues', () => void $.command.run({ command: 'issues' }))}
          {has('dev') && s?.devPort != null && chip('dev', s.isDevUp ? 'Stop dev' : 'Start dev', () => void $.command.run({ command: 'dev', args: s.isDevUp ? 'stop' : 'start' }), s.isDevUp === true)}
          {has('better') && chip('better',isArmed ? 'Prompt Upgrade · armed' : 'Prompt Upgrade', () => void $.command.run({ command: 'better', args: 'arm' }), isArmed)}
          {has('automodel') && chip('automodel',isAuto ? 'Auto Model · on' : 'Auto Model', () => void $.command.run({ command: 'automodel', args: 'toggle' }), isAuto, isAuto ? DARK : undefined)}
        </Box>
        <Box flexDirection="row" gap={1} flexShrink={0}>
          <Select
            key="model"
            label="Model "
            options={modelOptions}
            value={modelValue}
            onSelect={v => {
              if (v === 'auto') {
                if (!isAuto) void $.command.run({ command: 'automodel', args: 'on' })
                return
              }
              void update($, model, () => v)
              if (isAuto) void $.command.run({ command: 'automodel', args: 'off' })
            }}
          />
          <Select key="effort" label="Effort " options={EFFORTS} value={f} onSelect={v => void update($, effort, () => v)} />
        </Box>
      </Box>,
    )

    return (
      <Box flexDirection="column" width={cols}>
        {rows}
      </Box>
    )
  })
}
