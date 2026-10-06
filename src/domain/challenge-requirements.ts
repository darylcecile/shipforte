import { z } from 'zod'

export const requirementId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)
export const requirementSchema = z.object({
  id: requirementId,
  title: z.string().trim().min(1).max(240),
  details: z.string().trim().max(1500).default(''),
  kind: z.enum(['required', 'stretch']).default('required'),
})
export const requirementsSchema = z
  .array(requirementSchema)
  .max(30)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'Each requirement must have a unique ID.',
  )
export type Requirement = z.infer<typeof requirementSchema>
export const evidenceSchema = z
  .array(
    z.object({
      requirementId,
      completed: z.boolean(),
      notes: z.string().trim().max(1500).default(''),
      screenshots: z.array(z.string().uuid()).max(5).default([]),
    }),
  )
  .max(30)
export type RequirementEvidence = z.infer<typeof evidenceSchema>[number]

// Upgrade legacy briefs using only explicitly named requirement sections. The
// saved attempt brief is the source for old attempts, never the edited challenge.
export function requirementsFromBrief(brief: string): Requirement[] {
  const result: Requirement[] = []
  let kind: Requirement['kind'] | null = null
  let fenced = false
  for (const raw of brief.split('\n')) {
    const line = raw.trim()
    if (/^(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const heading = line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^\*\*|\*\*$/g, '')
      .replace(/:$/, '')
      .trim()
    if (
      /^(required functionality|requirements|the essentials|what it needs to do|required features)$/i.test(
        heading,
      )
    ) {
      kind = 'required'
      continue
    }
    if (/^(stretch goals|optional features|optional stretch goals)$/i.test(heading)) {
      kind = 'stretch'
      continue
    }
    if (/^#/.test(line) || /^(submission|submit|make it yours|consider the experience)/i.test(heading)) {
      kind = null
      continue
    }
    const bullet = /^(?:[-*•]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/.exec(line)
    if (kind && bullet && result.length < 30)
      result.push({ id: `brief-${result.length + 1}`, title: bullet[1].slice(0, 240), details: '', kind })
  }
  return result
}

export function withRequirements<T extends { brief: string; requirements: Requirement[] | null }>(row: T) {
  // NULL means a legacy brief; [] is an intentionally empty structured checklist.
  const { requirements, ...rest } = row
  return { ...rest, requirements: requirements ?? requirementsFromBrief(row.brief) }
}

export function validateEvidence(
  requirements: Requirement[],
  evidence: RequirementEvidence[],
  screenshots: string[],
) {
  const ids = new Set(requirements.map((item) => item.id))
  const seen = new Set<string>()
  for (const item of evidence) {
    if (!ids.has(item.requirementId))
      throw new Error('Evidence must refer to a requirement in the accepted checklist.')
    if (seen.has(item.requirementId)) throw new Error('Include only one evidence entry per requirement.')
    seen.add(item.requirementId)
    if (
      new Set(item.screenshots).size !== item.screenshots.length ||
      item.screenshots.some((id) => !screenshots.includes(id))
    )
      throw new Error('Requirement evidence must use screenshots attached to this submission.')
  }
}
