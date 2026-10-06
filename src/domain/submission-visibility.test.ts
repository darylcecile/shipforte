import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canReadSubmission, eligibleKudos, releasedKudos } from './submission-visibility'
import { submissionInput } from './agent-submissions'

test('a private submission is readable only by its owner, including when others are moderators', () => {
  const row = { userId: 'owner', visibility: 'private' as const }
  assert.equal(canReadSubmission(row, null), false)
  assert.equal(canReadSubmission(row, { id: 'stranger' }), false)
  const moderator = { id: 'moderator', moderator: true }
  assert.equal(canReadSubmission(row, moderator), false)
  assert.equal(canReadSubmission(row, { id: 'owner' }), true)
  assert.equal(canReadSubmission({ ...row, visibility: 'public' }, null), true)
})

test('private deadline eligibility is determined by original submission time, including the exact boundary', () => {
  const deadline = 1000
  assert.equal(eligibleKudos(999, deadline, 160), 160)
  assert.equal(eligibleKudos(1000, deadline, 160), 0)
  assert.equal(eligibleKudos(1001, deadline, 160), 0)
  // Publication time deliberately isn't an input to this rule.
  assert.equal(releasedKudos(eligibleKudos(999, deadline, 16), 'repeat', 0), 16)
})

test('redo publication cannot restore revoked awards or more kudos than were reserved', () => {
  assert.equal(releasedKudos(96, 'redo', 96), 96)
  assert.equal(releasedKudos(96, 'redo', 16), 16)
  assert.equal(releasedKudos(96, 'redo', 0), 0)
  assert.equal(releasedKudos(16, 'redo', 96), 16)
  assert.equal(releasedKudos(80, 'moderator', 0), 80)
})

test('browser and MCP submission schemas accept private visibility without changing legacy public defaults', () => {
  const input = {
    attemptId: '00000000-0000-4000-8000-000000000001',
    repoId: 1,
    title: 'Livestream build',
    description: 'A finished build to reveal during the stream.',
    screenshots: ['00000000-0000-4000-8000-000000000002'],
  }
  assert.equal(submissionInput.parse(input).visibility, 'public')
  assert.equal(submissionInput.parse({ ...input, visibility: 'private' }).visibility, 'private')
  assert.equal(submissionInput.safeParse({ ...input, visibility: 'unlisted' }).success, false)
})
