import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

import type { DevState } from '../types'

const PANE = 'dev-server'
const LOG_LINES = 200
const STOP_WAIT_MS = 4000

const state = atom({ plugin: 'dev-server', key: 'state' } as const, 'stopped')
const port = atom({ plugin: 'dev-server', key: 'port' } as const, null)
const log = atom({ plugin: 'dev-server', key: 'log' } as const, [])

// The dev server this mod started. Only that one can be stopped from here.
let child: AsyncGenerator<unknown> | null = null
let startedPort: number | null = null

// The port a project's `dev` script serves on: `-p 9002`, `--port=9002`, `PORT=9002` and the like.
export function parsePort(script: unknown): number | null {
  if (typeof script !== 'string') return null
  const m = /(?:--port[= ]|-p[= ]?|\bPORT=)(\d{2,5})\b/.exec(script)
  const value = m ? Number(m[1]) : NaN
  return value > 0 && value < 65536 ? value : null
}

export function isWindowsPath(cwd: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(cwd) || cwd.startsWith('\\\\')
}

// npm is a .cmd script on Windows, which cannot be started without a shell.
export function devArgv(cwd: string): string[] {
  return [isWindowsPath(cwd) ? 'npm.cmd' : 'npm', 'run', 'dev']
}

// The process listening on `port`, from `netstat -ano -p tcp` output (Windows) or `lsof -ti` output.
export function listeningPid(output: string, listenPort: number, isWindows: boolean): number | null {
  if (!isWindows) {
    const pid = Number(output.trim().split('\n')[0])
    return Number.isInteger(pid) && pid > 0 ? pid : null
  }
  for (const line of output.split('\n')) {
    const cols = line.trim().split(/\s+/)
    if (cols.length >= 5 && cols[3] === 'LISTENING' && cols[1].endsWith(`:${listenPort}`)) {
      const pid = Number(cols[4])
      if (Number.isInteger(pid) && pid > 0) return pid
    }
  }
  return null
}

async function isUp($: Engine, cwd: string, devPort: number): Promise<boolean> {
  try {
    const r = await $.process.run(['curl', '-s', '-I', '-m', '2', '-w', '\n%{http_code}', `http://localhost:${devPort}`], { cwd, timeoutMs: 5000 })
    return r.exitCode === 0 && r.stdout.trim().split('\n').pop()?.trim() !== '000'
  } catch {
    return false
  }
}

// `npm run dev` leaves children behind it, so after the child is closed, stop what still listens on the port.
async function stopListener($: Engine, cwd: string, devPort: number): Promise<void> {
  const isWindows = isWindowsPath(cwd)
  try {
    const found = isWindows
      ? await $.process.run(['netstat', '-ano', '-p', 'tcp'], { cwd, timeoutMs: 5000 })
      : await $.process.run(['lsof', '-ti', `tcp:${devPort}`, '-sTCP:LISTEN'], { cwd, timeoutMs: 5000 })
    const pid = listeningPid(found.stdout, devPort, isWindows)
    if (pid === null) return
    await $.process.run(isWindows ? ['taskkill', '/PID', String(pid), '/T', '/F'] : ['kill', String(pid)], { cwd, timeoutMs: 5000 })
  } catch {
    // nothing was listening, or the tool is missing
  }
}

async function say($: Engine, text: string): Promise<void> {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length > 0) await update($, log, old => [...old, ...lines].slice(-LOG_LINES))
}

async function start($: Engine): Promise<string> {
  if (child !== null) return `The dev server is already ${await read($, state)} on :${startedPort}.`
  const cwd = await $.session.cwd()
  let script: unknown
  try {
    script = JSON.parse(await $.fs.read(`${cwd.replace(/[\\/]+$/, '')}/package.json`)).scripts?.dev
  } catch {
    return 'No package.json found in this folder.'
  }
  if (typeof script !== 'string') return 'package.json has no "dev" script.'
  const devPort = parsePort(script)
  if (devPort !== null && (await isUp($, cwd, devPort))) return `Something is already serving on :${devPort}; stop it first.`

  startedPort = devPort
  await update($, port, () => devPort)
  await update($, log, () => [])
  await update($, state, () => 'starting' as DevState)
  const run = $.process.spawn({ argv: devArgv(cwd), cwd })
  child = run
  void (async () => {
    try {
      for await (const piece of run) {
        const chunk = piece as { text?: string }
        if (chunk.text !== undefined) {
          await say($, chunk.text)
          if ((await read($, state)) === 'starting') await update($, state, () => 'running' as DevState)
        }
      }
    } catch (err) {
      await say($, `The dev server stopped: ${String(err).slice(0, 200)}`)
    } finally {
      if (child === run) {
        child = null
        await update($, state, () => 'stopped' as DevState)
      }
    }
  })()
  return devPort !== null ? `Starting the dev server on :${devPort}.` : 'Starting the dev server.'
}

async function stop($: Engine): Promise<string> {
  const run = child
  if (run === null) return 'No dev server started from here is running. One started in a terminal has to be stopped there.'
  const cwd = await $.session.cwd()
  child = null
  try {
    await Promise.race([run.return(undefined), new Promise(r => setTimeout(r, STOP_WAIT_MS))])
  } catch {
    // already gone
  }
  if (startedPort !== null) await stopListener($, cwd, startedPort)
  await update($, state, () => 'stopped' as DevState)
  return 'Dev server stopped.'
}

async function dispatch($: Engine, args: string): Promise<string> {
  const word = args.trim().split(/\s+/)[0] ?? ''
  const current = await read($, state)
  if (word === 'start') return start($)
  if (word === 'stop') return stop($)
  if (word === 'restart') {
    if (child !== null) await stop($)
    return start($)
  }
  if (word === '' || word === 'toggle') return current === 'stopped' ? start($) : stop($)
  if (word === 'status') return current === 'stopped' ? 'The dev server is not running from here.' : `The dev server is ${current} on :${startedPort}.`
  return 'Use /dev start, stop, restart or status.'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dev', description: 'Start, stop or restart the dev server (start | stop | restart | status)' })
    return next(e)
  })

  on('command.run', { command: 'dev' }, async ($, e) => {
    try {
      const text = await dispatch($, String(e.args ?? ''))
      if (String(e.args ?? '').trim() === '') await $.ui.open({ id: PANE, title: 'Dev server' })
      return { text }
    } catch {
      return { text: 'The dev server command could not do that.' }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = await read($, state)
    const devPort = await read($, port)
    const lines = await read($, log)
    const run = (args: string) => () => void $.command.run({ command: 'dev', args })

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          {current === 'stopped' ? <Button onPress={run('start')}>Start</Button> : <Button onPress={run('stop')}>Stop</Button>}
          {current !== 'stopped' && <Button onPress={run('restart')}>Restart</Button>}
          <Text dimColor>{current === 'stopped' ? 'stopped' : `${current}${devPort !== null ? ` on :${devPort}` : ''}`}</Text>
        </Box>
        {lines.slice(-30).map((line, i) => (
          <Text key={String(i)} wrap="truncate">{line}</Text>
        ))}
      </Box>
    )
  })
}
