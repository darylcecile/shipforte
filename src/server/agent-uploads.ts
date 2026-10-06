import { and, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { agentConnections, agentUploads, users } from '../db/schema'
import { maxTranscriptBytes, transcriptMetadata } from '../domain/agent-submissions'
import { activeConnection } from './agent-auth'
import { context, ensure, HttpError, limitedBody, requireUser, type Bindings, type Context } from './context'
import { digest, randomToken } from './crypto'
import { rateLimit } from './request-limits'
import { saveScreenshot } from './snapshots'
import { saveTranscript } from './transcripts'
import { harnessForClient } from '../domain/harnesses'

export const uploadTicketInput = z.object({
  kind: z.enum(['screenshot', 'transcript']),
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((v) => !/[\\/\r\n]/.test(v), 'Use a filename, not a path.'),
  transcript: transcriptMetadata.optional(),
})
export async function createUploadTicket(
  c: Context,
  connectionId: string,
  input: z.infer<typeof uploadTicketInput>,
) {
  const user = requireUser(c)
  await rateLimit(c, `agent-upload:${user.id}`, 60, 3_600_000)
  const connection = await activeConnection(c, connectionId, user.id)
  const metadata = transcriptMetadata.parse(input.transcript ?? {})
  if (metadata.harness === 'other') metadata.harness = harnessForClient(connection.clientName) ?? 'other'
  const id = crypto.randomUUID()
  const token = randomToken()
  const expiresAt = Date.now() + 10 * 60_000
  await c.db.insert(agentUploads).values({
    id,
    hash: await digest(token),
    connectionId,
    kind: input.kind,
    name: input.name,
    metadata: input.kind === 'transcript' ? metadata : null,
    expiresAt,
  })
  return {
    uploadUrl: `${c.env.APP_URL}/agent-uploads/${id}`,
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    expiresAt,
    maxBytes: maxTranscriptBytes,
    instructions:
      'Send the local file bytes as the PUT body using your shell/HTTP tool. The response contains the attachment ID for prepare_submission. Do not put the file contents in a model tool argument.',
  }
}
export async function receiveAgentUpload(request: Request, env: Bindings, id: string) {
  if (request.method !== 'PUT')
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'PUT' } })
  const c = context(env, request)
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!token) throw new HttpError(401, 'An upload ticket is required.')
  const ticket = await c.db
    .select()
    .from(agentUploads)
    .where(
      and(
        eq(agentUploads.id, id),
        eq(agentUploads.hash, await digest(token)),
        gt(agentUploads.expiresAt, Date.now()),
      ),
    )
    .get()
  if (!ticket) throw new HttpError(401, 'This upload ticket expired. Request a new ticket.')
  const owner = ensure(
    await c.db.select().from(agentConnections).where(eq(agentConnections.id, ticket.connectionId)).get(),
  )
  await activeConnection(c, owner.id, owner.userId)
  c.user = ensure(await c.db.select().from(users).where(eq(users.id, owner.userId)).get())
  if (ticket.resultId) return Response.json({ id: ticket.resultId })
  const bytes = await limitedBody(request, maxTranscriptBytes)
  const claimed = await c.db
    .update(agentUploads)
    .set({ usedAt: Date.now() })
    .where(and(eq(agentUploads.id, id), isNull(agentUploads.usedAt)))
    .returning()
    .get()
  if (!claimed) throw new HttpError(409, 'This upload is already in progress. Retry shortly.')
  try {
    const file = new File([bytes], ticket.name)
    const result =
      ticket.kind === 'screenshot'
        ? await saveScreenshot(c, file)
        : await saveTranscript(c, file, transcriptMetadata.parse(ticket.metadata ?? {}))
    await c.db.update(agentUploads).set({ resultId: result.id }).where(eq(agentUploads.id, id))
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    await c.db.update(agentUploads).set({ usedAt: null }).where(eq(agentUploads.id, id))
    throw error
  }
}
