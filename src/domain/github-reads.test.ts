import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultBranchCommit, githubResponse } from '../server/github'

test('submission commit resolution uses the current default branch, including branch names with slashes', async (t) => {
  const sha = 'a'.repeat(40)
  const request = t.mock.method(globalThis, 'fetch', async (..._args: Parameters<typeof fetch>) =>
    Response.json({ sha }),
  )
  const result = await defaultBranchCommit(
    'test-token',
    { full_name: 'builder/project', default_branch: 'release/next' },
    true,
  )
  assert.equal(
    request.mock.calls[0].arguments[0],
    'https://api.github.com/repos/builder/project/commits/release%2Fnext',
  )
  assert.equal(result.sha, sha)
  assert.equal(request.mock.callCount(), 1)
})

test('an uninstalled public repository can be read without forwarding user credentials', async (t) => {
  let calls = 0
  const request = t.mock.method(globalThis, 'fetch', async (..._args: Parameters<typeof fetch>) =>
    ++calls === 1 ? new Response('', { status: 403 }) : Response.json({ id: 10, private: false }),
  )
  const response = await githubResponse('test-token', '/repositories/10', true)
  assert.equal(response.status, 200)
  assert.equal(request.mock.callCount(), 2)
  assert.equal(new Headers(request.mock.calls[1].arguments[1]?.headers).has('Authorization'), false)
})

test('expired credentials and rate limits do not silently fall back to anonymous access', async (t) => {
  const request = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }))
  await assert.rejects(githubResponse('test-token', '/repositories/10', true), { status: 401 })
  assert.equal(request.mock.callCount(), 1)
  request.mock.mockImplementation(
    async () => new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
  )
  await assert.rejects(githubResponse('test-token', '/repositories/10', true), { status: 429 })
  assert.equal(request.mock.callCount(), 2)
})

test('App-only requests cannot fall back to public access', async (t) => {
  const request = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }))
  await assert.rejects(githubResponse('test-token', '/user/installations'), { status: 403 })
  assert.equal(request.mock.callCount(), 1)
})
