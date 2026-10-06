import { z } from 'zod'
import { harnesses, harnessForClient, type Harness } from '../domain/harnesses'
import { activeConnection } from './agent-auth'
import { requireUser, type Context } from './context'

const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
export const sessionExportInput = z.object({
  harness: z.enum(harnesses).optional(),
  sessionId: sessionIdSchema.optional(),
})
const recipes: Record<Harness, { source: string; docs?: string }> = {
  opencode: {
    source:
      'Export the current session through the authenticated local OpenCode API. Preserve the root info and messages, including tokens and cost.',
    docs: 'https://opencode.ai/v2/docs/api',
  },
  copilot: {
    source:
      'Read the current session’s events.jsonl in the configured Copilot session-state directory (normally ~/.copilot/session-state/{sessionId}/events.jsonl). Prefer this native log to Markdown: it records the producer/version, model changes, and available shutdown usage. Do not use a different or merely most-recent session.',
    docs: 'https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference',
  },
  'claude-code': {
    source:
      'Use this session’s transcript_path if supplied by the harness/hooks, or locate the JSONL matching this exact session ID in the configured Claude projects directory. Preserve system/init and result records if present. Do not invoke a new Claude prompt to reconstruct/export history.',
    docs: 'https://code.claude.com/docs/en/sessions',
  },
  codex: {
    source:
      'Use the rollout JSONL matching this exact thread in the configured CODEX_HOME sessions directory, including session_meta and token_count events. Alternatively read thread/read with includeTurns:true through a local App Server. history.jsonl is not a complete conversation export.',
    docs: 'https://developers.openai.com/codex/app-server/',
  },
  cursor: {
    source:
      'Use the current session transcript artifact supplied by Cursor, or its chat export/share facility. Preserve the exporter header. If only a share link is available, use attach_transcript_link; do not synthesize missing model or usage data.',
    docs: 'https://cursor.com/help/ai-features/shared-transcripts',
  },
  other: {
    source:
      'Use the current harness’s native session export or actual transcript artifact. Preserve its metadata and usage records; never recreate the conversation from memory.',
  },
}

export async function sessionExportInstructions(
  c: Context,
  connectionId: string,
  input: z.infer<typeof sessionExportInput>,
  meta?: Record<string, unknown>,
) {
  const connection = await activeConnection(c, connectionId, requireUser(c).id)
  const harness = input.harness ?? harnessForClient(connection.clientName) ?? 'other'
  const suppliedSession = sessionIdSchema.safeParse(meta?.sessionID)
  const sessionId = suppliedSession.success ? suppliedSession.data : input.sessionId
  return {
    harness,
    sessionId: sessionId ?? null,
    ...recipes[harness],
    ...(harness === 'opencode' && sessionId
      ? {
          exportCommand: `opencode api get /api/experimental/session/${sessionId}/export`,
          saveOutputAs: 'opencode-session.json',
        }
      : {}),
    uploadMetadata: { harness },
    steps: [
      'Use your local tools to export/read the actual session before creating an upload ticket, so the export does not include upload credentials.',
      'Call create_upload with kind=transcript and the export filename. No model, version, title, token counts, or cost arguments are required: Shipforte extracts them.',
      'If the running harness exposes additional session metadata, supply only the values you read directly as optional transcript metadata. Do not ask the user to fill these in or infer a harness from its model name.',
      'Upload the exact file bytes to the returned PUT URL, then include the returned attachment ID in prepare_submission. The user reviews and approves the result in Shipforte.',
    ],
    missingData:
      'Leave unreported fields absent. If no actual session artifact is accessible, report that limitation instead of fabricating a transcript or asking the user to calculate metadata.',
  }
}
