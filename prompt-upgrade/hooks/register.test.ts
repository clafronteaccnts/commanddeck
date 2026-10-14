import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code/testing'

import { isIntercepted, parseQuestions, parseRewrite } from './register'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const QUESTIONS = JSON.stringify({
  questions: [
    { text: 'Who is it for?', options: ['Beginners', 'Experts'] },
    { text: 'How long?', options: ['Short', 'Medium', 'Long'] },
  ],
})
const REWRITE = JSON.stringify({ prompt: 'Write a short guide for beginners on [topic].', added: ['Audience', 'Length'] })

type Seen = { filled: string[]; submitted: string[]; opened: number; closed: number }

function world(on: On, replies: { questions?: string; rewrite?: string; isFailing?: boolean; isNarrow?: boolean } = {}): Seen {
  const seen: Seen = { filled: [], submitted: [], opened: 0, closed: 0 }
  mock.store(on)
  mock.clock(on, { now: 1_700_000_000_000 })
  on('command.register', () => ({ value: {} }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('model.complete', (_$, e) => {
    if (replies.isFailing) return { value: { isAnswered: false, reason: 'empty-reply' } } as never
    const isQuestions = String(e.system ?? '').includes('multiple-choice')
    const text = isQuestions ? (replies.questions ?? QUESTIONS) : (replies.rewrite ?? REWRITE)
    return { value: { isAnswered: true, text, usage: USAGE } } as never
  })
  on('ui.open', () => {
    seen.opened += 1
    return { value: replies.isNarrow ? { isPlaced: false, reason: 'too-narrow' } : { isPlaced: true } } as never
  })
  on('ui.close', () => {
    seen.closed += 1
    return { value: undefined } as never
  })
  on('prompt.fill', (_$, e) => {
    seen.filled.push(e.text)
    return { isFilled: true } as never
  })
  on('prompt.submit', (_$, e) => {
    seen.submitted.push(e.text)
    return { text: e.text }
  })
  return seen
}

const typed = (text: string, extra: Record<string, unknown> = {}) =>
  ({ text, wait: false, origin: { kind: 'composer' }, ...extra }) as never

const PANE_PROPS = {
  title: 'Prompt Upgrade',
  isFocused: false,
  bodyColumns: 100,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as never

const mountPane = ($: any, columns = 100, surface: 'desktop' | 'terminal' = 'desktop') =>
  $.ui.mount({
    plugin: 'prompt-upgrade',
    surface,
    component: 'Pane',
    props: { ...(PANE_PROPS as object), bodyColumns: columns } as never,
    requestId: 'prompt-upgrade',
  })

const wait = async (pane: any, query: Record<string, unknown>) => {
  for (let i = 0; i < 50; i += 1) {
    const found = await pane.find(query)
    if (found) return found
    await new Promise(r => setTimeout(r, 10))
  }
  return undefined
}

const better = ($: any, args: string) =>
  $.command.run({ command: 'better', args, origin: { kind: 'composer' }, presentation: {} } as never)

test('which prompts are intercepted and which pass through', () => {
  const on = { isArmed: false, isAuto: true }
  const base = { wait: false }
  expect(isIntercepted('write me a poem about autumn', base, on)).toBe('upgrade')
  expect(isIntercepted('/compact', base, on)).toBe('pass')
  expect(isIntercepted('look at this', { ...base, attachments: [{ type: 'image' }] }, on)).toBe('pass')
  expect(isIntercepted('also do this', { ...base, turnId: 't1' }, on)).toBe('pass')
  expect(isIntercepted('also do this', { wait: true }, on)).toBe('pass')
  expect(isIntercepted('yes', base, on)).toBe('pass')
  expect(isIntercepted('keep going', base, on)).toBe('pass')
  expect(isIntercepted('> send exactly this', base, on)).toBe('strip')
  expect(isIntercepted('write me a poem', base, { isArmed: false, isAuto: false })).toBe('pass')
  expect(isIntercepted('yes', base, { isArmed: true, isAuto: false })).toBe('upgrade')
})

test('reading the questions', () => {
  expect(parseQuestions(QUESTIONS).length).toBe(2)
  expect(parseQuestions('noise ' + QUESTIONS + ' trailing')[0].options).toEqual(['Beginners', 'Experts'])
  expect(parseQuestions('not json')).toEqual([])
  expect(parseQuestions('{"questions":[{"text":"x","options":["only one"]}]}')).toEqual([])
  const many = { questions: [1, 2, 3, 4].map(n => ({ text: `q${n}`, options: ['a', 'b', 'c', 'd', 'e'] })) }
  const out = parseQuestions(JSON.stringify(many))
  expect(out.length).toBe(3)
  expect(out[0].options.length).toBe(4)
})

test('reading the rewrite', () => {
  expect(parseRewrite(REWRITE)?.prompt).toBe('Write a short guide for beginners on [topic].')
  expect(parseRewrite(REWRITE)?.added).toEqual(['Audience', 'Length'])
  expect(parseRewrite('Just plain text')?.prompt).toBe('Just plain text')
  expect(parseRewrite('   ')).toBeUndefined()
})

test('the on and off switch', async ($, on) => {
  const seen = world(on)
  expect((await better($, 'on')).text).toContain('is on')
  const verdict = await $.prompt.submit(typed('write me a poem about autumn'))
  expect(verdict.drop).toBeDefined()
  expect(seen.submitted).toEqual([])
  await new Promise(r => setTimeout(r, 60))
  expect((await better($, 'off')).text).toContain('is off')
  await $.prompt.submit(typed('write me a poem about autumn'))
  expect(seen.submitted).toEqual(['write me a poem about autumn'])
})

test('a prompt goes through untouched while the mod is off', async ($, on) => {
  const seen = world(on)
  await $.prompt.submit(typed('write me a poem about autumn'))
  expect(seen.submitted).toEqual(['write me a poem about autumn'])
  expect(seen.opened).toBe(0)
})

test('armed for one prompt: only the next prompt is caught', async ($, on) => {
  const seen = world(on)
  expect((await better($, 'arm')).text).toContain('armed')
  expect((await $.prompt.submit(typed('first rough idea'))).drop).toBeDefined()
  await $.prompt.submit(typed('second rough idea'))
  expect(seen.submitted).toEqual(['second rough idea'])
  await new Promise(r => setTimeout(r, 60))
})

test('the full flow from /better to Run', async ($, on) => {
  const seen = world(on)
  expect((await better($, 'write a guide')).text).toContain('Upgrading')
  const pane = await mountPane($)
  expect(await wait(pane, { key: 'q0o0' })).toBeDefined()
  expect(seen.opened).toBe(1)
  await pane.press({ key: 'q0o0' })
  await pane.press({ key: 'q1skip' })
  expect(await wait(pane, { key: 'run' })).toBeDefined()
  await pane.press({ key: 'run' })
  await new Promise(r => setTimeout(r, 30))
  expect(seen.submitted).toEqual(['Write a short guide for beginners on [topic].'])
  expect(seen.closed).toBe(1)
  await pane.unmount()
})

test('no question needed: it goes straight to the rewrite', async ($, on) => {
  world(on, { questions: '{"questions":[]}' })
  await better($, 'write a guide')
  const pane = await mountPane($)
  expect(await wait(pane, { key: 'run' })).toBeDefined()
  await pane.unmount()
})

test('Cancel puts the original prompt back', async ($, on) => {
  const seen = world(on)
  await better($, 'write a guide')
  const pane = await mountPane($)
  await wait(pane, { key: 'q0o0' })
  await pane.press({ key: 'cancel' })
  await new Promise(r => setTimeout(r, 30))
  expect(seen.filled).toEqual(['write a guide'])
  expect(seen.closed).toBe(1)
  expect(seen.submitted).toEqual([])
  await pane.unmount()
})

test('a failed model call does not lose the prompt', async ($, on) => {
  const seen = world(on, { isFailing: true })
  await better($, 'write a guide')
  const pane = await mountPane($)
  expect(await wait(pane, { key: 'original' })).toBeDefined()
  expect(await wait(pane, { text: /Your prompt is safe/ })).toBeDefined()
  expect(seen.submitted).toEqual([])
  await pane.press({ key: 'original' })
  await new Promise(r => setTimeout(r, 30))
  expect(seen.submitted).toEqual(['write a guide'])
  await pane.unmount()
})

test('a narrow window puts the prompt back', async ($, on) => {
  const seen = world(on, { isNarrow: true })
  await better($, 'write a guide')
  await new Promise(r => setTimeout(r, 30))
  expect(seen.filled).toEqual(['write a guide'])
})

test('the review draws at a narrow and a wide width', async ($, on) => {
  world(on, { questions: '{"questions":[]}' })
  await better($, 'write a guide')
  for (const [columns, surface] of [[36, 'desktop'], [120, 'desktop'], [36, 'terminal'], [120, 'terminal']] as const) {
    const pane = await mountPane($, columns, surface)
    expect(await wait(pane, { key: 'run' })).toBeDefined()
    expect(await pane.find({ key: 'copy' })).toBeDefined()
    await pane.unmount()
  }
})
