import { and, desc, eq, getTableColumns, gt, like, or, sql, type SQL } from 'drizzle-orm'
import {
  attempts,
  awards,
  challenges,
  comments,
  events,
  follows,
  notifications,
  portfolioPins,
  submissions,
  uploads,
  users,
} from '../db/schema'
import { ranks, tiers } from '../domain/rules'
import { canReadChallenge } from '../domain/challenge-status'
import { ensure, HttpError, requireModerator, requireUser, stmt, type Context } from './context'
import { submissionTranscripts } from './transcripts'
import { readableSubmissions } from './submission-access'
import { withRequirements } from '../domain/challenge-requirements'
import { submissionHighlights } from './showcase'

const voteCount = (value: string) =>
  sql<number>`(SELECT count(*) FROM votes WHERE submission_id=${submissions.id} AND value=${value})`.mapWith(
    Number,
  )
export async function submissionCards(c: Context, filter?: SQL, limit = 60) {
  return c.db
    .select({
      ...getTableColumns(submissions),
      login: users.login,
      avatar: users.avatar,
      challengeTitle: challenges.title,
      up: voteCount('up'),
      down: voteCount('down'),
      redo: voteCount('redo'),
      kudos:
        sql<number>`COALESCE((SELECT amount FROM awards WHERE submission_id=${submissions.id} AND status='active'),0)`.mapWith(
          Number,
        ),
      withheldKudos:
        sql<number>`COALESCE((SELECT amount FROM awards WHERE submission_id=${submissions.id} AND status='pending'),0)`.mapWith(
          Number,
        ),
      imageId: sql<string | null>`(SELECT id FROM uploads WHERE submission_id=${submissions.id} LIMIT 1)`,
    })
    .from(submissions)
    .innerJoin(users, eq(users.id, submissions.userId))
    .innerJoin(challenges, eq(challenges.id, submissions.challengeId))
    .where(and(readableSubmissions(c), filter))
    .orderBy(desc(sql`COALESCE(${submissions.publishedAt}, ${submissions.createdAt})`))
    .limit(limit)
}
export async function bootstrap(c: Context) {
  const unread = c.user
    ? await stmt(
        c,
        'SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND read_at IS NULL',
        c.user.id,
      ).first<{ count: number }>()
    : null
  const kudos = c.user
    ? await stmt(
        c,
        "SELECT COALESCE(SUM(amount),0) AS count FROM awards WHERE user_id=? AND status='active'",
        c.user.id,
      ).first<{ count: number }>()
    : null
  return {
    user: c.user ? { ...c.user, kudos: kudos?.count || 0 } : null,
    unread: unread?.count || 0,
    githubReady: Boolean(c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET && c.env.TOKEN_ENCRYPTION_KEY),
    installUrl: c.env.GITHUB_APP_SLUG
      ? `https://github.com/apps/${c.env.GITHUB_APP_SLUG}/installations/new`
      : null,
  }
}
export async function home(c: Context) {
  const list = await c.db
    .select({
      ...getTableColumns(challenges),
      author: users.login,
      completed: sql<boolean>`EXISTS(SELECT 1 FROM attempts
        WHERE challenge_id=${challenges.id} AND user_id=${c.user?.id ?? ''} AND submitted_at IS NOT NULL)`.mapWith(
        Boolean,
      ),
      builders:
        sql<number>`(SELECT COUNT(DISTINCT user_id) FROM attempts WHERE challenge_id=${challenges.id})`.mapWith(
          Number,
        ),
      submissionCount:
        sql<number>`(SELECT COUNT(*) FROM submissions WHERE challenge_id=${challenges.id} AND archived=0 AND visibility='public')`.mapWith(
          Number,
        ),
    })
    .from(challenges)
    .innerJoin(users, eq(users.id, challenges.authorId))
    .where(eq(challenges.status, 'live'))
    .orderBy(desc(challenges.publishedAt))
    .limit(200)
  const mine = c.user
    ? await c.db
        .select()
        .from(attempts)
        .where(eq(attempts.userId, c.user.id))
        .orderBy(desc(attempts.startedAt))
        .limit(100)
    : []
  const stats = await stmt(
    c,
    `SELECT (SELECT COUNT(*) FROM users WHERE github_id>0) AS builders, (SELECT COUNT(*) FROM submissions WHERE visibility='public') AS submissions,
    (SELECT COALESCE(SUM(amount),0) FROM awards WHERE status='active') AS kudos`,
  ).first<{ builders: number; submissions: number; kudos: number }>()
  return {
    challenges: list,
    attempts: mine.map(withRequirements),
    mySubmissions: c.user
      ? await c.db
          .select({
            id: submissions.id,
            attemptId: submissions.attemptId,
            visibility: submissions.visibility,
          })
          .from(submissions)
          .where(eq(submissions.userId, c.user.id))
      : [],
    recent: await submissionCards(
      c,
      and(
        eq(challenges.status, 'live'),
        eq(submissions.visibility, 'public'),
        eq(submissions.archived, false),
        eq(submissions.revoked, false),
      ),
      6,
    ),
    stats,
  }
}
export async function challengeDetail(c: Context, id: string) {
  const challenge = ensure(
    await c.db
      .select({ ...getTableColumns(challenges), author: users.login })
      .from(challenges)
      .innerJoin(users, eq(users.id, challenges.authorId))
      .where(eq(challenges.id, id))
      .get(),
  )
  if (!canReadChallenge(challenge, c.user)) throw new HttpError(404, 'Challenge not found.')
  const all = await submissionCards(c, eq(submissions.challengeId, id), 1000)
  const leaderboard = ranks(
    all.filter((s) => s.visibility === 'public' && !s.archived && !s.revoked),
    (s) => s.up - s.down,
  )
  const mine = c.user
    ? await c.db
        .select()
        .from(attempts)
        .where(and(eq(attempts.userId, c.user.id), eq(attempts.challengeId, id)))
        .orderBy(desc(attempts.startedAt))
    : []
  const currentKudos = c.user
    ? await c.db
        .select()
        .from(awards)
        .where(and(eq(awards.userId, c.user.id), eq(awards.challengeId, id), eq(awards.status, 'active')))
    : []
  return {
    challenge: withRequirements(challenge),
    leaderboard,
    submissions: all.filter((s) => s.visibility === 'public'),
    privateSubmissions: all.filter((s) => s.visibility === 'private'),
    attempts: mine.map(withRequirements),
    redoKudos: currentKudos.reduce((sum, a) => sum + a.amount, 0),
    fullAward: tiers[challenge.tier],
  }
}
export async function submissionDetail(c: Context, id: string) {
  const row = ensure((await submissionCards(c, eq(submissions.id, id), 1))[0])
  const attempt = ensure(await c.db.select().from(attempts).where(eq(attempts.id, row.attemptId)).get())
  const images = await c.db
    .select({ id: uploads.id, name: uploads.name })
    .from(uploads)
    .where(eq(uploads.submissionId, id))
  const discussion = await c.db
    .select({ ...getTableColumns(comments), login: users.login, avatar: users.avatar })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(eq(comments.submissionId, id))
    .orderBy(comments.createdAt)
    .limit(1000)
  const timeline = await c.db
    .select({ ...getTableColumns(events), actor: users.login })
    .from(events)
    .innerJoin(users, eq(users.id, events.actorId))
    .where(
      and(
        eq(events.challengeId, row.challengeId),
        sql`(${events.submissionId} IS NULL OR EXISTS(SELECT 1 FROM submissions visible_event
          WHERE visible_event.id=${events.submissionId} AND (visible_event.visibility='public' OR visible_event.user_id=${c.user?.id ?? ''})))`,
        or(
          eq(events.userId, row.userId),
          eq(events.kind, 'challenge_archived'),
          eq(events.kind, 'challenge_restored'),
        ),
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(300)
  const myVote = c.user
    ? await stmt(c, 'SELECT value FROM votes WHERE user_id=? AND submission_id=?', c.user.id, id).first<{
        value: 'up' | 'down' | 'redo'
      }>()
    : null
  return {
    submission: row,
    attempt: withRequirements(attempt),
    images,
    transcripts: await submissionTranscripts(c, id),
    highlights: await submissionHighlights(c, id),
    comments: discussion,
    timeline,
    myVote: myVote?.value ?? null,
  }
}
export async function people(c: Context) {
  const params = new URL(c.request.url).searchParams
  const query = params.get('q')?.slice(0, 100) || ''
  const onlyFollowing = params.get('following') === '1'
  const list = await c.db
    .select({
      ...getTableColumns(users),
      kudos:
        sql<number>`COALESCE((SELECT SUM(amount) FROM awards WHERE user_id=${users.id} AND status='active'),0)`.mapWith(
          Number,
        ),
      submissions:
        sql<number>`(SELECT COUNT(*) FROM submissions WHERE user_id=${users.id} AND archived=0 AND visibility='public')`.mapWith(
          Number,
        ),
      following:
        sql<number>`EXISTS(SELECT 1 FROM follows WHERE follower_id=${c.user?.id ?? ''} AND following_id=${users.id})`.mapWith(
          Boolean,
        ),
    })
    .from(users)
    .where(
      and(
        gt(users.githubId, 0),
        or(like(users.login, `%${query}%`), like(users.name, `%${query}%`)),
        onlyFollowing
          ? sql`EXISTS(SELECT 1 FROM follows WHERE follower_id=${c.user?.id || ''} AND following_id=${users.id})`
          : undefined,
      ),
    )
    .orderBy(
      desc(sql`COALESCE((SELECT SUM(amount) FROM awards WHERE user_id=${users.id} AND status='active'),0)`),
    )
    .limit(1000)
  return ranks(list, (p) => p.kudos)
}
export async function profile(c: Context, login: string) {
  const user = ensure(
    await c.db.select().from(users).where(eq(users.login, login)).get(),
    'Builder not found.',
  )
  const activeAwards = await c.db
    .select()
    .from(awards)
    .where(and(eq(awards.userId, user.id), eq(awards.status, 'active')))
  const following = c.user
    ? await c.db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, c.user.id), eq(follows.followingId, user.id)))
        .get()
    : null
  const counts = await stmt(
    c,
    'SELECT (SELECT COUNT(*) FROM follows WHERE following_id=?) AS followers,(SELECT COUNT(*) FROM follows WHERE follower_id=?) AS following',
    user.id,
    user.id,
  ).first<{ followers: number; following: number }>()
  const pins = await c.db
    .select()
    .from(portfolioPins)
    .where(eq(portfolioPins.userId, user.id))
    .orderBy(portfolioPins.position)
  const pinnedRows = await submissionCards(
    c,
    and(
      eq(submissions.userId, user.id),
      eq(submissions.visibility, 'public'),
      eq(submissions.archived, false),
      eq(submissions.revoked, false),
      sql`${submissions.id} IN (SELECT submission_id FROM portfolio_pins WHERE user_id=${user.id})`,
    ),
    3,
  )
  return {
    user,
    kudos: activeAwards.reduce((sum, a) => sum + a.amount, 0),
    following: Boolean(following),
    counts,
    pinned: pins.flatMap((pin) => pinnedRows.filter((row) => row.id === pin.submissionId)),
    portfolioOptions:
      c.user?.id === user.id
        ? await submissionCards(
            c,
            and(
              eq(submissions.userId, user.id),
              eq(submissions.visibility, 'public'),
              eq(submissions.archived, false),
              eq(submissions.revoked, false),
            ),
            200,
          )
        : [],
    submissions: await submissionCards(
      c,
      and(eq(submissions.userId, user.id), eq(submissions.visibility, 'public')),
    ),
  }
}
export async function inbox(c: Context) {
  const user = requireUser(c)
  return c.db
    .select({
      ...getTableColumns(notifications),
      progress: sql<
        string | null
      >`(SELECT json_object('startedAt',a.started_at,'deadline',a.deadline,'submittedAt',
          CASE WHEN a.user_id=${user.id} OR EXISTS(SELECT 1 FROM submissions progress_submission
            WHERE progress_submission.attempt_id=a.id AND progress_submission.visibility='public') THEN a.submitted_at ELSE NULL END)
        FROM attempts a WHERE a.challenge_id=${notifications.challengeId} AND a.user_id=${notifications.subjectId}
        ORDER BY a.started_at DESC LIMIT 1)`.mapWith((value: string | null) =>
        value
          ? (JSON.parse(value) as { startedAt: number; deadline: number; submittedAt: number | null })
          : null,
      ),
      votes: sql<string | null>`(SELECT json_object(
        'up',(SELECT COUNT(*) FROM votes WHERE submission_id=s.id AND value='up'),
        'down',(SELECT COUNT(*) FROM votes WHERE submission_id=s.id AND value='down'),
        'redo',(SELECT COUNT(*) FROM votes WHERE submission_id=s.id AND value='redo'))
        FROM submissions s WHERE s.challenge_id=${notifications.challengeId} AND s.user_id=${notifications.subjectId} AND s.visibility='public'
        ORDER BY s.created_at DESC LIMIT 1)`.mapWith((value: string | null) =>
        value ? (JSON.parse(value) as { up: number; down: number; redo: number }) : null,
      ),
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id),
        sql`(${notifications.submissionId} IS NULL OR EXISTS(SELECT 1 FROM submissions visible_notification WHERE visible_notification.id=${notifications.submissionId} AND (visible_notification.visibility='public' OR visible_notification.user_id=${user.id})))`,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(200)
}
export async function proposals(c: Context) {
  const user = requireUser(c)
  return c.db
    .select()
    .from(challenges)
    .where(eq(challenges.authorId, user.id))
    .orderBy(desc(challenges.updatedAt))
}
export async function moderation(c: Context) {
  requireModerator(c)
  return {
    challenges: await c.db.select().from(challenges).orderBy(desc(challenges.updatedAt)).limit(200),
    submissions: await submissionCards(c, eq(submissions.visibility, 'public'), 200),
  }
}
