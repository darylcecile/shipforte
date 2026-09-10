import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { attempts, awards, repositoryClaims, submissions, uploads, users } from '../db/schema'
import { copiedFiles, onTime } from '../domain/rules'
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

const submissionInput = z.object({
  attemptId: z.string().uuid(),
  repoId: z.number().int().positive(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(20).max(10_000),
  demoUrl: z
    .union([z.literal(''), z.url().refine((s) => s.startsWith('https://'), 'Demo links must use HTTPS.')])
    .optional(),
  screenshots: z.array(z.string().uuid()).min(1).max(20),
})
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
    throw new HttpError(409, 'This repository or its fork has already earned kudos and cannot be reused.')
  }
  const matching = await stmt(
    c,
    'SELECT root_id FROM fingerprints WHERE fingerprint=?',
    manifest.fingerprint,
  ).first<{ root_id: number }>()
  if (matching && !(exception && matching.root_id === root))
    throw new HttpError(409, 'This code is a copy of a repository that has already earned kudos.')
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
      'This implementation substantially copies an awarded repository. Contact a moderator if you believe this is incorrect.',
    )
}
export async function submitProject(c: Context) {
  const receivedAt = c.receivedAt
  const user = requireUser(c)
  const input = submissionInput.parse(await c.request.json())
  if (new Set(input.screenshots).size !== input.screenshots.length)
    throw new HttpError(400, 'Each screenshot must be unique.')
  const attempt = ensure(
    await c.db
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, input.attemptId), eq(attempts.userId, user.id)))
      .get(),
  )
  if (attempt.submittedAt) throw new HttpError(409, 'This attempt has already been submitted.')
  const images = await c.db.select().from(uploads).where(inArray(uploads.id, input.screenshots))
  if (
    images.length !== input.screenshots.length ||
    images.some((i) => i.userId !== user.id || i.submissionId)
  )
    throw new HttpError(400, 'Upload at least one new screenshot for this submission.')
  const { repo, token, publicRead } = await verifiedRepository(c, input.repoId)
  const commit = await defaultBranchCommit(token, repo, publicRead)
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
  const heldAwards =
    attempt.kind === 'redo' && attempt.restoreIds.length
      ? await c.db
          .select()
          .from(awards)
          .where(
            and(
              sql`${awards.submissionId} IN (SELECT value FROM json_each(${JSON.stringify(attempt.restoreIds)}))`,
              eq(awards.status, 'held'),
            ),
          )
      : []
  const available = attempt.kind === 'redo' ? heldAwards.reduce((sum, a) => sum + a.amount, 0) : attempt.award
  const earned = timely ? available : 0
  const guards: Guard[] = [userGuard(user)]
  if (previous) guards.push({ table: 'submissions', id: previous.id, revision: previous.revision })
  const writes = [
    stmt(
      c,
      'INSERT INTO submissions(id,attempt_id,user_id,challenge_id,title,description,demo_url,repo_id,repo_name,repo_root,commit_sha,manifest_key,fingerprint,previous_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
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
      `Submitted “${input.title}” at ${commit.sha.slice(0, 7)}. ${timely ? 'Before the deadline.' : 'After the deadline; no kudos awarded.'}`,
      id,
    ),
    stmt(
      c,
      `INSERT INTO notifications(id,user_id,title,body,href,challenge_id,subject_id,submission_id,created_at)
      SELECT lower(hex(randomblob(16))),sender_id,?,?,?,?,recipient_id,?,? FROM invitations WHERE recipient_id=? AND challenge_id=?`,
      `${user.login} submitted a project`,
      input.title,
      `/submissions/${id}`,
      attempt.challengeId,
      id,
      receivedAt,
      user.id,
      attempt.challengeId,
    ),
  ]
  if (previous)
    writes.push(stmt(c, 'UPDATE submissions SET archived=1,replacement_id=? WHERE id=?', id, previous.id))
  if (earned > 0) {
    writes.push(
      stmt(
        c,
        "INSERT INTO awards(submission_id,user_id,challenge_id,amount,status,created_at) VALUES(?,?,?,?,'active',?)",
        id,
        user.id,
        attempt.challengeId,
        earned,
        receivedAt,
      ),
      event(
        c,
        user.id,
        attempt.challengeId,
        attempt.kind === 'redo' ? 'kudos_restored' : 'kudos_awarded',
        `${earned} kudos ${attempt.kind === 'redo' ? 'restored' : 'awarded'}.`,
        id,
      ),
      notify(
        c,
        user.id,
        `${earned} kudos ${attempt.kind === 'redo' ? 'restored' : 'earned'}`,
        `Your submission for ${attempt.title} arrived on time.`,
        `/submissions/${id}`,
        attempt.challengeId,
        user.id,
        id,
      ),
      stmt(
        c,
        'INSERT INTO repository_claims(root_id,user_id,challenge_id) VALUES(?,?,?) ON CONFLICT(root_id) DO UPDATE SET user_id=CASE WHEN user_id=excluded.user_id AND challenge_id=excluded.challenge_id THEN user_id ELSE NULL END',
        root,
        user.id,
        attempt.challengeId,
      ),
      stmt(
        c,
        'INSERT INTO fingerprints(fingerprint,root_id) VALUES(?,?) ON CONFLICT(fingerprint) DO UPDATE SET root_id=CASE WHEN root_id=excluded.root_id THEN root_id ELSE NULL END',
        manifest.fingerprint,
        root,
      ),
      stmt(
        c,
        'INSERT OR IGNORE INTO file_claims(hash,root_id) SELECT value,? FROM json_each(?)',
        root,
        JSON.stringify(manifest.codeHashes),
      ),
    )
    if (attempt.kind === 'redo')
      writes.push(
        stmt(
          c,
          "UPDATE awards SET status='transferred' WHERE status='held' AND submission_id IN (SELECT value FROM json_each(?))",
          JSON.stringify(attempt.restoreIds),
        ),
      )
  }
  try {
    await atomic(c, guards, writes)
  } catch (error) {
    await c.env.ASSETS_BUCKET.delete(manifestKey)
    throw error
  }
  return { id, earned, onTime: timely }
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
  const row = ensure(await c.db.select().from(submissions).where(eq(submissions.id, id)).get())
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
  const row = ensure(await c.db.select().from(submissions).where(eq(submissions.id, id)).get())
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
