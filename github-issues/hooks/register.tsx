import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

import type { Issue } from '../types'

const PANE = 'github-issues'
const issues = atom({ plugin: 'github-issues', key: 'issues' } as const, [])
const status = atom({ plugin: 'github-issues', key: 'status' } as const, 'Not loaded yet.')

async function load($: Engine): Promise<void> {
  await update($, status, () => 'Loading...')
  try {
    const r = await $.process.run(
      ['gh', 'issue', 'list', '--state', 'open', '--limit', '50', '--json', 'number,title,url,labels'],
      { timeoutMs: 20000 },
    )
    if (r.exitCode !== 0) {
      await update($, status, () => `gh failed: ${r.stderr.trim().slice(0, 200)}`)
      return
    }
    const rows: Issue[] = JSON.parse(r.stdout).map((i: any) => ({
      number: i.number,
      title: i.title,
      url: i.url,
      labels: (i.labels ?? []).map((l: any) => l.name),
    }))
    await update($, issues, () => rows)
    await update($, status, () => (rows.length === 0 ? 'No open issues.' : `${rows.length} open`))
  } catch (err) {
    await update($, status, () => `Could not load issues: ${String(err).slice(0, 200)}`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'issues', description: 'Show open GitHub issues in a pane' })
    return next(e)
  })

  on('command.run', { command: 'issues' }, async $ => {
    await $.ui.open({ id: PANE, title: 'GitHub issues' })
    void load($)
    return { text: 'Issues pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const list = await read($, issues)
    const note = await read($, status)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Button onPress={() => void load($)}>Refresh</Button>
          <Text dimColor> {note}</Text>
        </Box>
        {list.map(i => (
          <Box flexDirection="row" key={String(i.number)}>
            <Button onPress={() => void $.prompt.fill({ text: `Work on issue #${i.number}: ${i.title}`, mode: 'replace' })}>
              Ask
            </Button>
            <Text> </Text>
            <Link href={i.url}>{`#${i.number} ${i.title}`}</Link>
            {i.labels.length > 0 && <Text dimColor> [{i.labels.join(', ')}]</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}
