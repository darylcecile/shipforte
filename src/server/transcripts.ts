import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { transcripts } from '../db/schema'
import {
  canReadTranscript,
  httpsUrl,
  maxTranscriptBytes,
  transcriptFormat,
  transcriptMetadata,
} from '../domain/agent-submissions'
import {
  atomic,
  ensure,
  event,
  HttpError,
  limitedBody,
  requireModerator,
  requireUser,
  stmt,
  type Context,
} from './context'
import { digest } from './crypto'
import { rateLimit } from './request-limits'
import { mergeReportedUsage, parseTranscript } from '../domain/transcript-data'
import { harnessForLink, harnessNames } from '../domain/harnesses'
import { linkedTranscriptMetadata } from './transcript-links'
import { publicSubmission, readSubmission } from './submission-access'

export function transcriptSummary(row: typeof transcripts.$inferSelect) {
  const { key: _key, hiddenBy: _hiddenBy, ...summary } = row
  return summary
}
export async function saveTranscript(c: Context, file: File, metadata: z.infer<typeof transcriptMetadata>) {
  const user = requireUser(c)
  const bytes = new Uint8Array(await file.arrayBuffer())
  let format: ReturnType<typeof transcriptFormat>
  try {
    format = transcriptFormat(file.name, bytes)
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid transcript.')
  }
  const id = crypto.randomUUID()
  const key = `transcripts/${id}`
  const detected = parseTranscript(new TextDecoder().decode(bytes), format, file.name)
  await c.env.ASSETS_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } })
  try {
    const row = await c.db
      .insert(transcripts)
      .values({
        id,
        userId: user.id,
        ...metadata,
        harness: detected.harness ?? metadata.harness,
        label:
          detected.title ||
          metadata.label ||
          file.name.replace(/\.(md|txt|json|jsonl)$/i, '').slice(0, 120) ||
          'Build session',
        version: detected.version || metadata.version,
        model: detected.models.join(', ').slice(0, 120) || metadata.model,
        agent: detected.agents.join(', ').slice(0, 120) || metadata.agent,
        models: detected.models,
        usage: mergeReportedUsage(detected.usage, metadata.usage),
        name: file.name.slice(0, 200),
        format,
        key,
        sha256: await digest(bytes),
        size: bytes.length,
        createdAt: Date.now(),
      })
      .returning()
      .get()
    return transcriptSummary(row)
  } catch (error) {
    await c.env.ASSETS_BUCKET.delete(key)
    throw error
  }
}
export async function uploadTranscript(c: Context) {
  const user = requireUser(c)
  await rateLimit(c, `transcript:${user.id}`, 40, 3_600_000)
  const bytes = await limitedBody(c.request, maxTranscriptBytes + 16_384)
  const form = await new Response(bytes, {
    headers: { 'Content-Type': c.request.headers.get('Content-Type') || '' },
  }).formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw new HttpError(400, 'Choose a transcript file.')
  const values = Object.fromEntries(form)
  return saveTranscript(
    c,
    file,
    transcriptMetadata.parse({
      ...values,
      usage: typeof values.usage === 'string' ? JSON.parse(values.usage) : null,
    }),
  )
}
export async function linkTranscript(c: Context, value?: unknown) {
  const user = requireUser(c)
  await rateLimit(c, `transcript:${user.id}`, 40, 3_600_000)
  const input = transcriptMetadata.extend({ sourceUrl: httpsUrl }).parse(value ?? (await c.request.json()))
  const detected = await linkedTranscriptMetadata(input.sourceUrl)
  const harness = detected?.harness ?? harnessForLink(input.sourceUrl) ?? input.harness
  const row = await c.db
    .insert(transcripts)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      ...input,
      harness,
      label:
        detected?.title ||
        input.label ||
        (harness === 'other' ? 'Shared build session' : `${harnessNames[harness]} session`),
      version: detected?.version || input.version,
      model: detected?.models.join(', ').slice(0, 120) || input.model,
      models: detected?.models ?? [],
      agent: detected?.agents.join(', ').slice(0, 120) || input.agent,
      usage: mergeReportedUsage(detected?.usage ?? null, input.usage),
      createdAt: Date.now(),
    })
    .returning()
    .get()
  return transcriptSummary(row)
}
export async function transcriptDetail(c: Context, id: string) {
  const row = ensure(await c.db.select().from(transcripts).where(eq(transcripts.id, id)).get())
  if (row.submissionId) await readSubmission(c, row.submissionId)
  if (!canReadTranscript(row, c.user)) throw new HttpError(404, 'Transcript not found.')
  const summary = visibleSummary(c, row)
  if (!row.key) return { ...summary, text: null }
  const stored = ensure(await c.env.ASSETS_BUCKET.get(row.key), 'Transcript unavailable.')
  if (new URL(c.request.url).searchParams.has('download'))
    return new Response(stored.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name || 'transcript.txt')}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  const text = await stored.text()
  return { ...summary, text, parsed: parseTranscript(text, row.format || 'txt', row.name || '') }
}
function visibleSummary(c: Context, row: typeof transcripts.$inferSelect) {
  return {
    ...transcriptSummary(row),
    moderationReason: c.user?.moderator || c.user?.id === row.userId ? row.moderationReason : null,
  }
}
export async function submissionTranscripts(c: Context, submissionId: string) {
  await readSubmission(c, submissionId)
  const rows = await c.db
    .select()
    .from(transcripts)
    .where(eq(transcripts.submissionId, submissionId))
    .orderBy(transcripts.createdAt)
  return rows.filter((row) => canReadTranscript(row, c.user)).map((row) => visibleSummary(c, row))
}
export async function validateTranscripts(c: Context, ids: string[]) {
  if (!ids.length) return []
  const user = requireUser(c)
  const rows = await c.db.select().from(transcripts).where(inArray(transcripts.id, ids))
  if (rows.length !== ids.length || rows.some((row) => row.userId !== user.id || row.submissionId))
    throw new HttpError(400, 'Choose new transcripts belonging to your account.')
  return rows.map(transcriptSummary)
}
export async function moderateTranscript(c: Context, id: string) {
  const moderator = requireModerator(c)
  const input = z
    .object({ hidden: z.boolean(), reason: z.string().trim().min(3).max(2000) })
    .parse(await c.request.json())
  const row = ensure(await c.db.select().from(transcripts).where(eq(transcripts.id, id)).get())
  if (!row.submissionId) throw new HttpError(400, 'Only submitted transcripts can be moderated.')
  const submission = await publicSubmission(c, row.submissionId)
  await atomic(
    c,
    [{ table: 'submissions', id: submission.id, revision: submission.revision }],
    [
      stmt(
        c,
        'UPDATE transcripts SET hidden_at=?,hidden_by=?,moderation_reason=? WHERE id=? AND submission_id=?',
        input.hidden ? Date.now() : null,
        moderator.id,
        input.reason,
        id,
        submission.id,
      ),
      event(
        c,
        row.userId,
        submission.challengeId,
        input.hidden ? 'transcript_hidden' : 'transcript_restored',
        `A build-session transcript was ${input.hidden ? 'hidden' : 'restored'} by a moderator.`,
        submission.id,
      ),
    ],
  )
  return { ok: true }
}

export async function removeTranscript(c: Context, id: string) {
  const user = requireUser(c)
  const row = ensure(
    await c.db
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.id, id), eq(transcripts.userId, user.id)))
      .get(),
  )
  if (row.submissionId) throw new HttpError(409, 'Submitted transcripts can only be hidden by a moderator.')
  // Publication holds the same user guard, so an attachment cannot disappear mid-submission.
  await atomic(
    c,
    [{ table: 'users', id: user.id, revision: user.revision }],
    [stmt(c, 'DELETE FROM transcripts WHERE id=? AND submission_id IS NULL', id)],
  )
  if (row.key) await c.env.ASSETS_BUCKET.delete(row.key)
  return { ok: true }
}
