import { sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { challengeStatuses } from '../domain/challenge-status'
import type { SubmissionInput } from '../domain/agent-submissions'
import type { SessionUsage } from '../domain/transcript-data'
import type { Requirement, RequirementEvidence } from '../domain/challenge-requirements'

export const users = sqliteTable('users', {
  id: text().primaryKey(),
  githubId: integer('github_id').notNull().unique(),
  login: text().notNull().unique(),
  name: text().notNull(),
  avatar: text().notNull(),
  bio: text().notNull().default(''),
  moderator: integer({ mode: 'boolean' }).notNull().default(false),
  revision: integer().notNull().default(0),
  createdAt: integer('created_at').notNull(),
})
export const credentials = sqliteTable('credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  token: text().notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: integer('expires_at'),
})
export const sessions = sqliteTable(
  'sessions',
  {
    hash: text().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('session_user').on(t.userId), index('session_expiry').on(t.expiresAt)],
)
export const oauthStates = sqliteTable('oauth_states', {
  hash: text().primaryKey(),
  verifier: text().notNull(),
  expiresAt: integer('expires_at').notNull(),
  returnTo: text('return_to').notNull().default('/'),
})
export const challenges = sqliteTable(
  'challenges',
  {
    id: text().primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    summary: text().notNull(),
    brief: text().notNull(),
    requirements: text({ mode: 'json' }).$type<Requirement[]>(),
    tier: text({ enum: ['small', 'medium', 'large', 'xlarge'] }).notNull(),
    days: integer().notNull(),
    category: text().notNull().default('Tools'),
    status: text({ enum: challengeStatuses }).notNull().default('pending'),
    feedback: text().notNull().default(''),
    publishedAt: integer('published_at'),
    revision: integer().notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('challenge_status').on(t.status, t.createdAt)],
)
export const attempts = sqliteTable(
  'attempts',
  {
    id: text().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id),
    title: text().notNull(),
    brief: text().notNull(),
    requirements: text({ mode: 'json' }).$type<Requirement[]>(),
    tier: text({ enum: ['small', 'medium', 'large', 'xlarge'] }).notNull(),
    days: integer().notNull(),
    fullAward: integer('full_award').notNull(),
    award: integer().notNull(),
    kind: text({ enum: ['initial', 'repeat', 'redo', 'moderator'] }).notNull(),
    previousId: text('previous_id'),
    restoreIds: text('restore_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
    startedAt: integer('started_at').notNull(),
    deadline: integer().notNull(),
    submittedAt: integer('submitted_at'),
  },
  (t) => [
    uniqueIndex('one_active_attempt')
      .on(t.userId, t.challengeId)
      .where(sql`${t.submittedAt} IS NULL`),
    index('attempt_user').on(t.userId),
  ],
)
export const submissions = sqliteTable(
  'submissions',
  {
    id: text().primaryKey(),
    attemptId: text('attempt_id')
      .notNull()
      .unique()
      .references(() => attempts.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id),
    title: text().notNull(),
    description: text().notNull(),
    demoUrl: text('demo_url'),
    evidence: text({ mode: 'json' }).$type<RequirementEvidence[]>().notNull().default([]),
    videoUrl: text('video_url').notNull().default(''),
    learnings: text().notNull().default(''),
    repoId: integer('repo_id').notNull(),
    repoName: text('repo_name').notNull(),
    repoRoot: integer('repo_root').notNull(),
    commitSha: text('commit_sha').notNull(),
    manifestKey: text('manifest_key').notNull(),
    fingerprint: text().notNull(),
    previousId: text('previous_id'),
    replacementId: text('replacement_id'),
    archived: integer({ mode: 'boolean' }).notNull().default(false),
    revoked: integer({ mode: 'boolean' }).notNull().default(false),
    redoUnlocked: integer('redo_unlocked', { mode: 'boolean' }).notNull().default(false),
    moderatorAllowed: integer('moderator_allowed', { mode: 'boolean' }).notNull().default(false),
    visibility: text({ enum: ['public', 'private'] })
      .notNull()
      .default('public'),
    publishedAt: integer('published_at'),
    revision: integer().notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('submission_challenge').on(t.challengeId, t.createdAt),
    index('submission_user').on(t.userId),
    index('submission_fingerprint').on(t.fingerprint),
  ],
)
export const portfolioPins = sqliteTable(
  'portfolio_pins',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    submissionId: text('submission_id')
      .notNull()
      .references(() => submissions.id),
    position: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.submissionId] }),
    uniqueIndex('portfolio_position').on(t.userId, t.position),
  ],
)

export const transcriptHighlights = sqliteTable(
  'transcript_highlights',
  {
    id: text().primaryKey(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => submissions.id),
    transcriptId: text('transcript_id')
      .notNull()
      .references(() => transcripts.id),
    turnIndex: integer('turn_index'),
    startOffset: integer('start_offset').notNull(),
    endOffset: integer('end_offset').notNull(),
    caption: text().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('highlight_submission').on(t.submissionId)],
)

export const repositoryClaims = sqliteTable('repository_claims', {
  rootId: integer('root_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  challengeId: text('challenge_id')
    .notNull()
    .references(() => challenges.id),
})
export const fingerprints = sqliteTable('fingerprints', {
  fingerprint: text().primaryKey(),
  rootId: integer('root_id').notNull(),
})
export const fileClaims = sqliteTable(
  'file_claims',
  {
    hash: text().notNull(),
    rootId: integer('root_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.hash, t.rootId] })],
)
export const uploads = sqliteTable(
  'uploads',
  {
    id: text().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    submissionId: text('submission_id').references(() => submissions.id),
    key: text().notNull(),
    name: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('upload_submission').on(t.submissionId)],
)
export const transcripts = sqliteTable(
  'transcripts',
  {
    id: text().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    submissionId: text('submission_id').references(() => submissions.id),
    harness: text().notNull(),
    label: text().notNull(),
    version: text().notNull().default(''),
    model: text().notNull().default(''),
    agent: text().notNull().default(''),
    models: text({ mode: 'json' }).$type<string[]>().notNull().default([]),
    usage: text({ mode: 'json' }).$type<SessionUsage>(),
    name: text(),
    format: text({ enum: ['md', 'txt', 'json', 'jsonl'] }),
    key: text(),
    sourceUrl: text('source_url'),
    sha256: text(),
    size: integer().notNull().default(0),
    hiddenAt: integer('hidden_at'),
    hiddenBy: text('hidden_by').references(() => users.id),
    moderationReason: text('moderation_reason'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('transcript_submission').on(t.submissionId),
    index('transcript_owner').on(t.userId, t.createdAt),
  ],
)

export const agentConnections = sqliteTable(
  'agent_connections',
  {
    id: text().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    clientId: text('client_id').notNull(),
    clientName: text('client_name').notNull(),
    scopes: text({ mode: 'json' }).$type<string[]>().notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    revision: integer().notNull().default(0),
  },
  (t) => [index('agent_connection_user').on(t.userId)],
)

export const submissionDrafts = sqliteTable(
  'submission_drafts',
  {
    id: text().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    connectionId: text('connection_id')
      .notNull()
      .references(() => agentConnections.id),
    requestId: text('request_id').notNull(),
    input: text({ mode: 'json' }).$type<SubmissionInput>().notNull(),
    repoName: text('repo_name').notNull(),
    commitSha: text('commit_sha').notNull(),
    revision: integer().notNull().default(0),
    rejectedAt: integer('rejected_at'),
    submissionId: text('submission_id').references(() => submissions.id),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    uniqueIndex('draft_request').on(t.connectionId, t.requestId),
    index('draft_user').on(t.userId, t.createdAt),
  ],
)

export const agentUploads = sqliteTable('agent_uploads', {
  id: text().primaryKey(),
  hash: text().notNull(),
  connectionId: text('connection_id')
    .notNull()
    .references(() => agentConnections.id),
  kind: text({ enum: ['screenshot', 'transcript'] }).notNull(),
  name: text().notNull(),
  metadata: text({ mode: 'json' }).$type<Record<string, unknown>>(),
  usedAt: integer('used_at'),
  resultId: text('result_id'),
  expiresAt: integer('expires_at').notNull(),
})

export const requestLimits = sqliteTable('request_limits', {
  key: text().primaryKey(),
  count: integer().notNull(),
  expiresAt: integer('expires_at').notNull(),
})

export const awards = sqliteTable(
  'awards',
  {
    submissionId: text('submission_id')
      .primaryKey()
      .references(() => submissions.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    challengeId: text('challenge_id').notNull(),
    amount: integer().notNull(),
    status: text({ enum: ['active', 'pending', 'held', 'revoked', 'transferred'] }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('award_user').on(t.userId, t.status)],
)
export const votes = sqliteTable(
  'votes',
  {
    submissionId: text('submission_id')
      .notNull()
      .references(() => submissions.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    value: text({ enum: ['up', 'down', 'redo'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.submissionId, t.userId] })],
)
export const comments = sqliteTable(
  'comments',
  {
    id: text().primaryKey(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => submissions.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    body: text().notNull(),
    file: text(),
    line: integer(),
    endLine: integer('end_line'),
    commitSha: text('commit_sha'),
    requirementId: text('requirement_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('comment_submission').on(t.submissionId, t.createdAt)],
)
export const events = sqliteTable(
  'events',
  {
    id: text().primaryKey(),
    challengeId: text('challenge_id').notNull(),
    userId: text('user_id').notNull(),
    submissionId: text('submission_id'),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    kind: text().notNull(),
    message: text().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('event_history').on(t.challengeId, t.userId, t.createdAt)],
)
export const follows = sqliteTable(
  'follows',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => users.id),
    followingId: text('following_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followingId] })],
)
export const invitations = sqliteTable(
  'invitations',
  {
    id: text().primaryKey(),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => users.id),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('unique_invitation').on(t.recipientId, t.challengeId)],
)
export const notifications = sqliteTable(
  'notifications',
  {
    id: text().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    body: text().notNull(),
    href: text().notNull(),
    challengeId: text('challenge_id'),
    subjectId: text('subject_id'),
    submissionId: text('submission_id'),
    readAt: integer('read_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('notification_inbox').on(t.userId, t.createdAt)],
)
// A failed guard aborts an entire D1 batch, keeping awards and concurrent mutations atomic.
export const mutationGuards = sqliteTable(
  'mutation_guards',
  {
    id: text().primaryKey(),
    valid: integer().notNull(),
  },
  (t) => [check('mutation_conflict', sql`${t.valid} = 1`)],
)

export type User = typeof users.$inferSelect
export type Challenge = typeof challenges.$inferSelect
export type Attempt = typeof attempts.$inferSelect
export type Submission = typeof submissions.$inferSelect
export type Comment = typeof comments.$inferSelect
