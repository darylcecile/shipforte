import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { attempts, awards, repositoryClaims, submissions, uploads, users } from '../db/schema'
import { copiedFiles, onTime } from '../domain/rules'
import { eligibleKudos, releasedKudos } from '../domain/submission-visibility'
import {
  atomic,
  ensure,
  event,
  HttpError,
  notify,
  requireModerator,
  requireUser,
  stmt,
  userGuard,
  type Context,
  type Guard,
} from './context'
import { defaultBranchCommit, verifiedRepository } from './github'
import { loadManifest, snapshot, type Manifest } from './snapshots'
import { submissionInput, type SubmissionInput } from '../domain/agent-submissions'
import { validateTranscripts } from './transcripts'
import { publicSubmission, readSubmission } from './submission-access'
import { awardActivity, claimRepository, heldKudos, publicationActivity } from './submission-awards'
import { validateEvidence, withRequirements } from '../domain/challenge-requirements'

async function checkReuse(
  c: Context,
  root: number,
  manifest: Manifest,
  attempt: typeof attempts.$inferSelect,
) {
  const claim = await c.db.select().from(repositoryClaims).where(eq(repositoryClaims.rootId, root)).get()
  const previous = attempt.previousId
    ? await c.db.select().from(submissions).where(eq(submissions.id, attempt.previousId)).get()
    : undefined
  const exception = (attempt.kind === 'redo' || attempt.kind === 'moderator') && previous?.repoRoot === root
  if (attempt.kind === 'redo' && previous?.repoRoot !== root)
    throw new HttpError(400, 'A redo must improve the same repository.')
  if (attempt.kind === 'repeat' && previous?.repoRoot === root)
    throw new HttpError(400, 'A repeat attempt requires a new repository. Forks count as reuse.')
  if (claim && !(exception && claim.userId === attempt.userId && claim.challengeId === attempt.challengeId)) {
    throw new HttpError(
      409,
      'This repository or its fork has already been claimed for kudos and cannot be reused.',
    )
  }
  const matching = await stmt(
    c,
    'SELECT root_id FROM fingerprints WHERE fingerprint=?',
    manifest.fingerprint,
  ).first<{ root_id: number }>()
  if (matching && !(exception && matching.root_id === root))
    throw new HttpError(409, 'This code is a copy of a repository already claimed for kudos.')
  if (previous && attempt.kind === 'repeat' && previous.fingerprint === manifest.fingerprint)
    throw new HttpError(409, 'A copied repository does not qualify as a new attempt.')
  if (!manifest.codeHashes.length) return
  const matches = await stmt(
    c,
    `SELECT root_id, COUNT(*) AS shared,
    (SELECT COUNT(*) FROM file_claims all_files WHERE all_files.root_id = file_claims.root_id) AS total
    FROM file_claims WHERE hash IN (SELECT value FROM json_each(?)) GROUP BY root_id`,
    JSON.stringify(manifest.codeHashes),
  ).all<{ root_id: number; shared: number; total: number }>()
  const copied = matches.results.some(
    (m) => !(exception && m.root_id === root) && copiedFiles(m.shared, manifest.codeHashes.length, m.total),
  )
  if (copied)
    throw new HttpError(
      409,
      'This implementation substantially copies a repository already claimed for kudos. Contact a moderator if you believe this is incorrect.',
    )
}
export async function submitProject(c: Context) {
  return createSubmission(c, submissionInput.parse(await c.request.json()))
}
export async function validateSubmissionAttachments(c: Context, input: SubmissionInput) {
  const user = requireUser(c)
  const images = await c.db.select().from(uploads).where(inArray(uploads.id, input.screenshots))
  if (
    images.length !== input.screenshots.length ||
    images.some((i) => i.userId !== user.id || i.submissionId)
  )
    throw new HttpError(400, 'Upload at least one new screenshot for this submission.')
  return {
    images: images.map((i) => ({ id: i.id, name: i.name })),
    transcripts: await validateTranscripts(c, input.transcripts),
  }
}
// Both transports use this service. Only browser-authenticated code calls it for an MCP draft.
export async function createSubmission(
  c: Context,
  input: SubmissionInput,
  review?: {
    commitSha: string
    draftId: string
    guards: Guard[]
  },
) {
  const receivedAt = c.receivedAt
  const user = requireUser(c)
  const attempt = ensure(
    await c.db
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, input.attemptId), eq(attempts.userId, user.id)))
      .get(),
  )
  if (attempt.submittedAt) throw new HttpError(409, 'This attempt has already been submitted.')
  try {
    validateEvidence(withRequirements(attempt).requirements, input.evidence, input.screenshots)
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid requirement evidence.')
  }
  await validateSubmissionAttachments(c, input)
  const { repo, token, publicRead } = await verifiedRepository(c, input.repoId)
  const commit = await defaultBranchCommit(token, repo, publicRead)
  if (review && commit.sha !== review.commitSha)
    throw new HttpError(
      409,
      'The default branch changed. Refresh the commit preview and review it before submitting.',
    )
  const root = repo.source?.id ?? repo.id
  const previous = attempt.previousId
    ? ensure(await c.db.select().from(submissions).where(eq(submissions.id, attempt.previousId)).get())
    : null
  if (previous?.repoId === repo.id && previous.commitSha === commit.sha)
    throw new HttpError(400, 'Push your improvements to the repository’s default branch before resubmitting.')
  const manifest = await snapshot(c, repo.full_name, commit.sha, token, publicRead)
  await checkReuse(c, root, manifest, attempt)
  const id = crypto.randomUUID()
  const manifestKey = `snapshots/${id}.json`
  await c.env.ASSETS_BUCKET.put(manifestKey, JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json' },
  })
  const timely = onTime(receivedAt, attempt.deadline)
  const available = attempt.kind === 'redo' ? await heldKudos(c, attempt) : attempt.award
  const eligible = eligibleKudos(receivedAt, attempt.deadline, available)
  const isPrivate = input.visibility === 'private'
  const earned = isPrivate ? 0 : eligible
  const guards: Guard[] = [userGuard(user), ...(review?.guards ?? [])]
  if (previous) guards.push({ table: 'submissions', id: previous.id, revision: previous.revision })
  const writes = [
    stmt(
      c,
      'INSERT INTO submissions(id,attempt_id,user_id,challenge_id,title,description,demo_url,repo_id,repo_name,repo_root,commit_sha,manifest_key,fingerprint,previous_id,created_at,visibility,published_at,evidence,video_url,learnings) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id,
      attempt.id,
      user.id,
      attempt.challengeId,
      input.title,
      input.description,
      input.demoUrl || null,
      repo.id,
      repo.full_name,
      root,
      commit.sha,
      manifestKey,
      manifest.fingerprint,
      previous?.id ?? null,
      receivedAt,
      input.visibility,
      isPrivate ? null : receivedAt,
      JSON.stringify(input.evidence),
      input.videoUrl,
      input.learnings,
    ),
    stmt(c, 'UPDATE attempts SET submitted_at=? WHERE id=?', receivedAt, attempt.id),
    stmt(
      c,
      'UPDATE uploads SET submission_id=? WHERE id IN (SELECT value FROM json_each(?))',
      id,
      JSON.stringify(input.screenshots),
    ),
    event(
      c,
      user.id,
      attempt.challengeId,
      'submitted',
      `Submitted ${isPrivate ? 'privately ' : ''}“${input.title}” at ${commit.sha.slice(0, 7)}. ${timely ? 'Before the deadline.' : 'After the deadline; no kudos awarded.'}${isPrivate && eligible ? ` ${eligible} kudos withheld until publication.` : ''}`,
      id,
    ),
  ]
  if (input.transcripts.length)
    writes.push(
      stmt(
        c,
        'UPDATE transcripts SET submission_id=? WHERE id IN (SELECT value FROM json_each(?))',
        id,
        JSON.stringify(input.transcripts),
      ),
    )
  if (review)
    writes.push(stmt(c, 'UPDATE submission_drafts SET submission_id=? WHERE id=?', id, review.draftId))
  if (!isPrivate)
    writes.push(
      ...publicationActivity(
        c,
        {
          id,
          title: input.title,
          userId: user.id,
          login: user.login,
          challengeId: attempt.challengeId,
          previousId: previous?.id ?? null,
        },
        receivedAt,
      ),
    )
  if (eligible > 0) {
    writes.push(
      stmt(
        c,
        'INSERT INTO awards(submission_id,user_id,challenge_id,amount,status,created_at) VALUES(?,?,?,?,?,?)',
        id,
        user.id,
        attempt.challengeId,
        eligible,
        isPrivate ? 'pending' : 'active',
        receivedAt,
      ),
      ...claimRepository(c, attempt, root, manifest),
    )
    if (!isPrivate) writes.push(...awardActivity(c, attempt, id, earned))
  }
  try {
    await atomic(c, guards, writes)
  } catch (error) {
    await c.env.ASSETS_BUCKET.delete(manifestKey)
    throw error
  }
  return { id, earned, withheld: isPrivate ? eligible : 0, visibility: input.visibility, onTime: timely }
}
export async function publishSubmission(c: Context, id: string) {
  const user = requireUser(c)
  const row = ensure(
    await c.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.id, id), eq(submissions.userId, user.id)))
      .get(),
  )
  if (row.visibility === 'public') return { id, visibility: 'public', alreadyPublished: true }
  const { revision } = z
    .object({ revision: z.number().int().nonnegative(), visibility: z.literal('public') })
    .strict()
    .parse(await c.request.json())
  if (revision !== row.revision)
    throw new HttpError(409, 'This submission changed. Refresh and review it again.')
  const attempt = ensure(await c.db.select().from(attempts).where(eq(attempts.id, row.attemptId)).get())
  const award = await c.db.select().from(awards).where(eq(awards.submissionId, id)).get()
  const earned =
    award?.status === 'pending' && !row.revoked
      ? eligibleKudos(
          row.createdAt,
          attempt.deadline,
          releasedKudos(award.amount, attempt.kind, await heldKudos(c, attempt)),
        )
      : 0
  const previous = row.previousId ? await readSubmission(c, row.previousId) : null
  const now = Date.now()
  const guards: Guard[] = [userGuard(user), { table: 'submissions', id, revision: row.revision }]
  if (previous) guards.push({ table: 'submissions', id: previous.id, revision: previous.revision })
  const writes = [
    stmt(c, "UPDATE submissions SET visibility='public',published_at=? WHERE id=?", now, id),
    event(
      c,
      user.id,
      row.challengeId,
      'published',
      `Published “${row.title}”. Deadline eligibility uses the original submission time.`,
      id,
    ),
    ...publicationActivity(c, { ...row, login: user.login }, now),
    ...awardActivity(c, attempt, id, earned),
  ]
  if (award?.status === 'pending')
    writes.push(
      stmt(
        c,
        "UPDATE awards SET status='active',amount=? WHERE submission_id=? AND status='pending'",
        earned,
        id,
      ),
    )
  await atomic(c, guards, writes)
  return { id, earned, visibility: 'public', alreadyPublished: false }
}
export async function moderateSubmission(c: Context, id: string) {
  const moderator = requireModerator(c)
  const input = z
    .object({
      action: z.enum(['review', 'revoke', 'allow']),
      reason: z.string().trim().min(3).max(2000),
      allowResubmission: z.boolean().default(false),
    })
    .parse(await c.request.json())
  const row = await publicSubmission(c, id)
  if (row.archived && input.action === 'allow')
    throw new HttpError(400, 'Allow resubmission on the latest version instead.')
  const owner = ensure(await c.db.select().from(users).where(eq(users.id, row.userId)).get())
  const guards: Guard[] = [userGuard(owner), { table: 'submissions', id, revision: row.revision }]
  const writes = [
    event(
      c,
      owner.id,
      row.challengeId,
      `moderator_${input.action}`,
      `${moderator.login}: ${input.reason}`,
      id,
    ),
  ]
  if (input.action === 'revoke') {
    if (row.revoked) throw new HttpError(400, 'This submission is already revoked.')
    writes.push(
      stmt(
        c,
        'UPDATE submissions SET revoked=1,moderator_allowed=?,redo_unlocked=0 WHERE id=?',
        Number(input.allowResubmission && !row.archived),
        id,
      ),
      stmt(c, "UPDATE awards SET status='revoked' WHERE submission_id=?", id),
      stmt(
        c,
        `UPDATE attempts SET award=COALESCE((SELECT SUM(amount) FROM awards
        WHERE status='held' AND submission_id IN (SELECT value FROM json_each(attempts.restore_ids))),0)
        WHERE user_id=? AND kind='redo' AND submitted_at IS NULL`,
        owner.id,
      ),
      stmt(
        c,
        `UPDATE awards SET amount=MIN(amount,COALESCE((SELECT SUM(source.amount) FROM awards source
        WHERE source.status='held' AND source.submission_id IN (SELECT value FROM json_each(
          (SELECT a.restore_ids FROM attempts a JOIN submissions s ON s.attempt_id=a.id WHERE s.id=awards.submission_id)
        ))),0)) WHERE user_id=? AND status='pending' AND submission_id IN (
          SELECT s.id FROM submissions s JOIN attempts a ON a.id=s.attempt_id WHERE a.kind='redo'
        )`,
        owner.id,
      ),
      notify(
        c,
        owner.id,
        'Submission award revoked',
        input.reason,
        `/submissions/${id}`,
        row.challengeId,
        owner.id,
        id,
      ),
    )
  }
  if (input.action === 'allow')
    writes.push(stmt(c, 'UPDATE submissions SET moderator_allowed=1 WHERE id=?', id))
  if (input.action !== 'revoke')
    writes.push(
      notify(
        c,
        owner.id,
        input.action === 'allow' ? 'A new submission is allowed' : 'A moderator reviewed your submission',
        input.reason,
        `/submissions/${id}`,
        row.challengeId,
        owner.id,
        id,
      ),
    )
  await atomic(c, guards, writes)
  return { ok: true }
}
export async function snapshotFile(c: Context, id: string) {
  const row = await readSubmission(c, id)
  const manifest = await loadManifest(c, row.manifestKey)
  const path = new URL(c.request.url).searchParams.get('path')
  if (!path) return { files: manifest.files }
  const file = ensure(
    manifest.files.find((f) => f.path === path),
    'File not found in this snapshot.',
  )
  const blob = ensure(await c.env.ASSETS_BUCKET.get(`blobs/${file.hash}`), 'Snapshot file unavailable.')
  if (new URL(c.request.url).searchParams.has('download')) {
    return new Response(blob.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.split('/').pop()!)}`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
  return { ...file, contents: file.binary ? null : await blob.text() }
}
