import { HttpError, stmt, type Context } from './context'

export async function rateLimit(c: Context, key: string, maximum: number, windowMs: number) {
  const now = Date.now()
  const row = await stmt(
    c,
    `INSERT INTO request_limits(key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count`,
    key,
    now + windowMs,
    now,
    now,
  ).first<{ count: number }>()
  if (!row || row.count > maximum) throw new HttpError(429, 'Too many requests. Please try again later.')
}
