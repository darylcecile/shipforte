import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { agentConnections, attempts, submissionDrafts, submissions, transcripts, uploads } from '../db/schema'
import { reviewMatches, submissionInput } from '../domain/agent-submissions'
import { activeConnection } from './agent-auth'
import { atomic, ensure, HttpError, notify, requireUser, stmt, type Context } from './context'
import { defaultBranchCommit, verifiedRepository } from './github'
import { createSubmission, validateSubmissionAttachments } from './submissions'
import { transcriptSummary } from './transcripts'
import { validateEvidence, withRequirements } from '../domain/challenge-requirements'

export const prepareInput = z.object({ requestId: z.string().uuid(), submission: submissionInput })
export async function prepareSubmission(
  c: Context,
  connectionId: string,
  value: z.infer<typeof prepareInput>,
) {
  const user = requireUser(c)
  const existing = await c.db
    .select()
    .from(submissionDrafts)
    .where(
      and(eq(submissionDrafts.connectionId, connectionId), eq(submissionDrafts.requestId, value.requestId)),
    )
    .get()
  if (existing) {
    if (JSON.stringify(submissionInput.parse(existing.input)) !== JSON.stringify(value.submission))
      throw new HttpError(409, 'This request ID already belongs to a different draft. Use a new request ID.')
    return draftStatus(c, existing.id)
  }
  const connection = await activeConnection(c, connectionId, user.id)
  const attempt = ensure(
    await c.db
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, value.submission.attemptId), eq(attempts.userId, user.id)))
      .get(),
  )
  if (attempt.submittedAt) throw new HttpError(409, 'This attempt has already been submitted.')
  try {
    validateEvidence(
      withRequirements(attempt).requirements,
      value.submission.evidence,
      value.submission.screenshots,
    )
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid requirement evidence.')
  }
  await validateSubmissionAttachments(c, value.submission)
  const { repo, token, publicRead } = await verifiedRepository(c, value.submission.repoId)
  const commit = await defaultBranchCommit(token, repo, publicRead)
  const id = crypto.randomUUID()
  const expiresAt = Date.now() + 7 * 24 * 3_600_000
  await atomic(
    c,
    [
      { table: 'users', id: user.id, revision: user.revision },
      { table: 'agent_connections', id: connection.id, revision: connection.revision },
    ],
    [
      stmt(
        c,
        'INSERT INTO submission_drafts(id,user_id,connection_id,request_id,input,repo_name,commit_sha,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',
        id,
        user.id,
        connectionId,
        value.requestId,
        JSON.stringify(value.submission),
        repo.full_name,
        commit.sha,
        Date.now(),
        expiresAt,
      ),
      notify(
        c,
        user.id,
        'Your agent prepared a submission',
        `Review “${value.submission.title}” before submitting ${value.submission.visibility === 'private' ? 'privately' : 'publicly'}.`,
        `/agent-submissions/${id}`,
        attempt.challengeId,
      ),
    ],
  )
  return {
    id,
    status: 'pending_review',
    reviewUrl: `${c.env.APP_URL}/agent-submissions/${id}`,
    expiresAt,
    visibility: value.submission.visibility,
    message:
      'Not submitted yet. The account owner must open reviewUrl and click Approve and submit. Approval time determines deadline eligibility.',
  }
}
async function ownedDraft(c: Context, id: string) {
  const user = requireUser(c)
  return ensure(
    await c.db
      .select()
      .from(submissionDrafts)
      .where(and(eq(submissionDrafts.id, id), eq(submissionDrafts.userId, user.id)))
      .get(),
  )
}
export async function draftStatus(c: Context, id: string) {
  const draft = await ownedDraft(c, id)
  const connection = await c.db
    .select()
    .from(agentConnections)
    .where(eq(agentConnections.id, draft.connectionId))
    .get()
  const status = statusOfDraft(draft, connection)
  const submission = draft.submissionId
    ? await c.db.select().from(submissions).where(eq(submissions.id, draft.submissionId)).get()
    : null
  return {
    id,
    status,
    visibility: submission?.visibility ?? draft.input.visibility ?? 'public',
    expiresAt: draft.expiresAt,
    reviewUrl: `${c.env.APP_URL}/agent-submissions/${id}`,
    submissionUrl: draft.submissionId ? `${c.env.APP_URL}/submissions/${draft.submissionId}` : null,
  }
}
function statusOfDraft(
  draft: typeof submissionDrafts.$inferSelect,
  connection?: typeof agentConnections.$inferSelect,
) {
  if (draft.submissionId) return 'submitted'
  if (draft.rejectedAt) return 'rejected'
  if (draft.expiresAt <= Date.now()) return 'expired'
  if (!connection || connection.revokedAt || connection.expiresAt <= Date.now()) return 'connection_inactive'
  return 'pending_review'
}
export async function listDrafts(c: Context) {
  const user = requireUser(c)
  const rows = await c.db
    .select({ draft: submissionDrafts, connection: agentConnections })
    .from(submissionDrafts)
    .innerJoin(agentConnections, eq(agentConnections.id, submissionDrafts.connectionId))
    .where(eq(submissionDrafts.userId, user.id))
    .orderBy(desc(submissionDrafts.createdAt))
    .limit(100)
  return rows.map(({ draft, connection }) => ({ ...draft, status: statusOfDraft(draft, connection) }))
}
export async function draftDetail(c: Context, id: string) {
  const draft = await ownedDraft(c, id)
  const attempt = ensure(
    await c.db.select().from(attempts).where(eq(attempts.id, draft.input.attemptId)).get(),
  )
  const images = await c.db
    .select({ id: uploads.id, name: uploads.name })
    .from(uploads)
    .where(inArray(uploads.id, draft.input.screenshots))
  const sessions = draft.input.transcripts.length
    ? await c.db.select().from(transcripts).where(inArray(transcripts.id, draft.input.transcripts))
    : []
  return {
    draft,
    attempt: withRequirements(attempt),
    images,
    transcripts: sessions.map(transcriptSummary),
    status: await draftStatus(c, id),
  }
}
function requirePending(draft: typeof submissionDrafts.$inferSelect) {
  if (draft.submissionId || draft.rejectedAt || draft.expiresAt <= Date.now())
    throw new HttpError(409, 'This draft is no longer awaiting approval.')
}
const reviewInput = z.object({
  revision: z.number().int().nonnegative(),
  commitSha: z.string().regex(/^[a-f0-9]{40}$/),
})
export async function approveDraft(c: Context, id: string) {
  const draft = await ownedDraft(c, id)
  const review = reviewInput.parse(await c.request.json())
  if (draft.submissionId) {
    const row = ensure(
      await c.db.select().from(submissions).where(eq(submissions.id, draft.submissionId)).get(),
    )
    return { id: row.id }
  }
  requirePending(draft)
  if (!reviewMatches(draft, review))
    throw new HttpError(409, 'This preview changed. Refresh and review it again.')
  const connection = await activeConnection(c, draft.connectionId, requireUser(c).id)
  return createSubmission(c, submissionInput.parse(draft.input), {
    commitSha: draft.commitSha,
    draftId: id,
    guards: [
      { table: 'submission_drafts', id, revision: draft.revision },
      { table: 'agent_connections', id: connection.id, revision: connection.revision },
    ],
  })
}
export async function refreshDraft(c: Context, id: string) {
  const draft = await ownedDraft(c, id)
  requirePending(draft)
  await activeConnection(c, draft.connectionId, requireUser(c).id)
  const { repo, token, publicRead } = await verifiedRepository(c, draft.input.repoId)
  const commit = await defaultBranchCommit(token, repo, publicRead)
  await atomic(
    c,
    [{ table: 'submission_drafts', id, revision: draft.revision }],
    [
      stmt(
        c,
        'UPDATE submission_drafts SET commit_sha=?,repo_name=? WHERE id=?',
        commit.sha,
        repo.full_name,
        id,
      ),
    ],
  )
  return { ok: true }
}
export async function rejectDraft(c: Context, id: string) {
  const draft = await ownedDraft(c, id)
  requirePending(draft)
  await atomic(
    c,
    [{ table: 'submission_drafts', id, revision: draft.revision }],
    [stmt(c, 'UPDATE submission_drafts SET rejected_at=? WHERE id=?', Date.now(), id)],
  )
  return { ok: true }
}
