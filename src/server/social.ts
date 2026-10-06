import { and, eq, sql } from 'drizzle-orm'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import wasm from '@resvg/resvg-wasm/index_bg.wasm'
import font from './assets/AtkinsonHyperlegible-Bold.bin'
import { challenges, submissions, users } from '../db/schema'
import { escapeMarkup, socialCardSvg } from '../domain/social-card'
import { context, ensure, HttpError, type Bindings, type Context } from './context'

let rendererReady: Promise<void> | undefined
type ShareInfo = {
  title: string
  description: string
  label: string
  subtitle: string
  detail: string
  path: string
  image: string
}

async function submissionShare(c: Context, id: string): Promise<ShareInfo> {
  const row = ensure(
    await c.db
      .select({
        title: submissions.title,
        description: submissions.description,
        login: users.login,
        challenge: challenges.title,
      })
      .from(submissions)
      .innerJoin(users, eq(users.id, submissions.userId))
      .innerJoin(challenges, eq(challenges.id, submissions.challengeId))
      .where(and(eq(submissions.id, id), eq(submissions.visibility, 'public')))
      .get(),
  )
  return {
    title: row.title,
    description: row.description.slice(0, 220),
    label: 'Built it. Shipped it.',
    subtitle: row.challenge,
    detail: `Built by @${row.login} · shipforte.com`,
    path: `/submissions/${id}`,
    image: `/api/share/submissions/${id}.png`,
  }
}
async function profileShare(c: Context, login: string): Promise<ShareInfo> {
  const row = ensure(
    await c.db
      .select({
        name: users.name,
        login: users.login,
        bio: users.bio,
        builds:
          sql<number>`(SELECT COUNT(*) FROM submissions WHERE user_id=${users.id} AND visibility='public' AND archived=0)`.mapWith(
            Number,
          ),
      })
      .from(users)
      .where(eq(users.login, login))
      .get(),
  )
  return {
    title: row.name,
    description: row.bio || `Explore @${row.login}’s projects on Shipforte.`,
    label: 'A body of work',
    subtitle: `@${row.login} · ${row.builds} public ${row.builds === 1 ? 'build' : 'builds'}`,
    detail: 'Small challenges. Real projects. · shipforte.com',
    path: `/people/${row.login}`,
    image: `/api/share/people/${row.login}.png`,
  }
}
export async function shareImage(c: Context, kind: 'submissions' | 'people', id: string) {
  const info = kind === 'submissions' ? await submissionShare(c, id) : await profileShare(c, id)
  rendererReady ??= initWasm(wasm).catch((error) => {
    rendererReady = undefined
    throw error
  })
  await rendererReady
  const renderer = new Resvg(socialCardSvg(info), {
    font: { fontBuffers: [new Uint8Array(font)], defaultFontFamily: 'Atkinson Hyperlegible' },
  })
  try {
    const image = renderer.render()
    try {
      const png = Uint8Array.from(image.asPng())
      return new Response(png, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
          ...(new URL(c.request.url).searchParams.has('download')
            ? { 'Content-Disposition': 'attachment; filename="shipforte-share.png"' }
            : {}),
        },
      })
    } finally {
      image.free()
    }
  } finally {
    renderer.free()
  }
}

// Public-only metadata is rendered into the initial HTML so social crawlers do
// not need JavaScript. Private pages never get project titles or share images.
export async function socialPage(request: Request, env: Bindings, response: Response) {
  const match = /^\/(submissions|people)\/([^/]+)\/?$/.exec(new URL(request.url).pathname)
  if (!match || request.method !== 'GET' || !response.headers.get('Content-Type')?.includes('text/html'))
    return response
  const c = context(env, request)
  let info: ShareInfo
  try {
    info =
      match[1] === 'submissions'
        ? await submissionShare(c, decodeURIComponent(match[2]))
        : await profileShare(c, decodeURIComponent(match[2]))
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return response
    throw error
  }
  const url = `${env.APP_URL}${info.path}`
  const image = `${env.APP_URL}${info.image}`
  const meta =
    [
      ['og:type', 'website'],
      ['og:title', `${info.title} · Shipforte`],
      ['og:description', info.description],
      ['og:url', url],
      ['og:image', image],
      ['og:image:width', '1200'],
      ['og:image:height', '630'],
      ['og:image:alt', `${info.title} on Shipforte`],
    ]
      .map(([property, value]) => `<meta property="${property}" content="${escapeMarkup(value)}">`)
      .join('') +
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeMarkup(info.title)}"><meta name="twitter:image" content="${escapeMarkup(image)}"><link rel="canonical" href="${escapeMarkup(url)}">`
  return new HTMLRewriter()
    .on('title', {
      element: (element) => {
        element.setInnerContent(`${info.title} · Shipforte`)
      },
    })
    .on('meta[name="description"]', {
      element: (element) => {
        element.setAttribute('content', info.description)
      },
    })
    .on('head', {
      element: (element) => {
        element.append(meta, { html: true })
      },
    })
    .transform(response)
}
