import { database } from '../db'
import type { User } from '../db/schema'

export interface Bindings {
  DB: D1Database
  ASSETS_BUCKET: R2Bucket
  OAUTH_KV: KVNamespace
  APP_URL: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET?: string
  GITHUB_APP_SLUG: string
  GITHUB_WEBHOOK_SECRET?: string
  TOKEN_ENCRYPTION_KEY?: string
  MODERATOR_GITHUB_IDS: string
}
export function context(env: Bindings, request: Request, user: User | null = null) {
  return { env, request, db: database(env.DB), user, receivedAt: Date.now() }
}
export type Context = ReturnType<typeof context>
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export function requireUser(c: Context) {
  if (!c.user) throw new HttpError(401, 'Connect your GitHub account to continue.')
  return c.user
}
export function requireModerator(c: Context) {
  const user = requireUser(c)
  if (!user.moderator) throw new HttpError(403, 'This action requires a moderator.')
  return user
}
export function ensure<T>(value: T | null | undefined, message = 'Not found'): T {
  if (value == null) throw new HttpError(404, message)
  return value
}
export function stmt(c: Context, query: string, ...params: unknown[]) {
  return c.env.DB.prepare(query).bind(...params)
}
export async function limitedBody(request: Pick<Request, 'body'>, limit: number) {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) {
        await reader.cancel()
        throw new HttpError(413, 'Request exceeds the allowed upload size.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}
export type Guard = {
  table: 'users' | 'challenges' | 'submissions' | 'submission_drafts' | 'agent_connections'
  id: string
  revision: number
}
export async function atomic(c: Context, guards: Guard[], writes: D1PreparedStatement[]) {
  const id = crypto.randomUUID()
  const tests = guards.map((g) => `(SELECT revision = ? FROM ${g.table} WHERE id = ?)`).join(' AND ') || '1'
  const params = guards.flatMap((g) => [g.revision, g.id])
  const checks = stmt(
    c,
    `INSERT INTO mutation_guards(id, valid) VALUES (?, COALESCE(${tests}, 0))`,
    id,
    ...params,
  )
  const bumps = guards.map((g) => stmt(c, `UPDATE ${g.table} SET revision = revision + 1 WHERE id = ?`, g.id))
  try {
    await c.env.DB.batch([
      checks,
      ...bumps,
      ...writes,
      stmt(c, 'DELETE FROM mutation_guards WHERE id = ?', id),
    ])
  } catch (error) {
    const message = String(error)
    if (message.includes('repository_claims.user_id') || message.includes('fingerprints.root_id')) {
      throw new HttpError(409, 'This repository or copied implementation has already been claimed for kudos.')
    }
    if (message.includes('mutation_conflict') || message.includes('UNIQUE constraint')) {
      throw new HttpError(409, 'This changed while you were working. Refresh and try again.')
    }
    throw error
  }
}
export function userGuard(user: User): Guard {
  return { table: 'users', id: user.id, revision: user.revision }
}
export function event(
  c: Context,
  userId: string,
  challengeId: string,
  kind: string,
  message: string,
  submissionId: string | null = null,
) {
  return stmt(
    c,
    'INSERT INTO events(id,user_id,challenge_id,actor_id,kind,message,submission_id,created_at) VALUES(?,?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    userId,
    challengeId,
    requireUser(c).id,
    kind,
    message,
    submissionId,
    Date.now(),
  )
}
export function notify(
  c: Context,
  userId: string,
  title: string,
  body: string,
  href: string,
  challengeId: string | null = null,
  subjectId: string | null = null,
  submissionId: string | null = null,
) {
  return stmt(
    c,
    'INSERT INTO notifications(id,user_id,title,body,href,challenge_id,subject_id,submission_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    userId,
    title,
    body,
    href,
    challengeId,
    subjectId,
    submissionId,
    Date.now(),
  )
}
