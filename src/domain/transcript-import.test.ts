import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transcriptFormat, transcriptMetadata } from './agent-submissions'
import { harnessForClient, harnessForLink } from './harnesses'
import { parseTranscript } from './transcript-data'

test('an import needs no user-supplied session metadata and pasted JSON retains structured detection', () => {
  const metadata = transcriptMetadata.parse({})
  assert.equal(metadata.harness, 'other')
  assert.equal(metadata.label, '')
  assert.equal(transcriptMetadata.parse({ usage: { costUsd: 0.02 } }).usage?.inputTokens, null)
  const text =
    '{"type":"session_meta","payload":{"cli_version":"0.100.0"}}\n{"type":"turn_context","payload":{"model":"gpt-example"}}'
  assert.equal(transcriptFormat('session.txt', Buffer.from(text)), 'jsonl')
  const data = parseTranscript(text, 'jsonl')
  assert.equal(data.harness, 'codex')
  assert.equal(data.version, '0.100.0')
  assert.deepEqual(data.models, ['gpt-example'])
})

test('Copilot native logs identify the application version, model switches, and checkpoint token totals', () => {
  const rows = [
    {
      type: 'session.start',
      data: {
        sessionId: 'session',
        version: 9,
        copilotVersion: '0.0.500',
        producer: 'copilot-agent',
        selectedModel: 'claude-example',
      },
    },
    { id: 'u', type: 'user.message', data: { content: 'Build a garden app' } },
    {
      id: 'a',
      type: 'assistant.usage',
      data: { model: 'claude-example', inputTokens: 10, outputTokens: 5, cost: 3 },
    },
    { type: 'session.model_change', data: { previousModel: 'claude-example', newModel: 'gpt-example' } },
    { type: 'subagent.selected', data: { agentName: 'reviewer' } },
    {
      type: 'session.shutdown',
      data: {
        totalPremiumRequests: 3,
        modelMetrics: {
          'claude-example': {
            usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
          },
          'gpt-example': {
            usage: { inputTokens: 20, outputTokens: 8, cacheReadTokens: 4, cacheWriteTokens: 0 },
          },
        },
      },
    },
  ]
  const data = parseTranscript(rows.map((row) => JSON.stringify(row)).join('\n'), 'jsonl')
  assert.equal(data.harness, 'copilot')
  assert.equal(data.version, '0.0.500')
  assert.equal(data.title, 'Build a garden app')
  assert.deepEqual(data.models, ['claude-example', 'gpt-example'])
  assert.deepEqual(data.agents, ['reviewer'])
  assert.equal(data.usage?.inputTokens, 30)
  assert.equal(data.usage?.outputTokens, 13)
  assert.equal(data.usage?.costUsd, null, 'Copilot billing multipliers are not USD')
})

test('OpenCode preserves its root session title and aggregate usage without adding it to message totals', () => {
  const data = parseTranscript(
    JSON.stringify({
      info: { id: 'ses_example', title: 'Garden app', cost: 0.08, tokens: { input: 50, output: 10 } },
      messages: [
        {
          id: 'msg_example',
          type: 'assistant',
          agent: 'build',
          model: { providerID: 'anthropic', id: 'claude-example' },
          cost: 0.02,
          tokens: { input: 20, output: 5 },
          content: [{ type: 'text', text: 'Done' }],
        },
      ],
    }),
    'json',
  )
  assert.equal(data.harness, 'opencode')
  assert.equal(data.title, 'Garden app')
  assert.equal(data.version, '')
  assert.equal(data.usage?.inputTokens, 50)
  assert.equal(data.usage?.costUsd, 0.08)
})

test('Claude native metadata identifies the harness separately from the model', () => {
  const data = parseTranscript(
    JSON.stringify({
      type: 'assistant',
      sessionId: 'session',
      uuid: 'message',
      version: '2.1.0',
      message: { role: 'assistant', model: 'claude-example', content: [{ type: 'text', text: 'Done' }] },
    }),
    'jsonl',
  )
  assert.equal(data.harness, 'claude-code')
  assert.equal(data.version, '2.1.0')
  assert.deepEqual(data.models, ['claude-example'])
  const generic = parseTranscript(
    JSON.stringify({ role: 'assistant', model: 'claude-example', content: 'Done', cost: 12 }),
    'json',
  )
  assert.equal(generic.harness, null)
  assert.equal(generic.usage, null)
})

test('export headers and known share hosts provide hints without guessing from conversation prose', () => {
  const cursor = parseTranscript(
    '# Garden app\n\n_Exported on 2026-09-28 from Cursor (2.0.0)_\n\n---\n\n**User**\nBuild an app',
    'md',
  )
  assert.equal(cursor.harness, 'cursor')
  assert.equal(cursor.version, '2.0.0')
  assert.equal(cursor.title, 'Garden app')
  assert.equal(parseTranscript('We discussed Cursor, Claude Code, and gpt-example.', 'txt').harness, null)
  assert.equal(parseTranscript('# Session\n\nHello', 'md', 'copilot-session-123.md').harness, 'copilot')
  assert.equal(harnessForLink('https://cursor.com/s/example'), 'cursor')
  assert.equal(harnessForLink('https://cursor.com.evil.example/s/example'), null)
  assert.equal(harnessForClient('OpenCode'), 'opencode')
  assert.equal(harnessForClient('My app using Claude models'), null)
})
