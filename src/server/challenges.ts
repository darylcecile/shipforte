import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { attempts, awards, challenges, submissions } from '../db/schema'
import { attemptAward, categories, day, tiers } from '../domain/rules'
import { canEditChallenge, editedChallengeStatus, isPublishedChallenge } from '../domain/challenge-status'
import { requirementsSchema, withRequirements } from '../domain/challenge-requirements'
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

export const challengeInput = z.object({
  title: z.string().trim().min(5).max(120),
  summary: z.string().trim().min(20).max(250),
  brief: z.string().trim().min(50).max(20_000),
  requirements: requirementsSchema.optional(),
  days: z.number().int().min(1).max(365),
  tier: z.enum(['small', 'medium', 'large', 'xlarge']),
  category: z.enum(categories),
})
export async function saveChallenge(c: Context, id?: string) {
  const user = requireUser(c)
  const value = challengeInput.parse(await c.request.json())
  const now = Date.now()
  if (!id) {
    const challengeId = crypto.randomUUID()
    await c.db
      .insert(challenges)
      .values({ ...value, id: challengeId, authorId: user.id, createdAt: now, updatedAt: now })
    return { id: challengeId }
  }
  const previous = ensure(await c.db.select().from(challenges).where(eq(challenges.id, id)).get())
  if (!canEditChallenge(previous, user))
    throw new HttpError(403, 'Only moderators can edit published or archived challenges.')
  await atomic(
    c,
    [{ table: 'challenges', id, revision: previous.revision }],
    [
      stmt(
        c,
        'UPDATE challenges SET title=?, summary=?, brief=?, days=?, tier=?, category=?, status=?, updated_at=?,requirements=? WHERE id=?',
        value.title,
        value.summary,
        value.brief,
        value.days,
        value.tier,
        value.category,
        editedChallengeStatus(previous.status),
        now,
        JSON.stringify(value.requirements ?? withRequirements(previous).requirements),
        id,
      ),
    ],
  )
  return { id }
}
export async function moderateChallenge(c: Context, id: string) {
  requireModerator(c)
  const input = z
    .object({
      status: z.enum(['live', 'rejected', 'changes_requested']),
      reason: z.string().trim().max(2000),
    })
    .parse(await c.request.json())
  if (input.status !== 'live' && !input.reason)
    throw new HttpError(400, 'Include feedback for the challenge author.')
  const row = ensure(await c.db.select().from(challenges).where(eq(challenges.id, id)).get())
  if (isPublishedChallenge(row.status))
    throw new HttpError(400, 'This challenge has already been published. Use the edit or archive actions.')
  await atomic(
    c,
    [{ table: 'challenges', id, revision: row.revision }],
    [
      stmt(
        c,
        'UPDATE challenges SET status=?,feedback=?,published_at=?,updated_at=? WHERE id=?',
        input.status,
        input.reason,
        input.status === 'live' ? Date.now() : null,
        Date.now(),
        id,
      ),
      notify(
        c,
        row.authorId,
        `Challenge ${input.status.replace('_', ' ')}`,
        input.reason || `${row.title} is now open to builders.`,
        `/challenges/${id}`,
        id,
      ),
    ],
  )
  return { ok: true }
}
export async function archiveChallenge(c: Context, id: string) {
  requireModerator(c)
  const { archived } = z.object({ archived: z.boolean() }).parse(await c.request.json())
  const row = ensure(await c.db.select().from(challenges).where(eq(challenges.id, id)).get())
  if (!isPublishedChallenge(row.status))
    throw new HttpError(400, 'Only published challenges can be archived or restored.')
  const status = archived ? 'archived' : 'live'
  if (row.status === status) return { ok: true, status }
  const message = archived
    ? 'Unlisted from public discovery. Direct links and existing attempts remain available; new attempts and invitations are closed.'
    : 'Restored to public discovery and open to new attempts and invitations.'
  await atomic(
    c,
    [{ table: 'challenges', id, revision: row.revision }],
    [
      stmt(c, 'UPDATE challenges SET status=?,updated_at=? WHERE id=?', status, Date.now(), id),
      event(c, row.authorId, id, archived ? 'challenge_archived' : 'challenge_restored', message),
      notify(
        c,
        row.authorId,
        archived ? 'Challenge archived' : 'Challenge restored',
        `${row.title}: ${message}`,
        `/challenges/${id}`,
        id,
      ),
    ],
  )
  return { ok: true, status }
}
export async function startAttempt(c: Context, challengeId: string) {
  const user = requireUser(c)
  const { kind } = z
    .object({ kind: z.enum(['initial', 'repeat', 'redo', 'moderator']).default('initial') })
    .parse(await c.request.json())
  const challenge = ensure(
    await c.db
      .select()
      .from(challenges)
      .where(and(eq(challenges.id, challengeId), eq(challenges.status, 'live')))
      .get(),
    'This challenge is not accepting new attempts.',
  )
  const active = await c.db
    .select()
    .from(attempts)
    .where(
      and(eq(attempts.userId, user.id), eq(attempts.challengeId, challengeId), isNull(attempts.submittedAt)),
    )
    .get()
  if (active)
    throw new HttpError(409, 'You already have an attempt in progress. Its original deadline still applies.')
  const unpublished = await c.db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, user.id),
        eq(submissions.challengeId, challengeId),
        eq(submissions.visibility, 'private'),
      ),
    )
    .get()
  if (unpublished)
    throw new HttpError(
      409,
      'Publish your private submission before starting another attempt for this challenge.',
    )
  const previous = await c.db
    .select()
    .from(submissions)
    .where(and(eq(submissions.userId, user.id), eq(submissions.challengeId, challengeId)))
    .orderBy(desc(submissions.createdAt))
    .get()
  if (kind === 'initial' && previous)
    throw new HttpError(400, 'Choose a repeat attempt, redo, or moderator-enabled resubmission.')
  if (kind !== 'initial' && !previous)
    throw new HttpError(400, 'Accept the challenge to start your first attempt.')
  if (kind === 'redo' && (!previous?.redoUnlocked || previous.revoked))
    throw new HttpError(403, 'A redo has not been unlocked for your current submission.')
  if (kind === 'moderator' && !previous?.moderatorAllowed)
    throw new HttpError(403, 'A moderator has not enabled resubmission.')
  const existingAwards = await c.db
    .select()
    .from(awards)
    .where(and(eq(awards.userId, user.id), eq(awards.challengeId, challengeId), eq(awards.status, 'active')))
  const restoreIds = kind === 'redo' ? existingAwards.map((a) => a.submissionId) : []
  const award = attemptAward(
    kind,
    tiers[challenge.tier],
    previous?.revoked ?? false,
    existingAwards.reduce((sum, a) => sum + a.amount, 0),
  )
  const id = crypto.randomUUID()
  const now = Date.now()
  const guards: Guard[] = [
    userGuard(user),
    { table: 'challenges', id: challengeId, revision: challenge.revision },
  ]
  if (previous) guards.push({ table: 'submissions', id: previous.id, revision: previous.revision })
  const writes = [
    stmt(
      c,
      'INSERT INTO attempts(id,user_id,challenge_id,title,brief,tier,days,full_award,award,kind,previous_id,restore_ids,started_at,deadline,requirements) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id,
      user.id,
      challengeId,
      challenge.title,
      challenge.brief,
      challenge.tier,
      challenge.days,
      tiers[challenge.tier],
      award,
      kind,
      previous?.id ?? null,
      JSON.stringify(restoreIds),
      now,
      now + challenge.days * day,
      JSON.stringify(withRequirements(challenge).requirements),
    ),
    event(
      c,
      user.id,
      challengeId,
      'accepted',
      `${kind === 'initial' ? 'Accepted challenge' : `Started ${kind} attempt`}. ${challenge.days} days · ${award} kudos available.`,
      previous?.id,
    ),
    stmt(
      c,
      `INSERT INTO notifications(id,user_id,title,body,href,challenge_id,subject_id,created_at)
      SELECT lower(hex(randomblob(16))), sender_id, ?, ?, ?, challenge_id, recipient_id, ? FROM invitations WHERE recipient_id=? AND challenge_id=?`,
      `${user.login} started a challenge`,
      challenge.title,
      `/challenges/${challengeId}`,
      now,
      user.id,
      challengeId,
    ),
  ]
  if (kind === 'redo')
    writes.push(
      stmt(
        c,
        "UPDATE awards SET status='held' WHERE user_id=? AND challenge_id=? AND status='active'",
        user.id,
        challengeId,
      ),
      event(
        c,
        user.id,
        challengeId,
        'kudos_held',
        `${award} kudos removed until a valid submission arrives before the new deadline.`,
        previous?.id,
      ),
      notify(
        c,
        user.id,
        'Redo started',
        `${award} kudos are on hold. Submit before the new deadline to restore them.`,
        `/challenges/${challengeId}`,
        challengeId,
      ),
    )
  await atomic(c, guards, writes)
  return { id }
}
