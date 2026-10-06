import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  requirementsFromBrief,
  requirementsSchema,
  validateEvidence,
  withRequirements,
} from './challenge-requirements'

test('legacy checklist import reads named sections, preserves stretch goals, and ignores code and submission instructions', () => {
  const brief =
    '# Idea\n- Not a requirement\n## Required functionality\n- [ ] Save a habit\n• Track progress\n```md\n- Ignore example\n```\n## Stretch goals\n- Add charts\n## Submission\n- Attach screenshots'
  const items = requirementsFromBrief(brief)
  assert.deepEqual(
    items.map((item) => [item.title, item.kind]),
    [
      ['Save a habit', 'required'],
      ['Track progress', 'required'],
      ['Add charts', 'stretch'],
    ],
  )
  assert.deepEqual(
    items.map((item) => item.id),
    ['brief-1', 'brief-2', 'brief-3'],
  )
})
test('accepted checklist is independent of later brief edits and intentionally empty checklists stay empty', () => {
  const saved = [{ id: 'original', title: 'Original requirement', details: '', kind: 'required' as const }]
  assert.deepEqual(
    withRequirements({ brief: '## Requirements\n- Changed', requirements: saved }).requirements,
    saved,
  )
  assert.deepEqual(
    withRequirements({ brief: '## Requirements\n- Changed', requirements: [] }).requirements,
    [],
  )
  assert.equal(
    withRequirements({ brief: '## Requirements\n- Original', requirements: null }).requirements[0].title,
    'Original',
  )
})
test('requirement evidence rejects foreign IDs, duplicate reports, and unattached screenshots', () => {
  const requirements = [{ id: 'a', title: 'A', details: '', kind: 'required' as const }]
  const evidence = { requirementId: 'a', completed: true, notes: 'Implemented', screenshots: ['image'] }
  assert.doesNotThrow(() => validateEvidence(requirements, [evidence], ['image']))
  assert.throws(() => validateEvidence(requirements, [{ ...evidence, requirementId: 'other' }], ['image']))
  assert.throws(() => validateEvidence(requirements, [evidence, evidence], ['image']))
  assert.throws(() => validateEvidence(requirements, [evidence], []))
  assert.equal(requirementsSchema.safeParse([requirements[0], requirements[0]]).success, false)
})
