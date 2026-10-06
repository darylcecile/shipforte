import { z } from 'zod'
import { usageSchema } from './transcript-data'
import { harnesses } from './harnesses'
import { evidenceSchema } from './challenge-requirements'
import { showcaseSchema } from './showcase'
export { harnesses, harnessNames } from './harnesses'

export const maxTranscriptBytes = 10 * 1024 * 1024
export const transcriptMetadata = z.object({
  harness: z.enum(harnesses).default('other'),
  label: z.string().trim().max(120).default(''),
  version: z.string().trim().max(80).default(''),
  model: z.string().trim().max(120).default(''),
  agent: z.string().trim().max(120).default(''),
  usage: usageSchema.nullable().default(null),
})
export const httpsUrl = z
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  }, 'Use an HTTPS link without embedded credentials.')
export const submissionInput = z
  .object({
    attemptId: z.string().uuid(),
    repoId: z.number().int().positive(),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(20).max(10_000),
    evidence: evidenceSchema.default([]),
    videoUrl: showcaseSchema.shape.videoUrl,
    learnings: showcaseSchema.shape.learnings,
    visibility: z
      .enum(['public', 'private'])
      .default('public')
      .describe(
        'Private submissions are owner-only on Shipforte. They preserve the approval-time deadline and withhold kudos until irreversible publication. GitHub repositories must still be public.',
      ),
    demoUrl: z.union([z.literal(''), httpsUrl]).optional(),
    screenshots: z.array(z.string().uuid()).min(1).max(20),
    transcripts: z.array(z.string().uuid()).max(10).default([]),
  })
  .refine(
    (v) =>
      new Set(v.screenshots).size === v.screenshots.length &&
      new Set(v.transcripts).size === v.transcripts.length,
    'Each attachment must be unique.',
  )
export type SubmissionInput = z.infer<typeof submissionInput>

export function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/'
  const url = new URL(value, 'https://shipforte.invalid')
  return url.origin === 'https://shipforte.invalid' ? `${url.pathname}${url.search}` : '/'
}

export function transcriptFormat(name: string, bytes: Uint8Array) {
  const extension = name.split('.').pop()?.toLowerCase()
  if (!extension || !['md', 'txt', 'json', 'jsonl'].includes(extension))
    throw new Error('Choose a Markdown, text, JSON, or JSONL transcript.')
  if (!bytes.length || bytes.length > maxTranscriptBytes)
    throw new Error('Transcripts must be between 1 byte and 10 MB.')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('Transcripts must contain valid UTF-8 text.')
  }
  if (text.includes('\0') || !text.trim()) throw new Error('Choose a non-empty text transcript.')
  if (['md', 'txt'].includes(extension) && ['{', '['].includes(text.trimStart()[0])) {
    try {
      JSON.parse(text)
      return 'json' as const
    } catch {
      /* It may be newline-delimited JSON. */
    }
    try {
      const lines = text.split('\n').filter((line) => line.trim())
      for (const line of lines) JSON.parse(line)
      return 'jsonl' as const
    } catch {
      /* Keep ordinary text as text. */
    }
  }
  try {
    if (extension === 'json') JSON.parse(text)
    if (extension === 'jsonl') for (const line of text.split('\n')) if (line.trim()) JSON.parse(line)
  } catch {
    throw new Error(`This file does not contain valid ${extension.toUpperCase()}.`)
  }
  return extension as 'md' | 'txt' | 'json' | 'jsonl'
}

export function canReadTranscript(
  row: { userId: string; submissionId: string | null; hiddenAt: number | null },
  viewer: { id: string; moderator: boolean } | null,
) {
  if (!row.submissionId) return viewer?.id === row.userId
  return !row.hiddenAt || viewer?.id === row.userId || viewer?.moderator === true
}

export function reviewMatches(
  draft: { revision: number; commitSha: string },
  review: { revision: number; commitSha: string },
) {
  return draft.revision === review.revision && draft.commitSha === review.commitSha
}
