import {
  AuthorizationError,
  CimdFetchError,
  OAuthAuthorizationServer,
  OAuthError,
} from '@cloudflare/workers-oauth-provider'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { agentConnections } from '../db/schema'
import { authenticate } from './auth'
import {
  atomic,
  context,
  ensure,
  HttpError,
  limitedBody,
  requireUser,
  stmt,
  type Bindings,
  type Context,
} from './context'
import { consentErrorPage, consentResponse, scopeDescriptions } from './agent-consent'
import { randomToken } from './crypto'

export const agentScopes = ['shipforte:read', 'shipforte:drafts']
export type AgentIdentity = { userId: string; connectionId: string }
export function authorizationServer(env: Bindings) {
  return new OAuthAuthorizationServer<Bindings>({
    issuer: env.APP_URL,
    resources: [`${env.APP_URL}/mcp`],
    authorizeEndpoint: '/oauth/authorize',
    tokenEndpoint: '/oauth/token',
    clientRegistrationEndpoint: '/oauth/register',
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: [...agentScopes, 'offline_access'],
    accessTokenTTL: 3600,
    refreshTokenTTL: 30 * 24 * 3600,
    tokenExchangeCallback: async ({ props }) => {
      const identity = props as AgentIdentity
      const c = context(env, new Request(env.APP_URL))
      try {
        await activeConnection(c, identity.connectionId, identity.userId)
      } catch (error) {
        if (error instanceof HttpError && error.status === 401)
          throw new OAuthError('invalid_grant', {
            description: 'The Shipforte connection expired or was revoked.',
          })
        throw error
      }
      return {}
    },
  })
}
export async function activeConnection(c: Context, id: string, userId: string) {
  const row = await c.db
    .select()
    .from(agentConnections)
    .where(
      and(
        eq(agentConnections.id, id),
        eq(agentConnections.userId, userId),
        isNull(agentConnections.revokedAt),
        gt(agentConnections.expiresAt, Date.now()),
      ),
    )
    .get()
  if (!row)
    throw new HttpError(401, 'This agent connection expired or was revoked. Reconnect it in Shipforte.')
  return row
}
export async function connectedAgents(c: Context) {
  const user = requireUser(c)
  const rows = await c.db
    .select()
    .from(agentConnections)
    .where(eq(agentConnections.userId, user.id))
    .orderBy(desc(agentConnections.createdAt))
    .limit(100)
  return rows.map((row) => ({ ...row, active: !row.revokedAt && row.expiresAt > Date.now() }))
}
export async function revokeAgent(c: Context, id: string) {
  const user = requireUser(c)
  const row = ensure(
    await c.db
      .select()
      .from(agentConnections)
      .where(and(eq(agentConnections.id, id), eq(agentConnections.userId, user.id)))
      .get(),
  )
  if (!row.revokedAt)
    await atomic(
      c,
      [{ table: 'agent_connections', id, revision: row.revision }],
      [stmt(c, 'UPDATE agent_connections SET revoked_at=? WHERE id=?', Date.now(), id)],
    )
  // D1 revocation is checked on every request and refresh, independent of KV propagation.
  const oauth = authorizationServer(c.env).getOAuthApi(c.env)
  let cursor: string | undefined
  do {
    const page = await oauth.listUserGrants(user.id, { cursor, limit: 100 })
    for (const grant of page.items) {
      if ((grant.metadata as { connectionId?: string })?.connectionId === id)
        await oauth.revokeGrant(grant.id, user.id)
    }
    cursor = page.cursor
  } while (cursor)
  return { ok: true }
}
export async function authorizeAgent(request: Request, env: Bindings) {
  const c = context(env, request)
  c.user = await authenticate(c)
  const oauth = authorizationServer(env).getOAuthApi(env)
  try {
    if (request.method === 'GET') {
      const authRequest = await oauth.parseAuthRequest(request)
      if (!authRequest.scope.length) authRequest.scope = [...agentScopes]
      if (authRequest.scope.some((scope) => !scopeDescriptions[scope]))
        throw new HttpError(400, 'Unsupported agent permission.')
      if (!c.user)
        return Response.redirect(
          `${env.APP_URL}/api/auth/login?returnTo=${encodeURIComponent(new URL(request.url).pathname + new URL(request.url).search)}`,
          302,
        )
      const details = await oauth.describeConsent(authRequest)
      const consent = await oauth.beginConsent(authRequest)
      return consentResponse(details, consent.handle, c.user, randomToken(), consent.headers)
    }
    if (request.method !== 'POST')
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST' } })
    const user = requireUser(c)
    if (request.headers.get('Origin') !== env.APP_URL)
      throw new HttpError(403, 'Request origin does not match Shipforte.')
    const bytes = await limitedBody(request, 16_384)
    const form = await new Response(bytes, {
      headers: { 'Content-Type': request.headers.get('Content-Type') || '' },
    }).formData()
    if (form.get('userId') !== user.id)
      throw new HttpError(409, 'Your account changed. Start the connection again.')
    const handle = String(form.get('handle') || '')
    if (form.get('decision') !== 'approve') {
      const denied = await oauth.denyConsent(request, handle)
      return new Response(null, { status: 302, headers: denied.headers })
    }
    const approved = await oauth.approveConsent(request, handle)
    const details = await oauth.describeConsent(approved.request)
    const id = crypto.randomUUID()
    await c.db.insert(agentConnections).values({
      id,
      userId: user.id,
      clientId: approved.request.clientId,
      clientName: details.clientName.slice(0, 200),
      scopes: approved.request.scope,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 3_600_000,
    })
    try {
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: user.id,
        metadata: { connectionId: id },
        scope: approved.request.scope,
        props: { userId: user.id, connectionId: id } satisfies AgentIdentity,
        revokeExistingGrants: false,
      })
      approved.headers.set('Location', redirectTo)
      return new Response(null, { status: 302, headers: approved.headers })
    } catch (error) {
      await c.db.update(agentConnections).set({ revokedAt: Date.now() }).where(eq(agentConnections.id, id))
      throw error
    }
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof CimdFetchError)
      return consentErrorPage(
        error instanceof AuthorizationError
          ? error.description
          : 'The client could not be verified. Start the connection again.',
      )
    throw error
  }
}
