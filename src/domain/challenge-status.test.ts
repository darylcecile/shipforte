import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canEditChallenge, canReadChallenge, editedChallengeStatus } from './challenge-status'

const author = { id: 'author', moderator: false }
const other = { id: 'other', moderator: false }
const moderator = { id: 'moderator', moderator: true }

test('archived challenges remain readable through direct links', () => {
  const challenge = { status: 'archived' as const, authorId: author.id }
  assert.equal(canReadChallenge(challenge, null), true)
  assert.equal(canReadChallenge(challenge, other), true)
})

test('unpublished proposals remain private to their author and moderators', () => {
  const challenge = { status: 'pending' as const, authorId: author.id }
  assert.equal(canReadChallenge(challenge, null), false)
  assert.equal(canReadChallenge(challenge, other), false)
  assert.equal(canReadChallenge(challenge, author), true)
  assert.equal(canReadChallenge(challenge, moderator), true)
})

test('archiving does not return editing privileges to the challenge author', () => {
  const challenge = { status: 'archived' as const, authorId: author.id }
  assert.equal(canEditChallenge(challenge, author), false)
  assert.equal(canEditChallenge(challenge, other), false)
  assert.equal(canEditChallenge(challenge, moderator), true)
  assert.equal(canEditChallenge({ ...challenge, status: 'pending' }, author), true)
  assert.equal(canEditChallenge({ ...challenge, status: 'pending' }, other), false)
})

test('editing archived challenges keeps them unlisted, while proposal edits return to review', () => {
  assert.equal(editedChallengeStatus('archived'), 'archived')
  assert.equal(editedChallengeStatus('live'), 'live')
  assert.equal(editedChallengeStatus('rejected'), 'pending')
  assert.equal(editedChallengeStatus('changes_requested'), 'pending')
})
