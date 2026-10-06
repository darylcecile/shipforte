import type { ConsentDescription } from '@cloudflare/workers-oauth-provider'

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
const styles = `body{font:16px/1.6 system-ui;background:#f8f9f4;color:#20251f;margin:0;padding:32px}main{max-width:580px;margin:6vh auto;background:white;padding:32px;border:1px solid #dedfd7;border-radius:16px}h1{line-height:1.2;letter-spacing:-.04em}button{padding:12px 20px;border:1px solid #d5d8ce;border-radius:8px;font:inherit;cursor:pointer;background:white}button[value=approve]{background:#c65132;color:white;border-color:#c65132}button:disabled{opacity:.65;cursor:wait}small{color:#636b60}li{margin:12px 0}a{color:#ad4229}#consent-status{padding:12px;background:#f0f3e9;border-radius:8px}`
export const scopeDescriptions: Record<string, string> = {
  'shipforte:read':
    'Read challenges, your attempts, and repositories available through your GitHub connection.',
  'shipforte:drafts': 'Upload screenshots and build sessions, and prepare submission drafts for your review.',
  offline_access: 'Stay connected with a refresh token for up to 30 days.',
}

// The URI has already been validated by the OAuth provider. Browsers can apply
// form-action to the POST's redirects as well, including a native client's loopback callback.
export function consentPolicy(redirectUri: string, nonce: string) {
  const callback = new URL(redirectUri)
  if (!['https:', 'http:'].includes(callback.protocol) || /[;'"\s]/.test(callback.origin))
    throw new Error('Invalid OAuth callback origin.')
  return `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self' ${callback.origin}; frame-ancestors 'none'; base-uri 'none'`
}

function document(title: string, content: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Shipforte</title><style>${styles}</style></head><body><main><p>shipforte.</p>${content}</main></body></html>`
}

export function consentPage(
  details: ConsentDescription,
  handle: string,
  user: { id: string; login: string },
  nonce: string,
) {
  return document(
    'Connect an agent',
    `
    <h1>Connect ${escapeHtml(details.clientName)}?</h1>
    <p>Signed in as <strong>${escapeHtml(user.login)}</strong>.</p>
    <p>${details.clientDomain ? `Published by <strong>${escapeHtml(details.clientDomain)}</strong>.` : 'This client’s name is self-reported.'} Access will be sent to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
    ${details.redirectIsLoopback ? '<p>This connects an app on your computer. Continue only if you just started this connection.</p>' : ''}
    <ul>${details.scope.map((scope) => `<li>${escapeHtml(scopeDescriptions[scope] || scope)}</li>`).join('')}</ul>
    <p><strong>Every submission requires your review in Shipforte.</strong> Choose public or private submission. Private projects and attachments remain visible only to you until you publish; eligible kudos are withheld until then. Public submissions cannot be made private. Moderators can hide public transcripts.</p>
    <form id="consent-form" method="post" action="/oauth/authorize">
      <input type="hidden" name="handle" value="${escapeHtml(handle)}">
      <input type="hidden" name="userId" value="${escapeHtml(user.id)}">
      <button name="decision" value="approve">Connect agent</button>
      <button name="decision" value="deny">Cancel</button>
    </form>
    <p id="consent-status" role="status" aria-live="polite" hidden></p>
    <p><small>You can revoke access from <a href="/agents">Connected agents</a> at any time.</small></p>
    <script nonce="${escapeHtml(nonce)}">
      const form = document.getElementById('consent-form');
      form.addEventListener('submit', (event) => {
        if (form.dataset.submitting) { event.preventDefault(); return; }
        const decision = event.submitter?.value === 'approve' ? 'approve' : 'deny';
        // Disabled submit buttons aren't included in form data. Preserve the actual decision first.
        const input = document.createElement('input');
        input.type = 'hidden'; input.name = 'decision'; input.value = decision;
        form.append(input);
        form.dataset.submitting = 'true';
        form.setAttribute('aria-busy', 'true');
        for (const button of form.querySelectorAll('button')) button.disabled = true;
        if (event.submitter) event.submitter.textContent = decision === 'approve' ? 'Connecting…' : 'Cancelling…';
        const status = document.getElementById('consent-status');
        status.textContent = decision === 'approve'
          ? 'Authorizing your agent and returning you to it. Please keep this tab open.'
          : 'Cancelling this connection and returning you to your agent.';
        status.hidden = false;
      });
      window.addEventListener('pageshow', (event) => {
        if (event.persisted && form.dataset.submitting) {
          document.getElementById('consent-status').textContent = 'This request has already been sent. Check your agent’s connection status, or start a new sign-in from your agent.';
        }
      });
    </script>`,
  )
}

export function consentResponse(
  details: ConsentDescription,
  handle: string,
  user: { id: string; login: string },
  nonce: string,
  headers: Headers,
) {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'text/html; charset=utf-8')
  responseHeaders.set('Cache-Control', 'no-store')
  responseHeaders.set('Content-Security-Policy', consentPolicy(details.redirectUri, nonce))
  // no-referrer also makes native form POSTs send Origin: null. Keep same-origin
  // consent verifiable without leaking the authorization URL to the client callback.
  responseHeaders.set('Referrer-Policy', 'same-origin')
  return new Response(consentPage(details, handle, user, nonce), { headers: responseHeaders })
}

export function consentErrorPage(message: string) {
  return new Response(
    document(
      'Connection request unavailable',
      `
    <h1>This connection request is no longer available.</h1>
    <p>${escapeHtml(message)}</p>
    <p>If you already clicked <strong>Connect agent</strong>, check whether your agent is connected. This approval link works only once.</p>
    <p>If your agent still needs authentication, start a new sign-in from the agent and open its new link in this browser.</p>
    <p><a href="/agents">View connected agents →</a></p>`,
    ),
    {
      status: 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      },
    },
  )
}
