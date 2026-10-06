import { and, eq, or } from 'drizzle-orm'
import { submissions } from '../db/schema'
import { canReadSubmission } from '../domain/submission-visibility'
import { ensure, HttpError, type Context } from './context'

export function readableSubmissions(c: Context) {
  return or(eq(submissions.visibility, 'public'), eq(submissions.userId, c.user?.id ?? ''))!
}

export async function readSubmission(c: Context, id: string) {
  const row = ensure(await c.db.select().from(submissions).where(eq(submissions.id, id)).get())
  if (!canReadSubmission(row, c.user)) throw new HttpError(404, 'Submission not found.')
  return row
}

export async function publicSubmission(c: Context, id: string) {
  return ensure(
    await c.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.id, id), eq(submissions.visibility, 'public')))
      .get(),
    'Submission not found.',
  )
}
