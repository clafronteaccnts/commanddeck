import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code/testing'

import { bar, limitLabel, parseGit, parsePort, span, tokens, tone } from './register'

const NOW = 1_800_000_000_000

const GIT = ['# branch.oid abc', '# branch.head extra/misc-work', '# branch.ab +2 -1', '1 .M N... 100644 100644 100644 a b src/x.ts', '? notes.txt', ''].join('\n')

function world(on: On, opts: { git?: string; isGitFailing?: boolean; pkg?: object; isDevUp?: boolean; remote?: string; limits?: { kind: string; percentUsed: number; resetsAt?: string }[] } = {}) {
  const seen = { commands: [] as string[], toasts: [] as string[] }
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('command.register', () => ({ value: {} }) as never)
  on('session.cwd', () => ({ value: 'C:\\work\\my-app' }) as never)
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as never)
  on('session.turns', () => ({ value: 3 }) as never)
  on('session.usage', () => ({
    value: {
      startedAt: NOW - 25 * 60_000,
      context: { tokens: 88_000, window: 1_000_000, percent: 9 },
      rateLimits: opts.limits ?? [
        { kind: 'five_hour', percentUsed: 51, resetsAt: new Date(NOW + 156 * 60_000).toISOString() },
        { kind: 'seven_day', percentUsed: 41, resetsAt: new Date(NOW + (3 * 24 + 22) * 3_600_000).toISOString() },
      ],
      cost: { usd: 0.2 },
    },
  }) as never)
  on('fs.read', () => (opts.pkg ? { value: JSON.stringify(opts.pkg) } : { deny: 'no such file' }) as never)
  on('process.run', (_$, e) => {
    if (e.argv[1] === 'remote') return { value: { exitCode: 0, stdout: `${opts.remote ?? 'https://github.com/example/my-app.git'}\n`, stderr: '' } } as never
    if (e.argv[0] === 'curl') return { value: opts.isDevUp ? { exitCode: 0, stdout: 'HTTP/1.1 200 OK\n\n200', stderr: '' } : { exitCode: 7, stdout: '\n000', stderr: '' } } as never
    return (opts.isGitFailing ? { value: { exitCode: 128, stdout: '', stderr: 'not a repo' } } : { value: { exitCode: 0, stdout: opts.git ?? GIT, stderr: '' } }) as never
  })
  on('ui.toast', (_$, e) => {
    seen.toasts.push(String((e as { text?: unknown }).text ?? e))
    return { value: undefined } as never
  })
  on('command.run', (_$, e) => {
    seen.commands.push(`${e.command} ${e.args}`.trim())
    return { text: 'ok' } as never
  })
  on('ui.render', () => ({ type: 'engine', ref: 'band' }) as never)
  on('session.start', (_$, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  return seen
}

const band = ($: any, surface: 'desktop' | 'terminal', columns: number) =>
  $.ui.mount({
    plugin: 'command-deck',
    surface,
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: columns, scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })

const start = ($: any) =>
  $.session.start({ source: 'startup', cwd: 'C:\\work\\my-app' } as never).catch((err: unknown) => {
    throw err
  })

test('reading git status', () => {
  expect(parseGit(GIT)).toEqual({ branch: 'extra/misc-work', changed: 2, ahead: 2, behind: 1 })
  expect(parseGit('# branch.head (detached)\n').branch).toBe('detached')
  expect(parseGit('').branch).toBeNull()
})

test('meters, colors and labels', () => {
  expect(bar(50, 10)).toEqual({ on: '▰▰▰▰▰', off: '▱▱▱▱▱' })
  expect(bar(150, 4).on.length).toBe(4)
  expect(tone(10)).toBe('#3DD68C')
  expect(tone(85)).toBe('#E3B341')
  expect(tone(97)).toBe('#F47067')
  expect(limitLabel('five_hour')).toBe('5-HOUR')
  expect(limitLabel('seven_day')).toBe('WEEKLY')
  expect(span(30_000)).toBe('<1m')
  expect(span(156 * 60_000)).toBe('2h 36m')
  expect(span((3 * 24 + 22) * 3_600_000)).toBe('3d 22h')
  expect(tokens(88_000)).toBe('88k')
  expect(tokens(1_000_000)).toBe('1M')
})

test('the deck draws its rows at narrow and wide widths on both surfaces', async ($, on) => {
  world(on)
  await start($)
  for (const surface of ['desktop', 'terminal'] as const) {
    for (const columns of [60, 140]) {
      const ui = await band($, surface, columns)
      expect(await ui.find({ text: /COMMAND DECK/ })).toBeDefined()
      expect(await ui.find({ text: /extra\/misc-work/ })).toBeDefined()
      expect(await ui.find({ text: /CTX/ })).toBeDefined()
      expect(await ui.find({ text: /5H/ })).toBeDefined()
      expect(await ui.find({ text: /2h 36m/ })).toBeDefined()
      expect(await ui.find({ text: /\$0\.20/ })).toBeDefined()
      expect(await ui.find({ key: 'issues' })).toBeDefined()
      expect(await ui.find({ key: 'model' })).toBeDefined()
      await ui.unmount()
    }
  }
})

test('the mod chips run their commands', async ($, on) => {
  const seen = world(on)
  await start($)
  const ui = await band($, 'desktop', 140)
  await ui.press({ key: 'issues' })
  await ui.press({ key: 'better' })
  await ui.press({ key: 'automodel' })
  expect(seen.commands).toEqual(['issues', 'better arm', 'automodel toggle'])
  await ui.unmount()
})

test('the Issues chip shows only for GitHub repos', async ($, on) => {
  world(on, { remote: 'https://gitlab.com/example/my-app.git' })
  await start($)
  const ui = await band($, 'desktop', 140)
  expect(await ui.find({ key: 'issues' })).toBeUndefined()
  await ui.unmount()
})

test('collapse to one line and back', async ($, on) => {
  world(on)
  await start($)
  const ui = await band($, 'desktop', 140)
  await ui.press({ key: 'collapse' })
  expect(await ui.find({ text: /CTX 9%/ })).toBeDefined()
  expect(await ui.find({ key: 'model' })).toBeUndefined()
  await ui.press({ key: 'collapse' })
  expect(await ui.find({ key: 'model' })).toBeDefined()
  await ui.unmount()
})

test('a limit near its cap warns once', async ($, on) => {
  const seen = world(on, { limits: [{ kind: 'five_hour', percentUsed: 86, resetsAt: new Date(NOW + 3_600_000).toISOString() }] })
  await start($)
  await $.turn.complete({ reason: 'end_turn', answer: 'done' } as never)
  await new Promise(r => setTimeout(r, 30))
  expect(seen.toasts.length).toBe(1)
})

test('finding the dev port', () => {
  expect(parsePort('next dev -p 9002')).toBe(9002)
  expect(parsePort('vite --port=5173')).toBe(5173)
  expect(parsePort('cross-env PORT=3001 node server.js')).toBe(3001)
  expect(parsePort('next dev')).toBeNull()
  expect(parsePort(undefined)).toBeNull()
})

test('the version and dev server show next to the folder', async ($, on) => {
  world(on, { pkg: { version: '1.2.3', scripts: { dev: 'next dev -p 9002' } } })
  await start($)
  const ui = await band($, 'desktop', 140)
  expect(await ui.find({ text: /my-app v1\.2\.3/ })).toBeDefined()
  expect(await ui.find({ text: /dev :9002 down/ })).toBeDefined()
  await ui.unmount()
})

test('a running dev server shows as up', async ($, on) => {
  world(on, { pkg: { version: '1.2.3', scripts: { dev: 'next dev -p 9002' } }, isDevUp: true })
  await start($)
  const ui = await band($, 'desktop', 140)
  expect(await ui.find({ text: /dev :9002 up/ })).toBeDefined()
  await ui.unmount()
})

test('without a dev port no server status shows', async ($, on) => {
  world(on, { pkg: { version: '1.2.3' } })
  await start($)
  const ui = await band($, 'desktop', 140)
  expect(await ui.find({ text: /dev :/ })).toBeUndefined()
  await ui.unmount()
})

test('without git the deck still draws', async ($, on) => {
  world(on, { isGitFailing: true })
  await start($)
  const ui = await band($, 'desktop', 100)
  expect(await ui.find({ text: /my-app/ })).toBeDefined()
  expect(await ui.find({ text: /CTX/ })).toBeDefined()
  await ui.unmount()
})
