import { z } from 'zod'

export const showcaseUrl = z
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  }, 'Use an HTTPS link without embedded credentials.')
export const showcaseSchema = z.object({
  videoUrl: z.union([z.literal(''), showcaseUrl]).default(''),
  learnings: z.string().trim().max(5000).default(''),
})
export const highlightSchema = z
  .object({
    transcriptId: z.string().uuid(),
    turnIndex: z.number().int().min(0).max(1999).nullable().default(null),
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().min(1),
    caption: z.string().trim().min(1).max(200),
  })
  .refine(
    (value) => value.endOffset > value.startOffset && value.endOffset - value.startOffset <= 6000,
    'Select a passage of up to 6,000 characters.',
  )
export type TranscriptHighlight = z.infer<typeof highlightSchema>
export function highlightExcerpt(text: string, start: number, end: number) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length)
    throw new RangeError('Choose a passage within this transcript.')
  const excerpt = text.slice(start, end)
  if (!excerpt.trim() || excerpt.length > 6000)
    throw new RangeError('Choose a non-empty excerpt of up to 6,000 characters.')
  return excerpt
}

export function videoEmbed(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be'
        ? url.pathname.slice(1)
        : (url.searchParams.get('v') ?? /^\/(?:embed|shorts)\/([^/]+)$/.exec(url.pathname)?.[1])
    if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`
  }
  if (host === 'vimeo.com' && /^\/\d+$/.test(url.pathname))
    return `https://player.vimeo.com/video${url.pathname}`
  if (host === 'loom.com') {
    const id = /^\/(?:share|embed)\/([a-f0-9]{32})$/.exec(url.pathname)?.[1]
    if (id) return `https://www.loom.com/embed/${id}`
  }
  return null
}
