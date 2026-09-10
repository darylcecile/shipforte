import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attemptAward, copiedFiles, onTime, ranks, redoEligible, screenshotType, tiers } from './rules'

test('kudos window closes exactly at the deadline, including redos', () => {
  const deadline = Date.UTC(2026, 8, 10)
  assert.equal(onTime(deadline - 1, deadline), true)
  assert.equal(onTime(deadline, deadline), false)
  assert.equal(onTime(deadline + 1, deadline), false)
})
test('repeat and moderator awards follow the agreed rules at every tier', () => {
  for (const full of Object.values(tiers)) {
    assert.equal(attemptAward('initial', full, false, 0), full)
    assert.equal(attemptAward('repeat', full, false, full * 3), full / 5)
    assert.equal(attemptAward('moderator', full, false, full), full / 5)
    assert.equal(attemptAward('moderator', full, true, 0), full)
  }
})
test('a community redo puts the complete earned challenge amount at stake, without adding a bonus', () => {
  assert.equal(attemptAward('redo', 80, false, 96), 96)
  assert.equal(attemptAward('redo', 160, false, 0), 0)
})
test('redo requires both thirty voters and at least twenty-five percent redo votes', () => {
  assert.equal(redoEligible(0, 0, 29), false)
  assert.equal(redoEligible(20, 3, 7), false)
  assert.equal(redoEligible(20, 2, 8), true)
  assert.equal(redoEligible(24, 0, 8), true)
  assert.equal(redoEligible(25, 0, 8), false)
})
test('leaderboards assign tied scores the same rank without modifying their input', () => {
  const input = [
    { id: 'a', score: 10 },
    { id: 'b', score: 30 },
    { id: 'c', score: 30 },
    { id: 'd', score: -1 },
  ]
  assert.deepEqual(
    ranks(input, (p) => p.score).map((p) => [p.id, p.rank]),
    [
      ['b', 1],
      ['c', 1],
      ['a', 3],
      ['d', 4],
    ],
  )
  assert.equal(input[0].id, 'a')
})
test('screenshot validation checks file bytes rather than trusting a MIME label or extension', () => {
  assert.equal(screenshotType(Buffer.from('89504e470d0a1a0a00000000', 'hex')), 'image/png')
  assert.equal(screenshotType(Buffer.from('ffd8ffe00000000000000000', 'hex')), 'image/jpeg')
  assert.equal(screenshotType(Buffer.from('524946460000000057454250', 'hex')), 'image/webp')
  assert.equal(screenshotType(Buffer.from('<svg onload="alert(1)">')), null)
})
test('copy matching catches substantial shared source without matching a lone common file', () => {
  assert.equal(copiedFiles(8, 10, 11), true)
  assert.equal(copiedFiles(1, 1, 100), false)
  assert.equal(copiedFiles(3, 10, 10), false)
})
