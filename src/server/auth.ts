import { and, eq, gt, lt } from 'drizzle-orm'
import { credentials, oauthStates, sessions, users } from '../db/schema'
import { HttpError, requireUser, type Context } from './context'
import { decrypt, digest, encrypt, randomToken } from './crypto'

const sessionAge = 60 * 60 * 24 * 30
function cookie(c: Context, name: string, value: string, maxAge: number) {
  const secure = new URL(c.request.url).protocol === 'https:' ? '; Secure' : ''
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}
function getCookie(c: Context, name: string) {
  return c.request.headers
    .get('Cookie')
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}
export async function authenticate(c: Context) {
  const token = getCookie(c, 'shipforte_session')
  if (!token) return null
  const result = await c.db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.hash, await digest(token)), gt(sessions.expiresAt, Date.now())))
    .get()
  if (!result) return null
  const moderator = (c.env.MODERATOR_GITHUB_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .includes(String(result.user.githubId))
  return { ...result.user, moderator }
}
function configured(c: Context) {
  if (
    !c.env.GITHUB_CLIENT_ID ||
    !c.env.GITHUB_CLIENT_SECRET ||
    !c.env.TOKEN_ENCRYPTION_KEY ||
    !c.env.APP_URL
  ) {
    throw new HttpError(503, 'GitHub connection is being configured. Please try again shortly.')
  }
}
interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
}
async function exchange(c: Context, params: Record<string, string>) {
  configured(c)
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      ...params,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const token = (await response.json()) as TokenResponse
  if (!response.ok || !token.access_token)
    throw new HttpError(401, 'GitHub authorization expired or was declined. Please reconnect your account.')
  return token as TokenResponse & { access_token: string }
}
async function saveCredentials(c: Context, userId: string, token: TokenResponse & { access_token: string }) {
  const value = {
    userId,
    token: await encrypt(token.access_token, c.env.TOKEN_ENCRYPTION_KEY),
    refreshToken: token.refresh_token ? await encrypt(token.refresh_token, c.env.TOKEN_ENCRYPTION_KEY) : null,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
  }
  await c.db.insert(credentials).values(value).onConflictDoUpdate({ target: credentials.userId, set: value })
}
export async function userToken(c: Context) {
  const user = requireUser(c)
  const row = await c.db.select().from(credentials).where(eq(credentials.userId, user.id)).get()
  if (!row) throw new HttpError(401, 'Reconnect GitHub to access your repositories.')
  if (row.expiresAt && row.expiresAt < Date.now() + 60_000) {
    if (!row.refreshToken) throw new HttpError(401, 'Reconnect GitHub to refresh repository access.')
    const refreshed = await exchange(c, {
      grant_type: 'refresh_token',
      refresh_token: await decrypt(row.refreshToken, c.env.TOKEN_ENCRYPTION_KEY),
    })
    await saveCredentials(c, user.id, refreshed)
    return refreshed.access_token
  }
  return decrypt(row.token, c.env.TOKEN_ENCRYPTION_KEY)
}
export async function login(c: Context) {
  configured(c)
  if (new URL(c.request.url).origin !== c.env.APP_URL) {
    return Response.redirect(`${c.env.APP_URL}/api/auth/login`, 302)
  }
  const state = randomToken()
  const verifier = randomToken()
  await c.db.delete(oauthStates).where(lt(oauthStates.expiresAt, Date.now()))
  await c.db
    .insert(oauthStates)
    .values({ hash: await digest(state), verifier, expiresAt: Date.now() + 600_000 })
  const url = new URL('https://github.com/login/oauth/authorize')
  url.search = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    redirect_uri: `${c.env.APP_URL}/api/auth/callback`,
    state,
    code_challenge: Buffer.from(await digest(verifier), 'hex').toString('base64url'),
    code_challenge_method: 'S256',
  }).toString()
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), 'Set-Cookie': cookie(c, 'shipforte_oauth', state, 600) },
  })
}
export async function callback(c: Context) {
  const url = new URL(c.request.url)
  const state = url.searchParams.get('state')
  if (!state || state !== getCookie(c, 'shipforte_oauth'))
    throw new HttpError(400, 'This sign-in request expired. Please start again.')
  const stored = await c.db
    .delete(oauthStates)
    .where(and(eq(oauthStates.hash, await digest(state)), gt(oauthStates.expiresAt, Date.now())))
    .returning()
    .get()
  if (!stored || !url.searchParams.get('code'))
    throw new HttpError(400, 'GitHub sign-in was cancelled or expired.')
  const token = await exchange(c, {
    code: url.searchParams.get('code')!,
    code_verifier: stored.verifier,
    redirect_uri: `${c.env.APP_URL}/api/auth/callback`,
  })
  const response = await fetch('https://api.github.com/user', {
    headers: githubHeaders(token.access_token),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new HttpError(502, 'Could not load your GitHub profile. Please try again.')
  const profile = (await response.json()) as {
    id: number
    login: string
    name: string | null
    avatar_url: string
    bio: string | null
  }
  const existing = await c.db.select().from(users).where(eq(users.githubId, profile.id)).get()
  const userId = existing?.id ?? crypto.randomUUID()
  const value = {
    login: profile.login,
    name: profile.name || profile.login,
    avatar: profile.avatar_url,
    bio: profile.bio || '',
  }
  await c.db
    .insert(users)
    .values({ id: userId, githubId: profile.id, ...value, createdAt: Date.now() })
    .onConflictDoUpdate({ target: users.githubId, set: value })
  await saveCredentials(c, userId, token)
  const session = randomToken()
  await c.db.delete(sessions).where(lt(sessions.expiresAt, Date.now()))
  await c.db
    .insert(sessions)
    .values({ hash: await digest(session), userId, expiresAt: Date.now() + sessionAge * 1000 })
  const headers = new Headers({ Location: '/' })
  headers.append('Set-Cookie', cookie(c, 'shipforte_session', session, sessionAge))
  headers.append('Set-Cookie', cookie(c, 'shipforte_oauth', '', 0))
  return new Response(null, { status: 302, headers })
}
export async function logout(c: Context) {
  const token = getCookie(c, 'shipforte_session')
  if (token) await c.db.delete(sessions).where(eq(sessions.hash, await digest(token)))
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie(c, 'shipforte_session', '', 0) } })
}
export function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Shipforte',
    'X-GitHub-Api-Version': '2026-03-10',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}
export async function webhook(c: Context) {
  if (!c.env.GITHUB_WEBHOOK_SECRET) throw new HttpError(503, 'Webhook is not configured.')
  const body = await c.request.text()
  const signature = c.request.headers.get('X-Hub-Signature-256')?.replace(/^sha256=/, '')
  if (!signature || !/^[a-f0-9]{64}$/.test(signature)) throw new HttpError(401, 'Invalid webhook signature.')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(c.env.GITHUB_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  if (
    !(await crypto.subtle.verify('HMAC', key, Buffer.from(signature, 'hex'), new TextEncoder().encode(body)))
  )
    throw new HttpError(401, 'Invalid webhook signature.')
  const payload = JSON.parse(body) as { action?: string; sender?: { id: number } }
  if (
    c.request.headers.get('X-GitHub-Event') === 'github_app_authorization' &&
    payload.action === 'revoked' &&
    payload.sender
  ) {
    const user = await c.db.select().from(users).where(eq(users.githubId, payload.sender.id)).get()
    if (user)
      await c.db.batch([
        c.db.delete(credentials).where(eq(credentials.userId, user.id)),
        c.db.delete(sessions).where(eq(sessions.userId, user.id)),
      ])
  }
  return { ok: true }
}
