import type { Harness } from './harnesses'

type RecordValue = Record<string, unknown>
export const record = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {}
export const textValue = (value: unknown, max = 160) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

export interface TranscriptSource {
  harness: Harness | null
  version: string
  title: string
}
export const unknownSource = (): TranscriptSource => ({ harness: null, version: '', title: '' })

export function recordSource(row: RecordValue): TranscriptSource {
  const data = record(row.data)
  const payload = record(row.payload)
  const info = record(row.info)
  if (row.type === 'session.start' && data.copilotVersion)
    return { harness: 'copilot', version: textValue(data.copilotVersion, 80), title: '' }
  if (['assistant.usage', 'session.shutdown', 'session.model_change'].includes(String(row.type)) && row.data)
    return { harness: 'copilot', version: '', title: '' }
  if (row.type === 'session_meta' && payload.cli_version)
    return { harness: 'codex', version: textValue(payload.cli_version, 80), title: '' }
  if (row.type === 'event_msg' && payload.type === 'token_count')
    return { harness: 'codex', version: '', title: '' }
  if (row.type === 'system' && row.subtype === 'init' && row.session_id)
    return { harness: 'claude-code', version: textValue(row.claude_code_version, 80), title: '' }
  if (row.sessionId && row.uuid && row.version && ['user', 'assistant', 'system'].includes(String(row.type)))
    return { harness: 'claude-code', version: textValue(row.version, 80), title: '' }
  if (row.type === 'result' && row.session_id && 'total_cost_usd' in row)
    return { harness: 'claude-code', version: '', title: '' }
  if (Array.isArray(row.messages) && /^ses/.test(textValue(info.id)))
    return { harness: 'opencode', version: textValue(info.version, 80), title: textValue(info.title, 120) }
  if (
    (info.modelID && info.providerID && row.parts) ||
    (row.type === 'assistant' && record(row.model).providerID && row.content)
  )
    return { harness: 'opencode', version: '', title: '' }
  const thread = record(row.thread ?? record(row.result).thread)
  if (thread.id && Array.isArray(thread.turns) && thread.modelProvider)
    return { harness: 'codex', version: '', title: textValue(thread.name, 120) }
  return unknownSource()
}

// Only export headers count as metadata. Model names mentioned inside prompts/code do not.
export function textSource(text: string, name: string): TranscriptSource & { model: string } {
  const header = text.slice(0, 4000).split(/\n(?:---|#{1,3} (?:User|Assistant|Conversation|Messages)\b)/)[0]
  const cursor = /^_Exported on [^\n]+ from Cursor(?: \(([^)]+)\))?_\s*$/m.exec(header)
  const copilot =
    /^# (?:GitHub )?Copilot(?: CLI)? Session\b/i.test(header) || /^copilot-session-[^/]+\.md$/i.test(name)
  const harness = cursor ? 'cursor' : copilot ? 'copilot' : null
  const model = harness ? /^\*\*Model:\*\*\s*([^\n]+)$/m.exec(header)?.[1] : ''
  const version =
    cursor?.[1] || (copilot ? /^\*\*Copilot (?:CLI )?[Vv]ersion:\*\*\s*([^\n]+)$/m.exec(header)?.[1] : '')
  return {
    harness,
    version: textValue(version, 80),
    title: harness ? textValue(/^# (.+)$/m.exec(header)?.[1], 120) : '',
    model: textValue(model, 120),
  }
}
