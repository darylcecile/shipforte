import { and, eq, sql } from 'drizzle-orm'
import { awards, type Attempt } from '../db/schema'
import { event, notify, stmt, type Context } from './context'
import type { Manifest } from './snapshots'

export async function heldKudos(c: Context, attempt: Attempt) {
  if (attempt.kind !== 'redo' || !attempt.restoreIds.length) return 0
  const rows = await c.db
    .select()
    .from(awards)
    .where(
      and(
        sql`${awards.submissionId} IN (SELECT value FROM json_each(${JSON.stringify(attempt.restoreIds)}))`,
        eq(awards.status, 'held'),
      ),
    )
  return rows.reduce((total, award) => total + award.amount, 0)
}

export function claimRepository(c: Context, attempt: Attempt, root: number, manifest: Manifest) {
  return [
    stmt(
      c,
      'INSERT INTO repository_claims(root_id,user_id,challenge_id) VALUES(?,?,?) ON CONFLICT(root_id) DO UPDATE SET user_id=CASE WHEN user_id=excluded.user_id AND challenge_id=excluded.challenge_id THEN user_id ELSE NULL END',
      root,
      attempt.userId,
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
  ]
}

export function awardActivity(c: Context, attempt: Attempt, id: string, amount: number) {
  if (!amount) return []
  const restored = attempt.kind === 'redo'
  const writes = [
    event(
      c,
      attempt.userId,
      attempt.challengeId,
      restored ? 'kudos_restored' : 'kudos_awarded',
      `${amount} kudos ${restored ? 'restored' : 'awarded'}.`,
      id,
    ),
    notify(
      c,
      attempt.userId,
      `${amount} kudos ${restored ? 'restored' : 'earned'}`,
      `Your submission for ${attempt.title} arrived on time and is now public.`,
      `/submissions/${id}`,
      attempt.challengeId,
      attempt.userId,
      id,
    ),
  ]
  if (restored)
    writes.push(
      stmt(
        c,
        "UPDATE awards SET status='transferred' WHERE status='held' AND submission_id IN (SELECT value FROM json_each(?))",
        JSON.stringify(attempt.restoreIds),
      ),
    )
  return writes
}

export function publicationActivity(
  c: Context,
  input: {
    id: string
    title: string
    userId: string
    login: string
    challengeId: string
    previousId: string | null
  },
  now: number,
) {
  const writes = [
    stmt(
      c,
      `INSERT INTO notifications(id,user_id,title,body,href,challenge_id,subject_id,submission_id,created_at)
    SELECT lower(hex(randomblob(16))),sender_id,?,?,?,?,recipient_id,?,? FROM invitations WHERE recipient_id=? AND challenge_id=?`,
      `${input.login} submitted a project`,
      input.title,
      `/submissions/${input.id}`,
      input.challengeId,
      input.id,
      now,
      input.userId,
      input.challengeId,
    ),
  ]
  if (input.previousId)
    writes.push(
      stmt(c, 'UPDATE submissions SET archived=1,replacement_id=? WHERE id=?', input.id, input.previousId),
    )
  return writes
}
