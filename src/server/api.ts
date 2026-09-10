import { env } from 'cloudflare:workers'
import { ZodError } from 'zod'
import { authenticate, callback, login, logout, webhook } from './auth'
import { archiveChallenge, moderateChallenge, saveChallenge, startAttempt } from './challenges'
import { addComment, follow, invite, markRead, vote } from './community'
import { context, HttpError, limitedBody, type Bindings, type Context } from './context'
import { commits, repositories } from './github'
import {
  bootstrap,
  challengeDetail,
  home,
  inbox,
  moderation,
  people,
  profile,
  proposals,
  submissionDetail,
} from './queries'
import { image, uploadScreenshot } from './snapshots'
import { moderateSubmission, snapshotFile, submitProject } from './submissions'

type Handler = (c: Context, id: string) => Promise<unknown>
const routes: [string, RegExp, Handler][] = [
  ['GET', /^auth\/login$/, login],
  ['GET', /^auth\/callback$/, callback],
  ['POST', /^auth\/logout$/, logout],
  ['POST', /^github\/webhook$/, webhook],
  ['GET', /^bootstrap$/, bootstrap],
  ['GET', /^home$/, home],
  ['GET', /^people$/, people],
  ['GET', /^people\/([^/]+)$/, profile],
  ['POST', /^people\/([^/]+)\/follow$/, follow],
  ['GET', /^notifications$/, inbox],
  ['POST', /^notifications\/read$/, markRead],
  ['GET', /^proposals$/, proposals],
  ['GET', /^moderation$/, moderation],
  ['POST', /^challenges$/, (c) => saveChallenge(c)],
  ['GET', /^challenges\/([^/]+)$/, challengeDetail],
  ['POST', /^challenges\/([^/]+)\/edit$/, saveChallenge],
  ['POST', /^challenges\/([^/]+)\/review$/, moderateChallenge],
  ['POST', /^challenges\/([^/]+)\/archive$/, archiveChallenge],
  ['POST', /^challenges\/([^/]+)\/accept$/, startAttempt],
  ['POST', /^challenges\/([^/]+)\/invite$/, invite],
  ['GET', /^repositories$/, repositories],
  ['GET', /^repositories\/(\d+)\/commits$/, (c, id) => commits(c, Number(id))],
  ['POST', /^uploads$/, uploadScreenshot],
  ['GET', /^images\/([^/]+)$/, image],
  ['POST', /^submissions$/, submitProject],
  ['GET', /^submissions\/([^/]+)$/, submissionDetail],
  ['GET', /^submissions\/([^/]+)\/files$/, snapshotFile],
  ['POST', /^submissions\/([^/]+)\/vote$/, vote],
  ['POST', /^submissions\/([^/]+)\/comments$/, addComment],
  ['POST', /^submissions\/([^/]+)\/review$/, moderateSubmission],
]
export async function handle(request: Request) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\//, '')
  const c = context(env as unknown as Bindings, request)
  try {
    if (request.method !== 'GET' && path !== 'github/webhook') {
      if (request.headers.get('Origin') !== url.origin)
        throw new HttpError(403, 'Request origin does not match this application.')
      if (path !== 'uploads' && Number(request.headers.get('Content-Length')) > 100_000)
        throw new HttpError(413, 'Request is too large.')
    }
    if (request.method === 'POST' && path !== 'uploads') {
      const body = await limitedBody(request, path === 'github/webhook' ? 1_048_576 : 100_000)
      c.request = new Request(request, { body })
    }
    c.receivedAt = Date.now()
    c.user = await authenticate(c)
    for (const [method, pattern, handler] of routes) {
      const match = pattern.exec(path)
      if (method !== request.method || !match) continue
      const result = await handler(c, decodeURIComponent(match[1] || ''))
      const response = result instanceof Response ? result : Response.json(result)
      response.headers.set('X-Content-Type-Options', 'nosniff')
      if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
    throw new HttpError(404, 'Endpoint not found.')
  } catch (error) {
    let status = 500
    let message = 'Something went wrong. Please try again.'
    if (error instanceof HttpError) {
      status = error.status
      message = error.message
    } else if (error instanceof ZodError) {
      status = 400
      message = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')
    } else if (error instanceof SyntaxError) {
      status = 400
      message = 'Invalid request data.'
    } else console.error('Request failed', { method: request.method, path, error })
    if (path.startsWith('auth/') && request.method === 'GET')
      return Response.redirect(`${url.origin}/?authError=${encodeURIComponent(message)}`, 302)
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
}
