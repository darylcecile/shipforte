import assert from 'node:assert/strict'
import { test } from 'node:test'
import { consentPolicy, consentErrorPage, consentResponse } from '../server/agent-consent'

test('consent CSP allows the validated callback origin, including native loopback ports', () => {
  for (const callback of [
    'http://127.0.0.1:43210/callback?state=private',
    'https://client.example/oauth/callback',
  ]) {
    const policy = consentPolicy(callback, 'test-nonce')
    const directive = policy.split('; ').find((part) => part.startsWith('form-action'))
    assert.equal(directive, `form-action 'self' ${new URL(callback).origin}`)
    assert.ok(policy.includes("script-src 'nonce-test-nonce'"))
    assert.ok(policy.includes("frame-ancestors 'none'"))
    assert.ok(!policy.includes('private'))
  }
  assert.throws(() => consentPolicy('javascript:alert(1)', 'test-nonce'))
  assert.throws(() => consentPolicy('https://evil.example;form-action/callback', 'test-nonce'))
})

test('consent response preserves its browser-binding cookie and same-origin POST origin', () => {
  const cookie = '__Host-oauth-consent-test=bound; Path=/; Secure; HttpOnly; SameSite=Lax'
  const response = consentResponse(
    {
      clientId: 'test-client',
      clientName: 'OpenCode',
      scope: ['shipforte:read'],
      redirectUri: 'http://localhost:43210/callback',
      redirectHost: 'localhost',
      redirectIsLoopback: true,
    },
    'test-handle',
    { id: 'test-user', login: 'test-user' },
    'test-nonce',
    new Headers({ 'Set-Cookie': cookie }),
  )
  assert.equal(response.headers.get('Referrer-Policy'), 'same-origin')
  assert.equal(response.headers.get('Set-Cookie'), cookie)
  assert.match(response.headers.get('Content-Type')!, /text\/html/)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
})

test('consent recovery escapes errors and directs users to a fresh flow rather than reusing approval', async () => {
  const response = consentErrorPage('<script>alert(1)</script>')
  assert.equal(response.status, 400)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const html = await response.text()
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('start a new sign-in from the agent'))
  assert.ok(html.includes('href="/agents"'))
  assert.ok(!html.includes('<form'))
})
