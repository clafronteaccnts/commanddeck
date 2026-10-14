import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code/testing'

import { guessLevel, isShortReply, readLevel } from './register'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const OPTIONS = ['haiku', 'sonnet', 'opus', 'fable']

type World = { model: string; sets: string[]; asked: string[]; calls: number }

function world(on: On, opts: { answer?: string; isFailing?: boolean; denied?: string[] } = {}): World {
  const w: World = { model: 'claude-opus-5-5', sets: [], asked: [], calls: 0 }
  mock.store(on)
  mock.clock(on, { now: 1_700_000_000_000 })
  on('command.register', () => ({ value: {} }) as never)
  on('session.model', () => ({ value: w.model }) as never)
  on('config.list', () => ({ value: [{ key: 'model', label: 'Model', kind: 'choice', value: w.model, options: OPTIONS, provider: { kind: 'engine' }, isLocked: false }] }) as never)
  on('config.set', (_$, e) => {
    if (opts.denied?.includes(String(e.value))) return { deny: 'not on this plan' }
    w.sets.push(String(e.value))
    w.model = `claude-${String(e.value)}`
    return { value: e.value }
  })
  on('model.complete', (_$, e) => {
    w.calls += 1
    w.asked.push(String(e.model))
    if (opts.isFailing) return { value: { isAnswered: false, reason: 'empty-reply' } } as never
    return { value: { isAnswered: true, text: opts.answer ?? 'small', usage: USAGE } } as never
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  return w
}

const typed = (text: string, extra: Record<string, unknown> = {}) =>
  ({ text, wait: false, origin: { kind: 'composer' }, ...extra }) as never

const auto = ($: any, args: string) =>
  $.command.run({ command: 'automodel', args, origin: { kind: 'composer' }, presentation: {} } as never)

test('reading the one-word answer', () => {
  expect(readLevel('small')).toBe('small')
  expect(readLevel(' Everyday.\n')).toBe('everyday')
  expect(readLevel('strong')).toBe('strong')
  expect(readLevel('STRONGEST')).toBe('strongest')
  expect(readLevel('I think it is everyday')).toBe('everyday')
  expect(readLevel('no idea')).toBeUndefined()
})

test('spotting a short reply', () => {
  for (const reply of ['yes', 'ok', 'keep going', 'do it', 'sounds good to me'.slice(0, 9), 'Yes.', 'go ahead']) {
    expect(isShortReply(reply)).toBe(true)
  }
  expect(isShortReply('please summarize this document for me')).toBe(false)
})

test('the word-based fallback', () => {
  expect(guessLevel('summarize this paragraph into two lines')).toBe('small')
  expect(guessLevel('draft a short email to my landlord')).toBe('everyday')
  expect(guessLevel('refactor the checkout flow across the repo')).toBe('strong')
  expect(guessLevel('something that is hard to put in a box at all')).toBe('strong')
  const huge = 'migrate the entire codebase from one framework to another over several hours, including every module and all the tests that depend on it'
  expect(guessLevel(huge)).toBe('strongest')
})

test('switching on a new prompt', async ($, on) => {
  const w = world(on, { answer: 'small' })
  expect((await auto($, 'on')).text).toContain('is on')
  await $.prompt.submit(typed('rename these files to lowercase names please'))
  expect(w.sets).toEqual(['haiku'])
  expect(w.asked).toEqual(['haiku'])
})

test('staying put on a short reply, a slash command and a message sent mid-turn', async ($, on) => {
  const w = world(on, { answer: 'small' })
  await auto($, 'on')
  await $.prompt.submit(typed('yes'))
  await $.prompt.submit(typed('/compact now please thanks'))
  await $.prompt.submit(typed('also rename the other files too please', { turnId: 't1' }))
  await $.prompt.submit(typed('also rename the other files too please', { wait: true }))
  await $.prompt.submit(typed('do the thing', { origin: { kind: 'plugin', name: 'other' } }))
  expect(w.calls).toBe(0)
  expect(w.sets).toEqual([])
})

test('nothing happens while it is off', async ($, on) => {
  const w = world(on)
  await $.prompt.submit(typed('rename these files to lowercase names please'))
  expect(w.calls).toBe(0)
  expect(w.sets).toEqual([])
})

test('going back to the earlier model when turned off', async ($, on) => {
  const w = world(on, { answer: 'small' })
  await auto($, 'on')
  await $.prompt.submit(typed('rename these files to lowercase names please'))
  expect(w.model).toBe('claude-haiku')
  expect((await auto($, 'off')).text).toContain('is off')
  expect(w.sets).toEqual(['haiku', 'opus'])
  expect(w.model).toBe('claude-opus')
  await $.prompt.submit(typed('rename these files to lowercase names please'))
  expect(w.calls).toBe(1)
})

test('a failed check falls back to a guess, strong when in doubt', async ($, on) => {
  const w = world(on, { isFailing: true })
  w.model = 'claude-haiku-5-5'
  await auto($, 'on')
  await $.prompt.submit(typed('something that is hard to put in a box at all'))
  expect(w.sets).toEqual(['opus'])
})

test('steps down when the plan cannot use the model it picked', async ($, on) => {
  const w = world(on, { answer: 'strongest', denied: ['fable'] })
  w.model = 'claude-sonnet-5-5'
  await auto($, 'on')
  await $.prompt.submit(typed('migrate everything and research for hours on end please'))
  expect(w.sets).toEqual(['opus'])
})

test('a model picked by hand turns it off', async ($, on) => {
  const w = world(on, { answer: 'small' })
  await auto($, 'on')
  await $.config.set({ key: 'model', value: 'sonnet' } as never)
  expect((await auto($, 'status')).text).toContain('is off')
  await $.prompt.submit(typed('rename these files to lowercase names please'))
  expect(w.calls).toBe(0)
})
