import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canSubmitRepository } from './repository-access'

test('owned public repositories can be submitted without an App installation', () => {
  assert.equal(canSubmitRepository({ id: 10, private: false, owner: { id: 20 } }, 20, []), true)
})

test('public visibility alone does not let someone submit another user’s repository', () => {
  assert.equal(canSubmitRepository({ id: 10, private: false, owner: { id: 20 } }, 21, []), false)
  assert.equal(canSubmitRepository({ id: 10, private: false, owner: { id: 20 } }, 21, [11]), false)
  assert.equal(canSubmitRepository({ id: 10, private: false, owner: { id: 20 } }, 21, [10]), true)
})

test('private repositories are rejected even when owned or explicitly shared', () => {
  const repo = { id: 10, private: true, owner: { id: 20 } }
  assert.equal(canSubmitRepository(repo, 20, []), false)
  assert.equal(canSubmitRepository(repo, 21, [10]), false)
})
