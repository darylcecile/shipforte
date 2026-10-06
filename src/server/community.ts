import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { attempts, challenges, follows, users, votes } from '../db/schema'
import { requirementId, withRequirements } from '../domain/challenge-requirements'
import { redoEligible } from '../domain/rules'
import {
  atomic,
  ensure,
  event,
  HttpError,
  notify,
  requireUser,
  stmt,
  userGuard,
  type Context,
} from './context'
import { loadManifest } from './snapshots'
import { publicSubmission } from './submission-access'

export async function vote(c: Context, id: string) {
  const user = requireUser(c)
  const { value } = z
    .object({ value: z.enum(['up', 'down', 'redo']).nullable() })
    .parse(await c.request.json())
  const row = await publicSubmission(c, id)
  if (row.userId === user.id) throw new HttpError(403, 'You cannot vote on your own submission.')
  if (row.archived || row.revoked) throw new HttpError(403, 'Voting is closed on this submission.')
  const totals = await stmt(
    c,
    'SELECT value,COUNT(*) AS count FROM votes WHERE submission_id=? GROUP BY value',
    id,
  ).all<{ value: 'up' | 'down' | 'redo'; count: number }>()
  const own = await c.db
    .select()
    .from(votes)
    .where(and(eq(votes.submissionId, id), eq(votes.userId, user.id)))
    .get()
  const counts = { up: 0, down: 0, redo: 0 }
  for (const group of totals.results) counts[group.value] = group.count
  if (own) counts[own.value]--
  if (value) counts[value]++
  const unlocked = !row.redoUnlocked && redoEligible(counts.up, counts.down, counts.redo)
  const writes = [stmt(c, 'DELETE FROM votes WHERE submission_id=? AND user_id=?', id, user.id)]
  if (value)
    writes.push(stmt(c, 'INSERT INTO votes(submission_id,user_id,value) VALUES(?,?,?)', id, user.id, value))
  if (unlocked)
    writes.push(
      stmt(c, 'UPDATE submissions SET redo_unlocked=1 WHERE id=?', id),
      event(
        c,
        row.userId,
        row.challengeId,
        'redo_unlocked',
        'Community votes unlocked an opportunity to improve this submission.',
        id,
      ),
      notify(
        c,
        row.userId,
        'A fresh start, unlocked',
        'The community has unlocked a redo. Review the kudos notice before starting.',
        `/submissions/${id}`,
        row.challengeId,
        row.userId,
        id,
      ),
    )
  await atomic(c, [{ table: 'submissions', id, revision: row.revision }], writes)
  return { ok: true }
}
export async function addComment(c: Context, id: string) {
  const user = requireUser(c)
  const input = z
    .object({
      body: z.string().trim().min(1).max(5000),
      file: z.string().max(1024).nullable().default(null),
      line: z.number().int().positive().nullable().default(null),
      endLine: z.number().int().positive().nullable().default(null),
      requirementId: requirementId.nullable().default(null),
    })
    .parse(await c.request.json())
  const submission = await publicSubmission(c, id)
  if (input.requirementId) {
    const attempt = ensure(
      await c.db.select().from(attempts).where(eq(attempts.id, submission.attemptId)).get(),
    )
    if (input.file || !withRequirements(attempt).requirements.some((item) => item.id === input.requirementId))
      throw new HttpError(400, 'Choose a requirement from this submission’s accepted checklist.')
  }
  if (input.file) {
    const manifest = await loadManifest(c, submission.manifestKey)
    const file = ensure(
      manifest.files.find((f) => f.path === input.file),
      'File is not part of this submission.',
    )
    if (input.line && (file.binary || input.line > file.lines))
      throw new HttpError(400, 'Choose a valid line in the submitted file.')
    if (input.endLine && (!input.line || input.endLine < input.line || input.endLine > file.lines))
      throw new HttpError(400, 'Choose a valid line range.')
  } else if (input.line || input.endLine) throw new HttpError(400, 'Line comments require a file.')
  const commentId = crypto.randomUUID()
  const writes = [
    stmt(
      c,
      'INSERT INTO comments(id,submission_id,user_id,body,file,line,end_line,commit_sha,created_at,requirement_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
      commentId,
      id,
      user.id,
      input.body,
      input.file,
      input.line,
      input.endLine,
      input.file ? submission.commitSha : null,
      Date.now(),
      input.requirementId,
    ),
  ]
  if (user.id !== submission.userId)
    writes.push(
      notify(
        c,
        submission.userId,
        `${user.login} left feedback`,
        input.body.slice(0, 200),
        `/submissions/${id}`,
        submission.challengeId,
        submission.userId,
        id,
      ),
    )
  await atomic(c, [userGuard(user)], writes)
  return { id: commentId }
}
export async function follow(c: Context, id: string) {
  const user = requireUser(c)
  const { following } = z.object({ following: z.boolean() }).parse(await c.request.json())
  if (id === user.id) throw new HttpError(400, 'You cannot follow yourself.')
  const target = ensure(await c.db.select().from(users).where(eq(users.id, id)).get())
  if (target.githubId === 0) throw new HttpError(400, 'This is the platform curator, not a builder account.')
  if (following)
    await c.db.insert(follows).values({ followerId: user.id, followingId: id }).onConflictDoNothing()
  else await c.db.delete(follows).where(and(eq(follows.followerId, user.id), eq(follows.followingId, id)))
  return { ok: true }
}
export async function invite(c: Context, challengeId: string) {
  const user = requireUser(c)
  const { recipientId } = z.object({ recipientId: z.string().uuid() }).parse(await c.request.json())
  const recipient = ensure(await c.db.select().from(users).where(eq(users.id, recipientId)).get())
  const challenge = ensure(
    await c.db
      .select()
      .from(challenges)
      .where(and(eq(challenges.id, challengeId), eq(challenges.status, 'live')))
      .get(),
    'This challenge is not accepting new invitations.',
  )
  const following = await c.db
    .select()
    .from(follows)
    .where(and(eq(follows.followerId, user.id), eq(follows.followingId, recipientId)))
    .get()
  if (!following) throw new HttpError(403, 'You can invite people you follow.')
  const participating = await stmt(
    c,
    'SELECT id FROM attempts WHERE user_id=? AND challenge_id=? LIMIT 1',
    recipientId,
    challengeId,
  ).first()
  if (participating) throw new HttpError(409, 'This person has already taken on this challenge.')
  await atomic(
    c,
    [userGuard(recipient), { table: 'challenges', id: challengeId, revision: challenge.revision }],
    [
      stmt(
        c,
        'INSERT INTO invitations(id,sender_id,recipient_id,challenge_id,created_at) VALUES(?,?,?,?,?)',
        crypto.randomUUID(),
        user.id,
        recipientId,
        challengeId,
        Date.now(),
      ),
      notify(
        c,
        recipientId,
        `${user.login} invited you to build`,
        challenge.title,
        `/challenges/${challengeId}`,
        challengeId,
        recipientId,
      ),
    ],
  )
  return { ok: true }
}
export async function markRead(c: Context) {
  const user = requireUser(c)
  const { id } = z.object({ id: z.string().optional() }).parse(await c.request.json())
  await stmt(
    c,
    `UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL${id ? ' AND id=?' : ''}`,
    Date.now(),
    user.id,
    ...(id ? [id] : []),
  ).run()
  return { ok: true }
}
