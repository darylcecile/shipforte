import { z } from 'zod'
import {
  record as object,
  recordSource,
  textSource,
  textValue as label,
  unknownSource,
  type TranscriptSource,
} from './transcript-source'

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null)
export const usageSchema = z.object({
  inputTokens: count,
  outputTokens: count,
  cacheReadTokens: count,
  cacheWriteTokens: count,
  reasoningTokens: count,
  costUsd: z.number().finite().nonnegative().max(1_000_000).nullable().default(null),
})
export type SessionUsage = z.infer<typeof usageSchema>
const emptyUsage = (): SessionUsage => ({
  inputTokens: null,
  outputTokens: null,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  reasoningTokens: null,
  costUsd: null,
})
export function mergeReportedUsage(
  primary: SessionUsage | null,
  fallback: SessionUsage | null,
): SessionUsage | null {
  if (!primary) return fallback
  if (!fallback) return primary
  return Object.fromEntries(
    (Object.keys(primary) as (keyof SessionUsage)[]).map((key) => [key, primary[key] ?? fallback[key]]),
  ) as SessionUsage
}
type RecordValue = Record<string, unknown>
const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

export interface TranscriptTurn {
  role: string
  text: string
  model: string
  tool: boolean
}
export interface TranscriptData extends TranscriptSource {
  turns: TranscriptTurn[]
  models: string[]
  agents: string[]
  usage: SessionUsage | null
  truncated: boolean
}

function* exportRecords(text: string, format: string): Generator<unknown> {
  if (format === 'jsonl') {
    // Parse one record at a time instead of materializing a second full transcript in memory.
    let start = 0
    while (start < text.length) {
      const newline = text.indexOf('\n', start)
      const end = newline === -1 ? text.length : newline
      const line = text.slice(start, end).trim()
      if (line) yield JSON.parse(line)
      start = end + 1
    }
    return
  }
  const data = JSON.parse(text)
  if (Array.isArray(data)) {
    yield* data
    return
  }
  const root = object(data)
  // Root session summaries carry titles and aggregate usage that messages alone can omit.
  if (Array.isArray(root.messages)) {
    yield root
    yield* root.messages
    return
  }
  if (Array.isArray(root.events)) {
    yield* root.events
    return
  }
  const turns = object(root.thread ?? object(root.result).thread).turns
  if (Array.isArray(turns)) {
    yield root
    for (const turn of turns) {
      const items = object(turn).items
      if (Array.isArray(items)) yield* items
    }
    return
  }
  yield data
}
function partText(part: RecordValue): string {
  const state = object(part.state)
  const value = part.type === 'tool' ? (state.output ?? state.content) : (part.text ?? part.content)
  if (typeof value === 'string') return value
  if (Array.isArray(value))
    return value
      .map((item) => {
        const text = object(item).text
        return typeof text === 'string' ? text : ''
      })
      .join('\n')
  if (part.type === 'tool_use') return `${label(part.name)}\n${JSON.stringify(part.input ?? {})}`
  return ''
}
function appendTurn(result: TranscriptData, turn: TranscriptTurn) {
  if (!turn.text) return
  if (result.turns.length >= 2000) {
    result.truncated = true
    return
  }
  if (turn.text.length > 30_000) result.truncated = true
  result.turns.push({ ...turn, text: turn.text.slice(0, 30_000) })
}
function appendMessages(result: TranscriptData, row: RecordValue, info: RecordValue, model: string) {
  if (['user.message', 'assistant.message'].includes(String(row.type))) {
    const text = object(row.data).content
    if (typeof text === 'string')
      appendTurn(result, {
        role: row.type === 'user.message' ? 'user' : 'assistant',
        model,
        tool: false,
        text,
      })
    return
  }
  const payload = object(row.payload)
  const role = label(info.role ?? row.role ?? payload.role ?? row.type) || 'event'
  const content = row.parts ?? info.content ?? payload.content ?? row.content
  const parts = Array.isArray(content) ? content : typeof content === 'string' ? [{ text: content }] : []
  for (const value of parts) {
    const part = object(value)
    appendTurn(result, {
      role,
      model,
      text: partText(part),
      tool: ['tool', 'tool_result', 'tool_use'].includes(String(part.type)),
    })
  }
  if (typeof row.text === 'string' && ['agentMessage', 'userMessage', 'user'].includes(String(row.type)))
    appendTurn(result, {
      role: row.type === 'agentMessage' ? 'assistant' : 'user',
      model,
      tool: false,
      text: row.text,
    })
}
function messageUsage(info: RecordValue): SessionUsage {
  const usage = object(info.usage)
  const tokens = object(info.tokens)
  const cache = object(tokens.cache)
  return {
    inputTokens: number(usage.input_tokens ?? tokens.input),
    outputTokens: number(usage.output_tokens ?? tokens.output),
    cacheReadTokens: number(usage.cache_read_input_tokens ?? usage.cached_input_tokens ?? cache.read),
    cacheWriteTokens: number(usage.cache_creation_input_tokens ?? cache.write),
    reasoningTokens: number(tokens.reasoning),
    costUsd: Object.keys(tokens).length ? number(info.cost) : null,
  }
}
function copilotUsage(data: RecordValue): SessionUsage {
  return {
    inputTokens: number(data.inputTokens),
    outputTokens: number(data.outputTokens),
    cacheReadTokens: number(data.cacheReadTokens),
    cacheWriteTokens: number(data.cacheWriteTokens),
    reasoningTokens: number(data.reasoningTokens),
    costUsd: null,
  }
}
function copilotSummary(row: RecordValue): SessionUsage | null {
  if (row.type !== 'session.shutdown') return null
  const models = Object.values(object(object(row.data).modelMetrics))
  if (!models.length) return null
  const total = emptyUsage()
  for (const model of models) addUsage(total, copilotUsage(object(object(model).usage)))
  return total
}
function metadataForRecord(result: TranscriptData, row: RecordValue, info: RecordValue) {
  const source = recordSource(row)
  if (source.harness) result.harness = source.harness
  if (source.version) result.version = source.version
  if (source.title) result.title = source.title
  const data = object(row.data)
  const payload = object(row.payload)
  const modelRef = object(info.model)
  const model = label(modelRef.id ?? info.modelID ?? info.model ?? row.model ?? payload.model ?? data.model)
  const names = [model]
  if (row.type === 'session.start') names.push(label(data.selectedModel))
  if (row.type === 'session.model_change') names.push(label(data.previousModel), label(data.newModel))
  if (row.type === 'session.shutdown') names.push(...Object.keys(object(data.modelMetrics)))
  if (row.type === 'result') names.push(...Object.keys(object(row.modelUsage)))
  for (const name of names)
    if (name && result.models.length < 100 && !result.models.includes(name))
      result.models.push(name.slice(0, 160))
  const agent = label(
    info.agent ??
      payload.agent_role ??
      payload.agent_nickname ??
      (row.type === 'subagent.selected' ? data.agentName : undefined),
  )
  if (agent && result.agents.length < 100 && !result.agents.includes(agent)) result.agents.push(agent)
  if (row.type === 'session.title_changed' && data.title) result.title = label(data.title, 120)
  return model
}
function addUsage(totals: SessionUsage, metrics: SessionUsage, previous?: SessionUsage) {
  for (const key of Object.keys(metrics) as (keyof SessionUsage)[]) {
    if (metrics[key] === null) metrics[key] = previous?.[key] ?? null
    if (metrics[key] !== null) totals[key] = (totals[key] ?? 0) - (previous?.[key] ?? 0) + metrics[key]!
  }
}
function cumulativeUsage(row: RecordValue): SessionUsage | null {
  const payload = object(row.payload)
  if (row.type !== 'event_msg' || payload.type !== 'token_count') return null
  const total = object(object(payload.info).total_token_usage)
  if (!Object.keys(total).length) return null
  return {
    ...emptyUsage(),
    inputTokens: number(total.input_tokens),
    outputTokens: number(total.output_tokens),
    cacheReadTokens: number(total.cached_input_tokens),
    reasoningTokens: number(total.reasoning_output_tokens),
  }
}

// Export formats are not a shared standard. Only recognizable message/event fields are interpreted.
// Unknown records remain available in the original text/download; they are never treated as instructions.
export function parseTranscript(text: string, format: string, name = ''): TranscriptData {
  const result: TranscriptData = {
    ...unknownSource(),
    turns: [],
    models: [],
    agents: [],
    usage: null,
    truncated: false,
  }
  if (format !== 'json' && format !== 'jsonl') {
    const source = textSource(text, name)
    return {
      ...result,
      harness: source.harness,
      version: source.version,
      title: source.title,
      models: source.model ? [source.model] : [],
    }
  }
  try {
    return readRecords(exportRecords(text, format), result)
  } catch {
    return { ...result, usage: null }
  }
}
function readRecords(records: Iterable<unknown>, result: TranscriptData) {
  const totals = emptyUsage()
  const seenUsage = new Map<string, SessionUsage>()
  let codexTotals: SessionUsage | null = null
  let reportedCost: number | null = null
  let reportedUsage: SessionUsage | null = null
  for (const value of records) {
    const row = object(value)
    const info = object(row.info ?? row.message ?? row)
    const model = metadataForRecord(result, row, info)
    appendMessages(result, row, info, model)
    const id = label(info.id ?? row.uuid)
    if (row.type === 'result' || Array.isArray(row.messages)) reportedUsage = messageUsage(info)
    else {
      const metrics = row.type === 'assistant.usage' ? copilotUsage(object(row.data)) : messageUsage(info)
      addUsage(totals, metrics, id ? seenUsage.get(id) : undefined)
      if (id) seenUsage.set(id, metrics)
    }
    const checkpoint = copilotSummary(row)
    if (checkpoint) Object.assign(totals, mergeReportedUsage(checkpoint, totals))
    // Codex token_count records contain cumulative totals; take the latest, never sum them.
    codexTotals = cumulativeUsage(row) ?? codexTotals
    // Claude's terminal result contains a session total in USD, not a per-message price.
    if (row.type === 'result' && number(row.total_cost_usd) !== null)
      reportedCost = number(row.total_cost_usd)
  }
  if (reportedCost !== null) totals.costUsd = reportedCost
  const metrics = mergeReportedUsage(codexTotals ?? reportedUsage, totals)!
  const valid = usageSchema.safeParse(metrics)
  if (valid.success && Object.values(metrics).some((v) => v !== null)) result.usage = valid.data
  if (!result.title)
    result.title =
      result.turns
        .find((turn) => turn.role === 'user' && !turn.tool)
        ?.text.split('\n')[0]
        .trim()
        .slice(0, 120) || ''
  return result
}
