import { parseTranscript } from '../domain/transcript-data'
import { limitedBody } from './context'

// Gists provide a documented public file API. Other share pages remain links: their
// authenticated/private or undocumented page data is not scraped or guessed.
export async function linkedTranscriptMetadata(sourceUrl: string) {
  const url = new URL(sourceUrl)
  if (url.hostname !== 'gist.github.com') return null
  const match = /^\/(?:[^/]+\/)?([a-f0-9]{32})(?:\/([a-f0-9]{40}))?\/?$/.exec(url.pathname)
  if (!match) return null
  try {
    const response = await fetch(
      `https://api.github.com/gists/${match[1]}${match[2] ? `/${match[2]}` : ''}`,
      {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Shipforte' },
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      },
    )
    if (!response.ok) return null
    const bytes = await limitedBody(response, 2 * 1024 * 1024)
    const data = JSON.parse(new TextDecoder().decode(bytes)) as {
      files?: Record<string, { filename?: string; content?: string; truncated?: boolean }>
    }
    const files = Object.values(data.files ?? {}).filter(
      (file) => file.filename && /\.(md|txt|json|jsonl)$/i.test(file.filename),
    )
    // Don't attribute metrics from an arbitrary file in a multi-file Gist to this session.
    if (files.length !== 1 || files[0].truncated || typeof files[0].content !== 'string') return null
    const file = files[0]
    return parseTranscript(file.content!, file.filename!.split('.').pop()!.toLowerCase(), file.filename)
  } catch {
    // A private, deleted, oversized, or unavailable Gist can still be attached as a link.
    return null
  }
}
