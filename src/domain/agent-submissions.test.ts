import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canReadTranscript,
  httpsUrl,
  reviewMatches,
  safeReturnTo,
  submissionInput,
  transcriptFormat,
} from './agent-submissions'
import { parseTranscript } from './transcript-data'

test('transcript access follows publication and moderator visibility, including downloads', () => {
  const owner = { id: 'author', moderator: false }
  const moderator = { id: 'mod', moderator: true }
  const stranger = { id: 'other', moderator: false }
  const draft = { userId: owner.id, submissionId: null, hiddenAt: null }
  assert.equal(canReadTranscript(draft, owner), true)
  assert.equal(canReadTranscript(draft, moderator), false)
  assert.equal(canReadTranscript(draft, null), false)
  const published = { ...draft, submissionId: 'submission' }
  assert.equal(canReadTranscript(published, null), true)
  const hidden = { ...published, hiddenAt: 123 }
  for (const viewer of [null, stranger]) assert.equal(canReadTranscript(hidden, viewer), false)
  for (const viewer of [owner, moderator]) assert.equal(canReadTranscript(hidden, viewer), true)
})
test('a reviewed draft must match both its revision and exact commit', () => {
  const draft = { revision: 2, commitSha: 'a'.repeat(40) }
  assert.equal(reviewMatches(draft, draft), true)
  assert.equal(reviewMatches(draft, { ...draft, revision: 1 }), false)
  assert.equal(reviewMatches(draft, { ...draft, commitSha: 'b'.repeat(40) }), false)
})
test('sign-in return links stay on Shipforte and transcript links exclude executable URLs and credentials', () => {
  for (const unsafe of ['//evil.example', '/\\evil.example', 'https://evil.example', '/\nevil.example'])
    assert.equal(safeReturnTo(unsafe), '/')
  assert.equal(safeReturnTo('/agent-submissions/123?review=1'), '/agent-submissions/123?review=1')
  for (const unsafe of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com'])
    assert.equal(httpsUrl.safeParse(unsafe).success, false)
  assert.equal(httpsUrl.safeParse('https://cursor.com/s/example').success, true)
})
test('uploads validate bytes and serialized content rather than accepting an extension alone', () => {
  assert.equal(
    transcriptFormat('session.jsonl', Buffer.from('{"type":"user"}\n\n{"type":"assistant"}')),
    'jsonl',
  )
  assert.throws(() => transcriptFormat('session.html', Buffer.from('<script>alert(1)</script>')))
  assert.throws(() => transcriptFormat('session.json', Buffer.from('{bad}')))
  assert.throws(() => transcriptFormat('session.txt', new Uint8Array([0xff])))
  assert.throws(() => transcriptFormat('session.txt', Buffer.from('a\0b')))
})
test('submissions reject duplicate transcript handles and keep existing submissions compatible', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const input = {
    attemptId: id,
    repoId: 1,
    title: 'Project',
    description: 'A working implementation of the challenge.',
    screenshots: [id],
  }
  assert.deepEqual(submissionInput.parse(input).transcripts, [])
  assert.equal(submissionInput.safeParse({ ...input, transcripts: [id, id] }).success, false)
})
test('OpenCode exports retain model switches and sum message usage/cost without duplicating repeated records', () => {
  const a = {
    id: 'a',
    type: 'assistant',
    agent: 'build',
    model: { id: 'model-a', providerID: 'provider' },
    content: [{ type: 'text', text: 'Hello' }],
    cost: 0.01,
    tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 0 } },
  }
  const b = { ...a, id: 'b', model: { id: 'model-b' }, cost: 0.02 }
  const data = parseTranscript(JSON.stringify({ messages: [a, a, b] }), 'json')
  assert.deepEqual(data.models, ['model-a', 'model-b'])
  assert.deepEqual(data.agents, ['build'])
  assert.equal(data.usage?.inputTokens, 20)
  assert.equal(data.usage?.outputTokens, 10)
  assert.equal(data.usage?.costUsd, 0.03)
})
test('Claude stream records update usage for the same message instead of double-counting it', () => {
  const message = {
    id: 'a',
    model: 'claude-model',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello' }],
    usage: { input_tokens: 10, output_tokens: 1 },
  }
  const data = parseTranscript(
    [
      { type: 'assistant', message },
      { type: 'assistant', message: { ...message, usage: { input_tokens: 10, output_tokens: 8 } } },
      { type: 'result', total_cost_usd: 0.025, usage: { input_tokens: 10, output_tokens: 8 } },
    ]
      .map((value) => JSON.stringify(value))
      .join('\n'),
    'jsonl',
  )
  assert.equal(data.usage?.inputTokens, 10)
  assert.equal(data.usage?.outputTokens, 8)
  assert.equal(data.usage?.costUsd, 0.025)
  assert.equal(data.usage?.cacheReadTokens, null)
})
test('Codex cumulative token records use the latest total, preserving missing cost as unknown', () => {
  const rows = [10, 20].map((input) => ({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: input, output_tokens: 5, cached_input_tokens: 2 } },
    },
  }))
  const data = parseTranscript(rows.map((v) => JSON.stringify(v)).join('\n'), 'jsonl')
  assert.equal(data.usage?.inputTokens, 20)
  assert.equal(data.usage?.outputTokens, 5)
  assert.equal(data.usage?.costUsd, null)
  assert.equal(parseTranscript('Nothing reported', 'txt').usage, null)
  assert.equal(parseTranscript('{"unknown":"format"}', 'json').usage, null)
})
