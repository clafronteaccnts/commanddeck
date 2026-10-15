import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code/testing'

import { devArgv, isWindowsPath, listeningPid, parsePort } from './register'

const NETSTAT = [
  '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1020',
  '  TCP    [::]:9002              [::]:0                 LISTENING       4488',
  '  TCP    127.0.0.1:19002        0.0.0.0:0              LISTENING       777',
  '  TCP    127.0.0.1:9002         127.0.0.1:50211        ESTABLISHED     4488',
].join('\n')

function world(on: On, opts: { pkg?: object } = {}) {
  mock.store(on)
  mock.clock(on, { now: 1_800_000_000_000 })
  on('command.register', () => ({ value: {} }) as never)
  on('session.cwd', () => ({ value: 'C:\\work\\my-app' }) as never)
  on('fs.read', () => (opts.pkg ? { value: JSON.stringify(opts.pkg) } : { deny: 'no such file' }) as never)
  on('ui.open', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
}

const start = ($: any) => $.session.start({ source: 'startup', cwd: 'C:\\work\\my-app' } as never)

test('finding the dev port', () => {
  expect(parsePort('next dev -p 9002')).toBe(9002)
  expect(parsePort('vite --port=5173')).toBe(5173)
  expect(parsePort('cross-env PORT=3001 node server.js')).toBe(3001)
  expect(parsePort('next dev')).toBeNull()
  expect(parsePort(undefined)).toBeNull()
})

test('the command suits the platform', () => {
  expect(isWindowsPath('C:\\work\\my-app')).toBe(true)
  expect(isWindowsPath('/home/me/my-app')).toBe(false)
  expect(devArgv('C:\\work\\my-app')).toEqual(['npm.cmd', 'run', 'dev'])
  expect(devArgv('/home/me/my-app')).toEqual(['npm', 'run', 'dev'])
})

test('finding the process listening on the port', () => {
  expect(listeningPid(NETSTAT, 9002, true)).toBe(4488)
  expect(listeningPid(NETSTAT, 9003, true)).toBeNull()
  expect(listeningPid('4488\n', 9002, false)).toBe(4488)
  expect(listeningPid('', 9002, false)).toBeNull()
})

test('starting without a dev script says so', async ($, on) => {
  world(on, { pkg: { version: '1.0.0', scripts: {} } })
  await start($)
  const r = await $.command.run({ command: 'dev', args: 'start' })
  expect(String((r as { text?: string }).text)).toMatch(/no "dev" script/)
})

test('stopping when nothing was started says so', async ($, on) => {
  world(on)
  await start($)
  const r = await $.command.run({ command: 'dev', args: 'stop' })
  expect(String((r as { text?: string }).text)).toMatch(/No dev server started from here/)
})
