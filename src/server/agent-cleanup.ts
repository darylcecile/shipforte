import { atomic, context, HttpError, stmt, type Bindings } from './context'

export async function cleanupAgentData(env: Bindings) {
  const c = context(env, new Request(env.APP_URL))
  const now = Date.now()
  const cutoff = now - 7 * 24 * 3_600_000
  const abandoned = await stmt(
    c,
    `SELECT t.id,t.user_id,t.key,u.revision FROM transcripts t JOIN users u ON u.id=t.user_id
    WHERE t.submission_id IS NULL AND t.created_at<? AND NOT EXISTS (
      SELECT 1 FROM submission_drafts d,json_each(d.input,'$.transcripts') attachment
      WHERE attachment.value=t.id AND d.expires_at>? AND d.rejected_at IS NULL AND d.submission_id IS NULL
    ) LIMIT 100`,
    cutoff,
    now,
  ).all<{ id: string; user_id: string; key: string | null; revision: number }>()
  const revisions = new Map<string, number>()
  for (const row of abandoned.results) {
    const revision = revisions.get(row.user_id) ?? row.revision
    try {
      await atomic(
        c,
        [{ table: 'users', id: row.user_id, revision }],
        [stmt(c, 'DELETE FROM transcripts WHERE id=? AND submission_id IS NULL', row.id)],
      )
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) continue
      throw error
    }
    revisions.set(row.user_id, revision + 1)
    if (row.key) await env.ASSETS_BUCKET.delete(row.key)
  }
  await env.DB.batch([
    stmt(c, 'DELETE FROM request_limits WHERE expires_at<?', now),
    stmt(c, 'DELETE FROM agent_uploads WHERE expires_at<?', cutoff),
  ])
}
