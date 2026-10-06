import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { submissions, transcriptHighlights, transcripts } from '../db/schema'
import { canReadTranscript } from '../domain/agent-submissions'
import { highlightExcerpt, highlightSchema, showcaseSchema } from '../domain/showcase'
import { parseTranscript } from '../domain/transcript-data'
import { atomic, ensure, event, HttpError, requireUser, stmt, userGuard, type Context } from './context'
import { readSubmission } from './submission-access'

async function ownSubmission(c: Context, id: string) {
  const row = await readSubmission(c, id)
  if (row.userId !== requireUser(c).id) throw new HttpError(403, 'Only the author can edit this showcase.')
  return row
}
export async function updateShowcase(c: Context, id: string) {
  const row = await ownSubmission(c, id)
  const input = showcaseSchema
    .extend({ revision: z.number().int().nonnegative() })
    .parse(await c.request.json())
  if (row.revision !== input.revision)
    throw new HttpError(409, 'This submission changed. Refresh and try again.')
  await atomic(
    c,
    [{ table: 'submissions', id, revision: row.revision }],
    [
      stmt(
        c,
        'UPDATE submissions SET video_url=?,learnings=? WHERE id=?',
        input.videoUrl,
        input.learnings,
        id,
      ),
      event(
        c,
        row.userId,
        row.challengeId,
        'showcase_updated',
        'Updated the recording or learning notes. The submitted code and evidence are unchanged.',
        id,
      ),
    ],
  )
  return { ok: true }
}

export async function savePortfolioPins(c: Context) {
  const user = requireUser(c)
  const { ids } = z
    .object({
      ids: z
        .array(z.string().uuid())
        .max(3)
        .refine((ids) => new Set(ids).size === ids.length, 'Select each project only once.'),
    })
    .parse(await c.request.json())
  const rows = ids.length ? await c.db.select().from(submissions).where(inArray(submissions.id, ids)) : []
  if (
    rows.length !== ids.length ||
    rows.some((row) => row.userId !== user.id || row.visibility !== 'public' || row.archived || row.revoked)
  )
    throw new HttpError(400, 'Pin up to three of your public, active submissions.')
  await atomic(
    c,
    [
      userGuard(user),
      ...rows.map((row) => ({ table: 'submissions' as const, id: row.id, revision: row.revision })),
    ],
    [
      stmt(c, 'DELETE FROM portfolio_pins WHERE user_id=?', user.id),
      ...ids.map((id, position) =>
        stmt(
          c,
          'INSERT INTO portfolio_pins(user_id,submission_id,position) VALUES(?,?,?)',
          user.id,
          id,
          position,
        ),
      ),
    ],
  )
  return { ok: true }
}

async function sourceText(c: Context, row: typeof transcripts.$inferSelect, turnIndex: number | null) {
  if (!row.key) throw new HttpError(400, 'Highlights require an uploaded transcript, not an external link.')
  const stored = ensure(await c.env.ASSETS_BUCKET.get(row.key), 'Transcript unavailable.')
  const text = await stored.text()
  if (turnIndex === null) return text
  const turn = parseTranscript(text, row.format || 'txt', row.name || '').turns[turnIndex]
  if (!turn) throw new HttpError(400, 'This message is no longer available. Choose another passage.')
  return turn.text
}

export async function addHighlight(c: Context, id: string) {
  const submission = await ownSubmission(c, id)
  const input = highlightSchema.parse(await c.request.json())
  const transcript = ensure(
    await c.db
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.id, input.transcriptId), eq(transcripts.submissionId, id)))
      .get(),
  )
  const existing = await c.db
    .select({ id: transcriptHighlights.id })
    .from(transcriptHighlights)
    .where(eq(transcriptHighlights.submissionId, id))
  if (existing.length >= 5) throw new HttpError(400, 'Choose up to five transcript highlights.')
  if (transcript.hiddenAt) throw new HttpError(400, 'A moderator has hidden this transcript.')
  const text = await sourceText(c, transcript, input.turnIndex)
  try {
    highlightExcerpt(text, input.startOffset, input.endOffset)
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid excerpt.')
  }
  const highlightId = crypto.randomUUID()
  await atomic(
    c,
    [{ table: 'submissions', id, revision: submission.revision }],
    [
      stmt(
        c,
        'INSERT INTO transcript_highlights(id,submission_id,transcript_id,turn_index,start_offset,end_offset,caption,created_at) VALUES(?,?,?,?,?,?,?,?)',
        highlightId,
        id,
        transcript.id,
        input.turnIndex,
        input.startOffset,
        input.endOffset,
        input.caption,
        Date.now(),
      ),
    ],
  )
  return { id: highlightId }
}
export async function removeHighlight(c: Context, id: string) {
  const highlight = ensure(
    await c.db.select().from(transcriptHighlights).where(eq(transcriptHighlights.id, id)).get(),
  )
  const submission = await ownSubmission(c, highlight.submissionId)
  await atomic(
    c,
    [{ table: 'submissions', id: submission.id, revision: submission.revision }],
    [stmt(c, 'DELETE FROM transcript_highlights WHERE id=?', id)],
  )
  return { ok: true }
}
export async function submissionHighlights(c: Context, id: string) {
  await readSubmission(c, id)
  const rows = await c.db
    .select({ highlight: transcriptHighlights, transcript: transcripts })
    .from(transcriptHighlights)
    .innerJoin(transcripts, eq(transcripts.id, transcriptHighlights.transcriptId))
    .where(eq(transcriptHighlights.submissionId, id))
    .orderBy(transcriptHighlights.createdAt)
  const result = []
  for (const { highlight, transcript } of rows) {
    if (!canReadTranscript(transcript, c.user)) continue
    try {
      const text = await sourceText(c, transcript, highlight.turnIndex)
      result.push({
        ...highlight,
        excerpt: highlightExcerpt(text, highlight.startOffset, highlight.endOffset),
        label: transcript.label,
        hidden: !!transcript.hiddenAt,
      })
    } catch (error) {
      if (
        !(error instanceof RangeError) &&
        !(error instanceof HttpError && [400, 404].includes(error.status))
      )
        throw error
      // A source removed from storage or an unrecognized message cannot leak a stale copy.
      result.push({ ...highlight, excerpt: null, label: transcript.label, hidden: !!transcript.hiddenAt })
    }
  }
  return result
}
