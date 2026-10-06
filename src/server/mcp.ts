import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { attempts, challenges, submissions, users } from '../db/schema'
import { httpsUrl, transcriptMetadata } from '../domain/agent-submissions'
import { type AgentIdentity, agentScopes } from './agent-auth'
import { draftStatus, prepareInput, prepareSubmission } from './agent-drafts'
import { createUploadTicket, uploadTicketInput } from './agent-uploads'
import { context, ensure, HttpError, type Bindings } from './context'
import { repositories } from './github'
import { challengeDetail } from './queries'
import { rateLimit } from './request-limits'
import { linkTranscript } from './transcripts'
import { sessionExportInput, sessionExportInstructions } from './session-export'
import { withRequirements } from '../domain/challenge-requirements'

export async function handleMcp(request: Request, env: Bindings, identity: AgentIdentity, scopes: string[]) {
  const c = context(env, request)
  c.user = ensure(await c.db.select().from(users).where(eq(users.id, identity.userId)).get())
  // Agents never inherit moderator powers from the account.
  c.user = { ...c.user, moderator: false }
  await rateLimit(c, `mcp:${identity.userId}`, 120, 60_000)
  const server = new McpServer(
    { name: 'shipforte', version: '1.3.0' },
    {
      instructions:
        'Shipforte hosts timed building challenges. Read the accepted attempt before preparing a submission. Screenshots are required. Build-session transcripts are optional and follow submission visibility. Set submission.visibility to private when the user wants to submit now and reveal later; otherwise it defaults to public. The required browser approval records the deadline time and immutable snapshot for both modes. Private submissions are owner-only on Shipforte with eligible kudos withheld until publication; publishing after the deadline preserves original eligibility. GitHub repositories must still be public and external links retain their own visibility. Once public, a submission cannot be made private. Use list_my_submissions and get_publication_review to help the user publish later; they must confirm in the browser. Session metadata collection is automatic: use get_session_export_instructions, then your local tools to export the actual current session before requesting an upload ticket. Prefer native structured exports so harness/version, model switches, tokens and cost are retained. Never ask the user to enter or calculate these details. Shipforte extracts them; leave missing fields unreported and never guess or reconstruct a transcript from memory. Use create_upload for local files, then prepare_submission. Preparation alone does not submit or reserve the deadline. Return the review URL to the user. Never automate the approval or publication button. To accept a challenge, send the user its Shipforte challenge URL.',
    },
  )
  function tool<T extends z.ZodType>(
    name: string,
    description: string,
    schema: T,
    write: boolean,
    action: (input: z.infer<T>, meta?: Record<string, unknown>) => Promise<unknown>,
  ) {
    const inputSchema: z.ZodType = schema
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        annotations: {
          readOnlyHint: !write,
          destructiveHint: false,
          idempotentHint: !write,
          openWorldHint: true,
        },
      },
      async (input, extra) => {
        try {
          const required = write ? agentScopes : ['shipforte:read']
          if (!required.every((scope) => scopes.includes(scope)))
            throw new HttpError(403, 'Reconnect with the requested Shipforte read/draft permissions.')
          const result = await action(schema.parse(input), extra._meta)
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
        } catch (error) {
          const message =
            error instanceof HttpError
              ? error.message
              : error instanceof z.ZodError
                ? error.issues.map((i) => i.message).join(' · ')
                : 'Shipforte could not complete this action. Please retry.'
          if (!(error instanceof HttpError) && !(error instanceof z.ZodError))
            console.error('MCP tool failed', { name, error })
          return { isError: true, content: [{ type: 'text' as const, text: message }] }
        }
      },
    )
  }
  tool('whoami', 'Show the connected Shipforte account and permissions.', z.object({}), false, async () => ({
    login: c.user!.login,
    scopes,
  }))
  tool(
    'list_challenges',
    'List published challenges. Accepting one in Shipforte starts its timer.',
    z.object({}),
    false,
    async () =>
      c.db
        .select({
          id: challenges.id,
          title: challenges.title,
          summary: challenges.summary,
          days: challenges.days,
          tier: challenges.tier,
        })
        .from(challenges)
        .where(eq(challenges.status, 'live'))
        .orderBy(desc(challenges.publishedAt))
        .limit(200),
  )
  tool(
    'get_challenge',
    'Read a challenge, its Markdown brief, required/stretch checklist, and your accepted attempts. Use the attempt’s saved requirement IDs when providing submission evidence.',
    z.object({ id: z.string().uuid() }),
    false,
    async ({ id }) => {
      const data = await challengeDetail(c, id)
      return { challenge: data.challenge, attempts: data.attempts, url: `${env.APP_URL}/challenges/${id}` }
    },
  )
  tool(
    'list_attempts',
    'Read your active attempts and their original accepted briefs, deadlines, and awards.',
    z.object({}),
    false,
    async () =>
      (
        await c.db
          .select()
          .from(attempts)
          .where(and(eq(attempts.userId, identity.userId), isNull(attempts.submittedAt)))
          .orderBy(desc(attempts.startedAt))
          .limit(100)
      ).map(withRequirements),
  )
  tool('list_repositories', 'List public GitHub repositories you can submit.', z.object({}), false, () =>
    repositories(c),
  )
  tool(
    'get_session_export_instructions',
    'Get the native export workflow for this harness and current session. Execute it with your local tools to collect session details automatically; do not ask the user for model/version/cost. OpenCode session metadata is used when supplied by the client.',
    sessionExportInput,
    false,
    (input, meta) => sessionExportInstructions(c, identity.connectionId, input, meta),
  )
  tool(
    'create_upload',
    'Get a short-lived upload URL for a screenshot or native session export. Transcript metadata is optional and extracted automatically from the file; never ask the user to fill it in. Upload local bytes with HTTP PUT and use the returned attachment ID.',
    uploadTicketInput,
    true,
    (input) => createUploadTicket(c, identity.connectionId, input),
  )
  tool(
    'attach_transcript_link',
    'Attach an HTTPS session share link. Harness and available public Gist metadata are detected automatically. Only sourceUrl is required. Links follow submission visibility on Shipforte, but external shares retain their own visibility; their contents are not copied or verified. Prefer a native export for complete metadata.',
    transcriptMetadata.extend({ sourceUrl: httpsUrl }),
    true,
    (input) => linkTranscript(c, input),
  )
  tool(
    'prepare_submission',
    'Prepare an immutable submission draft with public/private visibility, evidence for accepted requirement IDs (completed, notes, screenshot IDs), and optional videoUrl/learnings. Return the mandatory browser review URL. Does NOT submit until owner approval. Checklist completion is the builder’s report, not independent verification. Use a stable UUID requestId for retries.',
    prepareInput,
    true,
    (input) => prepareSubmission(c, identity.connectionId, input),
  )
  tool(
    'list_my_submissions',
    'List your submitted snapshots, including private submissions awaiting publication. Private submission links are only accessible to you.',
    z.object({}),
    false,
    () =>
      c.db
        .select({
          id: submissions.id,
          title: submissions.title,
          visibility: submissions.visibility,
          createdAt: submissions.createdAt,
          publishedAt: submissions.publishedAt,
          challengeId: submissions.challengeId,
        })
        .from(submissions)
        .where(eq(submissions.userId, identity.userId))
        .orderBy(desc(submissions.createdAt))
        .limit(100),
  )
  tool(
    'get_publication_review',
    'Return the owner-only review URL to publish a private saved submission. Does NOT publish. The user must click Publish submission and confirm in Shipforte; publication is irreversible and uses original deadline eligibility.',
    z.object({ id: z.string().uuid() }),
    false,
    async ({ id }) => {
      const row = ensure(
        await c.db
          .select()
          .from(submissions)
          .where(and(eq(submissions.id, id), eq(submissions.userId, identity.userId)))
          .get(),
      )
      return {
        id,
        title: row.title,
        visibility: row.visibility,
        submittedAt: row.createdAt,
        reviewUrl: `${env.APP_URL}/submissions/${id}`,
        message:
          row.visibility === 'private'
            ? 'The owner must review the saved snapshot and click Publish submission in Shipforte. Publication cannot be undone.'
            : 'This submission is already public and cannot be made private.',
      }
    },
  )
  tool(
    'get_submission_status',
    'Check whether the owner approved, rejected, or has yet to review a draft.',
    z.object({ id: z.string().uuid() }),
    false,
    ({ id }) => draftStatus(c, id),
  )
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 100_000,
  })
  try {
    await server.connect(transport)
    return await transport.handleRequest(request)
  } finally {
    await server.close()
  }
}
