# Shipforte

A project challenge platform built with React, TanStack Start, TypeScript 7,
Tailwind CSS, Cloudflare Workers, D1, Drizzle, and R2. Code review uses
`@pierre/diffs` 1.4.1.

**Production domain:** https://shipforte.com

**Worker preview:** https://snowy-disk-3ef3.darylcecile.workers.dev

## Run locally

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

Open http://localhost:3000. Populate `.dev.vars` with a development GitHub App's
configuration to sign in. Local D1 and R2 data are separate from production.
The seed creates nine starter challenges and a platform curator profile; it does
not create votes, awards, fake submissions, or login sessions.

## Connect the GitHub App

Register a GitHub App at https://github.com/settings/apps/new with:

| Setting                                        | Value                                              |
| ---------------------------------------------- | -------------------------------------------------- |
| Homepage URL                                   | `https://shipforte.com`                            |
| Callback URL                                   | `https://shipforte.com/api/auth/callback`          |
| Setup URL                                      | `https://shipforte.com/builds`                     |
| Webhook URL                                    | `https://shipforte.com/api/github/webhook`         |
| Webhook secret                                 | A randomly generated secret, also configured below |
| Repository Contents                            | Read-only                                          |
| Repository Metadata                            | Read-only (automatically granted)                  |
| Request user authorization during installation | Off                                                |
| Expire user authorization tokens               | On; token refresh is implemented                   |
| Where can this App be installed?               | Any account                                        |

No write permission, private key, email permission, or GitHub comment permission
is needed. Authentication uses GitHub App **user access tokens** with PKCE and
OAuth state validation. Repository discovery automatically lists the user's own
public repositories and merges public repositories from accessible App installations
where they have push permission. Personal public repositories need no separate
installation: selecting one for submission shares it with Shipforte. Ownership is
verified using the authenticated user's numeric GitHub ID. Public read endpoints
are used when an App token cannot read an uninstalled public repository.
The authorization-revoked webhook clears the user's credentials and sessions.

For local development, register a separate App with the same paths on
`http://localhost:3000`; webhook delivery requires a reachable tunnel. The
production App can also have an additional localhost callback if preferred.

Copy `github-config.example.json` to `github-config.json` (gitignored), and fill:

- `GITHUB_CLIENT_ID`: App **Client ID**, not App ID.
- `GITHUB_CLIENT_SECRET`: a client secret generated in App settings.
- `GITHUB_APP_SLUG`: the slug from `github.com/apps/your-app-slug`.
- `GITHUB_WEBHOOK_SECRET`: the same random secret configured in GitHub.
- `MODERATOR_GITHUB_IDS`: comma-separated numeric GitHub user IDs. Obtain your ID
  from `https://api.github.com/users/YOUR_LOGIN`. Moderation is checked on every
  request against these IDs, not mutable usernames.

Then run:

```sh
pnpm github:configure ./github-config.json
```

If the GitHub settings and moderator IDs are already in `.dev.vars`, use it directly:

```sh
pnpm github:configure .dev.vars
```

Only the GitHub settings and moderator IDs are uploaded. The local `APP_URL` and
local token encryption key are not copied to production; the helper generates a
separate production encryption key on first setup and preserves it on later runs.

This uploads configuration through Wrangler, generates an AES-256 token encryption
key if one does not already exist, and preserves existing encryption keys. Secrets
are never printed. You can remove the local JSON file after configuration.

For local development, populate the corresponding `.dev.vars` values, including
`APP_URL=http://localhost:3000` and a separately generated key:

```sh
openssl rand -base64 32
```

After signing in, your personal public repositories appear automatically. To use an
organization repository, choose **Connect an organization** in the submission form.
The list reloads when you return from GitHub, preserving your in-progress form.
On submission, the server resolves the latest commit on the repository's current
default branch and saves that exact SHA and its immutable snapshot. No manual SHA
or commit selection is required; push your finished work before submitting.

## Deploy

### Domain setup

`wrangler.jsonc` configures `shipforte.com` as a Worker Custom Domain and the
canonical origin for GitHub callbacks. Its Cloudflare zone is active, using
`etta.ns.cloudflare.com` and `terry.ns.cloudflare.com` as nameservers at Porkbun.
Wrangler manages the domain's Worker DNS record and HTTPS certificate. Existing
apex A, AAAA, or CNAME records must be removed before the initial attachment.

The Worker preview remains available for browsing. GitHub sign-in starts on the
canonical domain so its OAuth state cookie and callback use the same hostname.
Complete domain activation before configuring the production GitHub App.

### Worker resources

Resources have already been provisioned in the current Cloudflare account:

- Worker: `snowy-disk-3ef3`
- D1: `emistry`, bound as `DB`
- R2: `emistry-assets`, bound as `ASSETS_BUCKET`
- KV: `shipforte-oauth`, bound as `OAUTH_KV`

Use the Workers Paid plan for repository snapshot processing. The configured CPU
budget is 60 seconds; paid Workers also allow enough R2 subrequests for the 5,000-file
snapshot limit. See [Cloudflare's runtime limits](https://developers.cloudflare.com/workers/platform/limits/).

```sh
pnpm exec wrangler login
pnpm db:migrate:remote
pnpm deploy
```

For a fresh deployment, starter challenges are optional:

```sh
pnpm exec wrangler d1 execute DB --remote --file scripts/seed.sql
pnpm exec wrangler d1 execute DB --remote --file scripts/seed-more-challenges.sql
```

For another account, create a D1 database and R2 bucket with Wrangler, update their
bindings in `wrangler.jsonc`, and set `APP_URL` to the new deployment's canonical
origin. Update the GitHub URLs to match. Configure secrets after the first deploy.

Schema changes use `pnpm db:generate`, followed by the local and remote migration
commands. No PostgreSQL service is used. D1 migrations are checked into `drizzle/`.

## How the application is organized

### Checklists and showcases

Challenge editors include a structured checklist of up to 30 required features or
optional stretch goals. Each item has a stable ID, title, and optional details.
The checklist is copied when an attempt starts. Legacy challenges/attempts with a
NULL checklist derive one only from explicit requirement sections in their own
saved brief; an explicitly saved empty checklist stays empty.

Submissions can report completion, notes, and up to five attached screenshots per
requirement. Evidence is pinned to the version and is labelled as builder-reported;
it does not replace moderator assessment. Public viewers can leave feedback on a
specific requirement. MCP reads the same accepted checklist and accepts the same
evidence and showcase fields through `prepare_submission`.

Authors can add or update an HTTPS recording link and Markdown learning notes on
their submission. YouTube, Vimeo, and Loom URLs have allowlisted player embeds;
other links open externally. Showcase edits do not change the submitted code,
evidence, deadline, or award. Authors may select up to five captioned transcript
passages; only source references are stored, and excerpts are resolved after
visibility checks so hiding a transcript also hides its public highlights.

Profiles can feature up to three ordered, public, non-archived, non-revoked builds.
Public profiles and submissions have share dialogs, downloadable PNG cards, and
Open Graph tags in their initial HTML for crawlers. Images are rendered by
`@resvg/resvg-wasm` using a bundled OFL-licensed font; no external rendering service
or runtime font fetch is needed. Private submissions are excluded even for an
authenticated owner requesting a share image. The endpoints are
`/api/share/submissions/:id.png` and `/api/share/people/:login.png`.

### Private submissions and publication

Choose **Private — publish later** to save a submission visible only to its owner
on Shipforte. The server records the original request time, pins the commit, and
saves the code, screenshots, and transcripts immediately. Eligible kudos are
stored as `pending` and excluded from balances until publication. Repository and
code claims are reserved at that point, so waiting to publish cannot enable reuse.

The owner finds the private snapshot in **My builds** or its challenge page and
confirms **Publish permanently** when ready. Publication atomically makes it
public, releases eligible kudos, announces it, and archives its predecessor.
The original submission timestamp—not publication time—determines deadline
eligibility. Publication needs no GitHub fetch and never replaces the saved code.
Repeated requests cannot award twice. A database trigger prevents public-to-private
changes. A private submission must be published before another attempt for that
challenge; this keeps version and redo-award ordering unambiguous.

Private submissions, their files/downloads, images, transcripts, and private
timeline events are owner-only, including against moderator accounts. Community
votes/comments/moderation become available after publication. Feeds, profile
counts, rankings, and invitation progress expose public submissions only.
The repository still must be public on GitHub at submission: Shipforte visibility
does not change external repositories, demos, or share links.

### Build sessions and agent submissions

Submissions can include up to ten build sessions: Markdown, TXT, JSON, or
JSONL exports up to 10 MB each, pasted text, or HTTPS share links. Uploads stay
private until public submission or later publication. Moderators can hide/restore individual public transcripts;
hidden content and its download remain accessible only to the author and
moderators. Visibility is checked on each request, without public caching.

Session imports require only a file, pasted transcript, or share URL. Shipforte
detects the harness, session title, version, agent, models, token usage, and USD
cost from recognized export metadata. Users do not fill in these fields. Pasted
JSON/JSONL retains structured detection. Copilot native logs, OpenCode exports,
Claude Code logs, Codex rollouts, and Cursor export headers are recognized.
Public single-file Gists can supply metadata through GitHub's public API; other
share links provide only recognizable host information. Missing fields stay
unreported, and billing credits/multipliers are never relabelled as USD.
No transcript is presented as independently verified provenance.

The remote MCP endpoint is **`https://shipforte.com/mcp`**. See [MCP.md](MCP.md)
for client setup, export guidance, scopes, upload semantics, and the review flow.
Users manage connections and drafts at `/agents`. Every MCP submission requires
the account owner's **Approve and submit** button at `/agent-submissions/:id`.

Deployment includes the D1 migration in `drizzle/`, the `shipforte-oauth` KV namespace
bound as `OAUTH_KV`, and an hourly cleanup trigger. The production namespace ID is
recorded in `wrangler.jsonc`. For another account, create a KV namespace and update
that binding. Local development uses local KV. Apply the D1 migration before
deploying the new code.
The GitHub App's existing callback remains `/api/auth/callback`.

The cleanup trigger deletes abandoned transcript uploads after seven days,
excluding uploads referenced by a still-active draft, and removes expired upload
tickets and rate-limit entries. Submitted transcripts are retained. OAuth records
use the provider's expiry settings. Drafts expire after seven days; connections
expire after thirty days and can be revoked immediately in Shipforte.

```text
src/db/        Drizzle schema and D1 connection
src/domain/    Pure product rules and their unit tests
src/server/    Authentication, GitHub, snapshots, queries, and mutations
src/routes/    TanStack pages and the /api/* HTTP entry point
src/ui/        Shared UI and feature pages
scripts/       Starter challenges and GitHub configuration helper
```

The browser uses a small JSON API and TanStack Query for cache invalidation and
periodic refresh. Mutations check authentication, ownership, and moderator access
on the server. Same-origin checks protect browser mutations; webhooks use HMAC
signature verification. Tokens are encrypted in D1; session cookies contain random
opaque values whose hashes are stored server-side.

### Atomic lifecycle changes

D1 batches atomically apply attempt, submission, award, timeline, and notification
changes. Revision guards reject stale concurrent writes and roll the entire batch
back. Unique constraints prevent double submissions, duplicate votes/invitations,
and multiple active attempts. No queues, cron-driven timers, or additional services
are needed. A deadline is just an immutable timestamp checked when submitting.

An accepted community redo places existing challenge awards on hold. An on-time
replacement transfers that value into its own award. A late replacement earns
nothing; a moderator-revoked award cannot be restored through the redo path.
Moderator-enabled replacements award the full amount after revocation or 20% when
the previous award is retained. Archived submissions remain readable and their votes
are frozen.

Moderators can archive or restore a published challenge from its page or the
moderation workspace. Archiving removes it from Discover and the recent-submissions
feed and closes new attempts and invitations. Direct links, existing attempts,
submissions, and earned kudos remain available. Edits preserve the archived state;
only the explicit restore action relists the challenge. Archive and restore events
are recorded in submission timelines.

### Snapshot and upload storage

GitHub archives are streamed through a TAR reader into content-addressed R2 file
blobs. Each submission has an immutable manifest. The code viewer and comments use
these stored files, not the current GitHub branch. Binary files can be downloaded
and receive file-level feedback; text files support line ranges. Resubmission diffs
include added, modified, and deleted files.

Screenshots are verified by their file signatures, limited to 10 MB each, and served
through the Worker. A submission accepts 1–20 PNG, JPEG, or WebP screenshots.
Repository snapshots are limited to 40 MB expanded, 8 MB per file, and 5,000 files, with explicit
errors for larger repositories. Keep generated output and vendored dependencies out
of submitted repositories. R2 buckets need no public access configuration.

Repository reuse checks use fork ancestry, filename-independent snapshot hashes,
and normalized source-file similarity. These catch forks, exact copies, and
substantial unchanged source reuse. They are not a proof of originality: sufficiently
rewritten copies still require moderator judgment. All submitted code is public
within the platform and remains available after GitHub access is removed.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm build
```

Use `pnpm format` for Oxfmt and `pnpm lint` for Oxlint. Unit tests cover our deadline,
award, redo-threshold, ranking, upload-format, and copy-detection rules. They do not
test library internals. There is no added integration-test framework.

## Operational checks

After configuring the GitHub App, verify a real sign-in, automatic public repository discovery,
on-time submission with screenshots, and the saved default-branch commit snapshot. Test with a second
account for votes, comments, follows, and invitations. A moderator account can review
proposals and revoke or reopen submissions. Local browser QA can use local D1 fixture
records; there is no application authentication bypass or development login endpoint.

`pnpm exec wrangler tail` shows runtime errors. D1 and R2 must both be available
for submission finalization. If finalization fails, the attempt remains unsubmitted
and no award is issued. Uploads and content-addressed blobs written before a failed
finalization can remain in R2; they are not exposed as a successful submission.
