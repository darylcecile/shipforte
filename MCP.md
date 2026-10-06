# Shipforte MCP and build-session transcripts

## Connect a harness

Add `https://shipforte.com/mcp` as a **Streamable HTTP** MCP server with **OAuth**.
For local development use `http://localhost:3000/mcp` and set `APP_URL` to that
same origin in `.dev.vars`.

The MCP server uses the SDK's classic initialize handshake (including protocol
revision 2025-11-25). OpenCode V2's default `legacy` MCP protocol works; do not
force its 2026-07-28-only transport mode for this endpoint. OAuth discovery uses
the current provider library, with PKCE, resource-bound tokens, Client ID
Metadata Documents, and dynamic client registration for older clients.

### OpenCode V2

```sh
opencode mcp add shipforte --global --url https://shipforte.com/mcp
```

Open `/mcps`, select Shipforte, and sign in. See the
[OpenCode V2 MCP guide](https://opencode.ai/v2/docs/mcp-servers).

### Other clients

Use the remote server URL in your client's MCP setup and complete its browser
authorization flow:

- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)
- [Claude Code](https://code.claude.com/docs/en/mcp)
- [Codex](https://developers.openai.com/codex/mcp/)
- [Cursor](https://cursor.com/docs/context/mcp)

Client versions, organization policy, and cloud-agent support differ. In
particular, Copilot CLI support should not be confused with Copilot cloud agent
OAuth support. Use an OAuth-capable client; Shipforte does not expose a token-only
publishing shortcut.

## Sign-in and permissions

The user signs in through the existing Shipforte GitHub App. A Shipforte consent
page shows the client's name, redirect destination, and requested permissions:

- `shipforte:read`: read challenges, accepted attempts, and accessible repositories.
- `shipforte:drafts`: upload attachments and prepare drafts for review.
- `offline_access`: refresh access during the connection's lifetime, if requested.

Shipforte issues its own audience-bound access tokens; GitHub tokens stay on the
server. Access tokens last one hour; refresh tokens rotate and the connection
lasts at most thirty days. Revoking a connection at `/agents` blocks further MCP
requests, refreshes, upload tickets, and approval of that connection's drafts.
GitHub authorization revocation also disables associated agent connections.

Consent is distinct from submission approval. No MCP tool can publish a project,
approve a draft, impersonate a moderator, or start an attempt's countdown.

## Submission workflow

1. The user accepts a challenge in Shipforte, starting the countdown.
2. The agent calls `list_attempts` / `get_challenge` to read the accepted terms.
3. It calls `list_repositories` and selects a public repository available to the account.
4. It calls `get_session_export_instructions`, exports the real harness session using
   its local tools, and calls `create_upload` for each local
   transcript and screenshot. Transcript attachments are optional; at least one
   screenshot is required.
5. It uploads the file bytes, then calls `prepare_submission` with the attachment
   IDs, repository ID, attempt ID, title, description, optional demo URL, and a
   client-generated UUID `requestId`.
6. Shipforte returns a review URL and sends the account owner a notification.
7. The owner reviews the exact draft and commit, opens its attachments, and
   clicks **Approve and submit** in Shipforte.
8. The agent can call `get_submission_status` for the final submission URL.

Preparation is idempotent for the same connection and request ID. Reusing the
request ID for different content is rejected. A draft is immutable except for
an owner-triggered refresh of the default-branch commit preview. To change other
details, reject the draft and prepare a replacement using a new request ID.

Approval rechecks repository access, screenshots, transcript ownership, reuse,
the default-branch commit, the active connection, and the original attempt.
It uses the same snapshot and award service as browser submissions. The draft
and submission are finalized in the same guarded D1 batch. Duplicate approval
returns the existing submission. A concurrent rejection, revocation, or preview
refresh invalidates the stale approval.

The approval request's arrival time determines deadline eligibility. Draft
creation does not reserve a deadline. If the repository's default branch changed,
approval fails until the owner refreshes and reviews the updated commit.

## Tools

### Private submissions

Set `submission.visibility` to `private` in `prepare_submission` to save now and
reveal later; omitted visibility defaults to `public`. The mandatory owner review
clearly displays the choice. Approval records the deadline time and saves the
immutable snapshot in both modes. Private submissions and attachments are visible
only to the owner on Shipforte, with eligible kudos withheld until publication.
The GitHub repository still must be public; external links retain their visibility.

Use `list_my_submissions` to find saved private projects and `get_publication_review`
to return the owner’s review URL. The owner clicks **Publish submission** and
confirms **Publish permanently** in Shipforte. There is no direct MCP publishing
tool; do not automate this confirmation. Revoking an agent does not prevent the
owner from publishing their already-submitted snapshot through the browser.

Publication after the deadline releases kudos based on original submission time.
It never refetches or modifies the snapshot. Late private submissions earn no
kudos. Redo restoration excludes subsequently revoked awards. Reserved repository
and code claims prevent reuse while private. Public submissions cannot become
private. Publish a private submission before another attempt for that challenge.

### Requirement evidence and showcase notes

`get_challenge` returns the structured `requirements` list alongside the Markdown
brief, and `list_attempts` returns the checklist accepted by each attempt. Use the
attempt's requirement IDs rather than a later edited challenge definition.

`prepare_submission.submission` also accepts:

- `evidence`: entries with `requirementId`, `completed`, optional `notes`, and
  `screenshots` containing IDs from this submission's screenshot list.
- `videoUrl`: optional HTTPS demo video or livestream recording link.
- `learnings`: optional Markdown notes about discoveries, tradeoffs, and lessons.

The owner reviews these with the commit and attachments before approving. Mark
completion honestly; the checklist is builder-reported and does not replace
moderator review. Unknown requirement IDs, duplicate reports, and screenshots not
attached to the submission are rejected. Omitted evidence is shown as not reported.

The owner can later edit recording/learning notes, select actual transcript
passages as highlights, and pin public projects on their profile in Shipforte.
These showcase edits preserve the original evidence and immutable code snapshot.

### Tool reference

| Tool                              | Purpose                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| `whoami`                          | Connected account and granted scopes                           |
| `list_challenges`                 | Published challenges                                           |
| `get_challenge`                   | Brief, attempts, and browser challenge URL                     |
| `list_attempts`                   | Original accepted briefs, deadlines, and awards                |
| `list_repositories`               | Accessible public repositories                                 |
| `get_session_export_instructions` | Native export workflow using available harness/session context |
| `create_upload`                   | Short-lived upload capability for local bytes                  |
| `attach_transcript_link`          | An HTTPS share link with reported metadata                     |
| `prepare_submission`              | Draft and owner review URL; never publishes                    |
| `get_submission_status`           | Pending, rejected, expired, or submitted status                |

### Uploads

`create_upload` requires only `kind` (`screenshot` or `transcript`) and `name`
(a filename, not a local path). Shipforte automatically reads session metadata
from the uploaded artifact. The `transcript` object is optional: an agent may
supply additional harness-reported fields it collected directly, but must never
ask the user to enter models, versions, costs, or token counts. Export the session
before requesting an upload ticket, so the export does not contain the ticket.

`get_session_export_instructions` returns the appropriate native-export workflow.
It uses the connection's client name as a hint and OpenCode's `_meta.sessionID`
when available; it does not use session IDs for authentication. The remote MCP
server cannot read the local transcript itself: the calling agent executes the
export with its own local tools and uploads the bytes. Prefer structured exports
to rendered text, which often drops metadata.

`create_upload` returns `uploadUrl`, `method: "PUT"`, an `Authorization` header, and
an expiry ten minutes in the future. The agent's local HTTP/shell tool sends
the file bytes as the request body, without base64 encoding. The response
contains the attachment `id`. Repeating a successfully completed upload ticket
returns the same ID. The upload credential is scoped to that one file ticket,
not a general MCP access token. It should not be included in the transcript or
printed in agent responses.

Screenshots are PNG/JPEG/WebP up to 10 MB; their bytes are checked. Transcript
exports are UTF-8 `.md`, `.txt`, `.json`, or `.jsonl` up to 10 MB. JSON syntax is
validated. Arbitrary HTML is not accepted. Transcript rendering does not execute
HTML or fetch embedded remote images. Unknown structured records remain available
through original text/download even when the conversation view cannot interpret them.

There is no remote filesystem access: passing `/Users/me/session.jsonl` to
Shipforte cannot upload it. The local harness or the user must supply the bytes.

## Export guidance and reported metrics

| Harness     | Transcript source                                                                                    | Automatic structured metadata                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Copilot CLI | Native `events.jsonl`; `/share file session.md` or `/share gist` as rendered alternatives            | Harness version, model switches, agents, available usage events and shutdown totals. Billing multipliers/credits are not USD. |
| OpenCode V2 | Experimental `GET /api/experimental/session/{sessionID}/export` through the authenticated local API  | Message model/agent, tokens/cache/reasoning, reported USD cost                                                                |
| Claude Code | Native session JSONL or structured message captures; `/export session.txt` as a rendered alternative | Recorded version, model and input/output/cache tokens; `total_cost_usd` if a result record is included                        |
| Codex       | Native rollout JSONL or App Server `thread/read` with `includeTurns: true`                           | `cli_version`, models/agent roles, and latest cumulative `token_count` totals where present                                   |
| Cursor      | Chat export or a public shared-transcript URL where supported by the plan                            | Harness/version/title from export headers; harness from recognized share links. Missing model/usage data remains unreported.  |

The harness version is read from the source when present. These formats evolve;
the original uploaded artifact is retained. Plain text and most share links do
not include usage. Public single-file Gists can be inspected through GitHub's
public API for available metadata without copying their transcript contents.
A Codex thread export may contain messages without usage records.
Claude JSONL internals are not a stable public format. No parser reconstructs
deleted or compacted history or automatically includes separate subagent sessions.
Attach those sessions separately when available.

Usage fields are nullable: `inputTokens`, `outputTokens`, `cacheReadTokens`,
`cacheWriteTokens`, `reasoningTokens`, and `costUsd`. Null means unavailable;
zero means the source explicitly reported zero. Costs are reported USD amounts,
not billing invoices or subscription charges. A source's reported cost can itself
be an estimate; Shipforte does not calculate one. Counts are displayed
separately because cache/reasoning overlap differs between harnesses. Shipforte
does not sum across multiple attached sessions, which might overlap.

Sources:

- [Copilot session sharing](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/chronicle)
- [Copilot native event metadata and usage units](https://github.com/github/copilot-sdk/blob/main/nodejs/src/generated/session-events.ts)
- [OpenCode V2 API and schema](https://opencode.ai/v2/docs/api)
- [Claude Code session exports](https://code.claude.com/docs/en/sessions)
- [Codex App Server](https://developers.openai.com/codex/app-server/)
- [Cursor shared transcripts](https://cursor.com/help/ai-features/shared-transcripts)
- [Workers OAuth Provider](https://github.com/cloudflare/workers-oauth-provider)

## Deployment and manual verification

Apply the generated D1 migration, provision/bind `OAUTH_KV`, and deploy. The new
hourly trigger cleans abandoned transcripts and expired bookkeeping. Use a
development GitHub App for localhost sign-in, as described in README.md.

Before production rollout, verify with actual signed-in clients: OAuth consent
and cancellation; reconnect/refresh/revoke; screenshot and transcript uploads;
draft notification and owner-only review; changed-commit rejection; successful
approval; duplicate approval; moderator hide/restore; and a second account being
unable to read another user's pending attachments or draft.
