import handler from '@tanstack/react-start/server-entry'
import { OAuthResourceServer } from '@cloudflare/workers-oauth-provider'
import { ZodError } from 'zod'
import {
  activeConnection,
  agentScopes,
  authorizationServer,
  authorizeAgent,
  type AgentIdentity,
} from './server/agent-auth'
import { receiveAgentUpload } from './server/agent-uploads'
import { context, HttpError, limitedBody, type Bindings } from './server/context'
import { handleMcp } from './server/mcp'
import { rateLimit } from './server/request-limits'
import { cleanupAgentData } from './server/agent-cleanup'
import { socialPage } from './server/social'

async function agentRequest(
  request: Request,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url)
  const isResource =
    url.pathname === '/mcp' || url.pathname.startsWith('/.well-known/oauth-protected-resource')
  const isOauth =
    url.pathname.startsWith('/oauth/') || url.pathname === '/.well-known/oauth-authorization-server'
  const upload = /^\/agent-uploads\/([a-f0-9-]{36})$/.exec(url.pathname)
  if (!isResource && !isOauth && !upload) return null
  if (url.origin !== env.APP_URL) throw new HttpError(400, 'Connect using Shipforte’s canonical URL.')
  const origin = request.headers.get('Origin')
  if (origin && origin !== env.APP_URL && (url.pathname === '/mcp' || upload))
    throw new HttpError(403, 'Origin not allowed.')
  if (upload) return receiveAgentUpload(request, env, upload[1])
  const as = authorizationServer(env)
  if (isOauth) {
    await rateLimit(
      context(env, request),
      `oauth:${request.headers.get('CF-Connecting-IP') || 'local'}`,
      120,
      60_000,
    )
    if (url.pathname === '/oauth/authorize') return authorizeAgent(request, env)
    if (request.method === 'POST')
      request = new Request(request, { body: await limitedBody(request, 32_768) })
    return as.fetch(request, env, ctx)
  }
  const resource = new OAuthResourceServer<Bindings, AgentIdentity>({
    resourceMetadata: {
      resource: `${env.APP_URL}/mcp`,
      authorization_servers: [env.APP_URL],
      resource_name: 'Shipforte',
    },
    requiredScopes: agentScopes,
    validateToken: (bindings) => async (audience, token) => {
      const validated = await as.validateToken<AgentIdentity>(audience, token, bindings)
      if (!validated) return null
      try {
        await activeConnection(context(bindings, request), validated.props.connectionId, validated.userId)
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) return null
        throw error
      }
      return validated
    },
    handler: { fetch: (req, bindings, auth) => handleMcp(req, bindings, auth.props, auth.auth.scope) },
  })
  return resource.fetch(request, env, ctx)
}
export default {
  async scheduled(_event: ScheduledController, env: Bindings) {
    await cleanupAgentData(env)
  },
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    try {
      const response = await agentRequest(request, env, ctx)
      if (!response) {
        const page = await handler.fetch(request)
        if (/^\/(agent-submissions|submissions)\//.test(new URL(request.url).pathname)) {
          page.headers.set('Content-Security-Policy', "frame-ancestors 'none'")
          page.headers.set('X-Frame-Options', 'DENY')
          page.headers.set('Cache-Control', 'private, no-store')
        }
        return await socialPage(request, env, page)
      }
      const headers = new Headers(response.headers)
      headers.set('Cache-Control', 'no-store')
      headers.set('X-Content-Type-Options', 'nosniff')
      return new Response(response.body, { status: response.status, headers })
    } catch (error) {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof ZodError || error instanceof SyntaxError
            ? 400
            : 500
      if (status === 500)
        console.error('Agent request failed', { path: new URL(request.url).pathname, error })
      return Response.json(
        {
          error:
            error instanceof HttpError
              ? error.message
              : status === 400
                ? 'Invalid request.'
                : 'Shipforte could not complete this request.',
        },
        {
          status,
          headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) },
        },
      )
    }
  },
} satisfies ExportedHandler<Bindings>
