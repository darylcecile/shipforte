import { Link, useNavigate } from '@tanstack/react-router'
import { Bot, Check, Clock3, ExternalLink, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { connectedAgents } from '../server/agent-auth'
import type { draftDetail, listDrafts } from '../server/agent-drafts'
import { useData } from './api'
import { date, Empty, ErrorState, Loading, Modal, PageTitle } from './components'
import { useAction, useSession } from './provider'
import { Markdown } from './markdown'
import { TranscriptCard } from './transcripts'
import { EvidenceSummary } from './requirements'
import { VideoRecording } from './showcase'

function SignIn({ returnTo }: { returnTo: string }) {
  return (
    <Empty
      title="Connect your GitHub account"
      description="Sign in to manage your agents and review their submissions."
      action={
        <a className="btn btn-primary" href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>
          Connect GitHub
        </a>
      }
    />
  )
}
export function AgentsPage() {
  const { data: session, error: sessionError, refetch: refreshSession } = useSession()
  const { data, error, refetch } = useData<Awaited<ReturnType<typeof connectedAgents>>>(
    'agents',
    !!session?.user,
  )
  const drafts = useData<Awaited<ReturnType<typeof listDrafts>>>('agent-submissions', !!session?.user)
  const { run, pending } = useAction()
  const [revoke, setRevoke] = useState<string | null>(null)
  if (sessionError) return <ErrorState error={sessionError} retry={refreshSession} />
  if (!session) return <Loading />
  if (!session.user) return <SignIn returnTo="/agents" />
  return (
    <>
      <PageTitle eyebrow="Your tools, connected" title="Connected agents" />
      <div className="panel max-w-3xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bot size={20} />
          Let your agent prepare your next submission.
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          Add Shipforte as a remote HTTP MCP server in your harness, then complete its browser sign-in. Your
          agent can read your attempts, upload screenshots and transcripts, and prepare a public or private
          submission draft. You always review and approve submission here; private projects can be published
          later.
        </p>
        <p className="mt-4 text-xs font-medium">MCP server URL</p>
        <code className="mt-2 block overflow-x-auto rounded-lg bg-canvas p-3 text-sm">
          {typeof window === 'undefined' ? 'https://shipforte.com' : window.location.origin}/mcp
        </code>
        <p className="mt-3 text-xs text-muted">
          Choose Streamable HTTP with OAuth. Shipforte credentials stay separate from your GitHub credentials.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-accent">
          <a
            href="https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers"
            target="_blank"
            rel="noreferrer"
          >
            Copilot CLI ↗
          </a>
          <a href="https://opencode.ai/v2/docs/mcp-servers" target="_blank" rel="noreferrer">
            OpenCode ↗
          </a>
          <a href="https://code.claude.com/docs/en/mcp" target="_blank" rel="noreferrer">
            Claude Code ↗
          </a>
          <a href="https://developers.openai.com/codex/mcp/" target="_blank" rel="noreferrer">
            Codex ↗
          </a>
          <a href="https://cursor.com/docs/context/mcp" target="_blank" rel="noreferrer">
            Cursor ↗
          </a>
        </div>
      </div>
      <section className="mt-8 max-w-3xl">
        <h2 className="mb-4 text-lg font-semibold">Your connections</h2>
        {error ? (
          <ErrorState error={error} retry={refetch} />
        ) : !data ? (
          <Loading />
        ) : data.length ? (
          <div className="space-y-3">
            {data.map((connection) => {
              const active = connection.active
              return (
                <div key={connection.id} className="panel flex items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{connection.clientName}</p>
                    <p className="mt-1 text-xs text-muted">
                      Connected {date(connection.createdAt)} ·{' '}
                      {connection.revokedAt
                        ? 'Revoked'
                        : active
                          ? `Expires ${date(connection.expiresAt)}`
                          : 'Expired'}
                    </p>
                    <p className="mt-2 break-words text-xs text-muted">{connection.scopes.join(' · ')}</p>
                  </div>
                  {active && (
                    <button
                      className="btn btn-secondary"
                      disabled={pending}
                      onClick={() => setRevoke(connection.id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">No agents connected yet. Add the MCP URL above to get started.</p>
        )}
      </section>
      <section className="mt-8 max-w-3xl">
        <h2 className="mb-4 text-lg font-semibold">Agent submissions</h2>
        {drafts.error ? (
          <ErrorState error={drafts.error} retry={drafts.refetch} />
        ) : !drafts.data ? (
          <Loading />
        ) : drafts.data.length ? (
          <div className="space-y-3">
            {drafts.data.map((draft) => (
              <Link
                key={draft.id}
                to="/agent-submissions/$id"
                params={{ id: draft.id }}
                className="panel flex items-center justify-between gap-4 p-5"
              >
                <div>
                  <p className="font-medium">{draft.input.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {draft.status === 'pending_review'
                      ? 'Awaiting your review'
                      : draft.status.replaceAll('_', ' ')}{' '}
                    · {date(draft.createdAt)}
                  </p>
                </div>
                <ExternalLink size={16} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Prepared submissions will appear here and in your notifications.
          </p>
        )}
      </section>
      <Modal title="Revoke agent access?" open={!!revoke} onClose={() => setRevoke(null)}>
        <p className="mb-5 text-sm leading-6 text-muted">
          This connection’s tokens and upload tickets will stop working. Its pending drafts can no longer be
          submitted.
        </p>
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={async () => {
            if (revoke && (await run(`agents/${revoke}/revoke`, {}, 'Agent access revoked.'))) setRevoke(null)
          }}
        >
          Revoke access
        </button>
      </Modal>
    </>
  )
}
export function AgentSubmissionPage({ id }: { id: string }) {
  const { data: session, error: sessionError, refetch: refreshSession } = useSession()
  const { data, error, refetch } = useData<Awaited<ReturnType<typeof draftDetail>>>(
    `agent-submissions/${id}`,
    !!session?.user,
  )
  const { run, pending } = useAction()
  const navigate = useNavigate()
  const [reviewed, setReviewed] = useState<string | null>(null)
  if (sessionError) return <ErrorState error={sessionError} retry={refreshSession} />
  if (!session) return <Loading />
  if (!session.user) return <SignIn returnTo={`/agent-submissions/${id}`} />
  if (error) return <ErrorState error={error} retry={refetch} />
  if (!data) return <Loading />
  const { draft, attempt, images, transcripts, status } = data
  const visibility = draft.input.visibility ?? 'public'
  const reviewKey = `${draft.id}:${draft.revision}:${draft.commitSha}:${visibility}`
  const active = status.status === 'pending_review'
  return (
    <>
      <Link to="/agents" className="mb-5 inline-block text-xs text-muted">
        ← Connected agents
      </Link>
      <PageTitle eyebrow="Prepared by your agent" title="Review your submission" />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="panel p-6">
            <h2 className="text-2xl font-semibold">{draft.input.title}</h2>
            <div className="mt-4 rounded-lg bg-sage p-4 text-sm">
              <p className="font-semibold">
                {visibility === 'private' ? 'Private — publish later' : 'Public — share on submission'}
              </p>
              <p className="mt-1 text-xs leading-5">
                {visibility === 'private'
                  ? 'Only you can see the submission on Shipforte. Approval saves the snapshot and deadline eligibility; kudos stay withheld until you publish. Your GitHub repository and external links remain public.'
                  : 'Approval makes the submission and its attachments public. It cannot be made private again.'}
              </p>
            </div>
            <p className="prose-copy mt-4">{draft.input.description}</p>
            {draft.input.demoUrl && (
              <a
                className="mt-4 inline-block text-sm text-accent"
                href={draft.input.demoUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open demo ↗
              </a>
            )}
            <dl className="mt-5 space-y-2 border-t border-line pt-5 text-sm">
              <div>
                <dt className="text-xs text-muted">Repository</dt>
                <dd>{draft.repoName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Commit to be submitted</dt>
                <dd>
                  <a
                    href={`https://github.com/${draft.repoName}/tree/${draft.commitSha}`}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-mono text-xs text-accent"
                  >
                    {draft.commitSha} ↗
                  </a>
                </dd>
              </div>
            </dl>
            {active && (
              <button
                className="btn btn-secondary mt-4"
                disabled={pending}
                onClick={async () => {
                  setReviewed(null)
                  await run(
                    `agent-submissions/${id}/refresh`,
                    {},
                    'Commit preview refreshed. Please review it again.',
                  )
                }}
              >
                <RefreshCw size={14} />
                Refresh commit preview
              </button>
            )}
          </section>
          <section className="panel p-6">
            <h2 className="mb-4 font-semibold">Screenshots</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {images.map((image) => (
                <a key={image.id} href={`/api/images/${image.id}`} target="_blank" rel="noreferrer">
                  <img
                    src={`/api/images/${image.id}`}
                    alt={image.name}
                    className="max-h-80 w-full rounded-lg border border-line object-contain"
                  />
                </a>
              ))}
            </div>
          </section>
          {!!attempt.requirements.length && (
            <section className="panel p-6">
              <h2 className="mb-4 font-semibold">Accepted checklist & evidence</h2>
              <EvidenceSummary
                requirements={attempt.requirements}
                evidence={draft.input.evidence ?? []}
                images={images}
              />
            </section>
          )}
          {draft.input.videoUrl && <VideoRecording url={draft.input.videoUrl} />}
          {draft.input.learnings && (
            <section className="panel p-6">
              <h2 className="mb-4 font-semibold">What I learned</h2>
              <Markdown>{draft.input.learnings}</Markdown>
            </section>
          )}
          <section className="panel p-6">
            <h2 className="font-semibold">Build sessions</h2>
            <p className="mt-2 text-sm text-muted">
              These transcripts, links, and reported agent/model/usage details{' '}
              {visibility === 'private'
                ? 'stay private on Shipforte until you publish the submission.'
                : 'will be public when you submit.'}
              Read them before approving. Moderators can hide a transcript if needed.
            </p>
            <div className="mt-4 space-y-3">
              {transcripts.length ? (
                transcripts.map((item) => <TranscriptCard key={item.id} item={item} />)
              ) : (
                <p className="text-sm text-muted">No build sessions attached.</p>
              )}
            </div>
          </section>
          <details className="panel p-6">
            <summary className="cursor-pointer font-semibold">Accepted challenge: {attempt.title}</summary>
            <div className="mt-4">
              <Markdown>{attempt.brief}</Markdown>
            </div>
          </details>
        </div>
        <aside className="panel p-6 xl:sticky xl:top-24">
          <p className="eyebrow">The final step is yours</p>
          <p className="mt-3 flex items-center gap-2 text-sm">
            <Clock3 size={16} />
            Deadline: {date(attempt.deadline)}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted">
            Creating this draft did not submit your project or reserve its deadline. Shipforte records the
            time your approval request arrives. Processing the code snapshot won’t cost you time.
          </p>
          {active ? (
            <form
              className="mt-5 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                if (reviewed !== reviewKey) return
                const result = await run<{ id: string }>(`agent-submissions/${id}/approve`, {
                  revision: draft.revision,
                  commitSha: draft.commitSha,
                })
                if (result) await navigate({ to: '/submissions/$id', params: { id: result.id } })
              }}
            >
              <label className="flex items-start gap-2 text-sm leading-6">
                <input
                  type="checkbox"
                  required
                  checked={reviewed === reviewKey}
                  onChange={(e) => setReviewed(e.target.checked ? reviewKey : null)}
                  className="mt-1.5 accent-accent"
                />
                I reviewed this project, its commit, screenshots, and any build sessions, and approve
                {visibility === 'private'
                  ? ' submitting them privately on Shipforte.'
                  : ' publishing them permanently.'}
              </label>
              <button className="btn btn-primary w-full" disabled={pending || reviewed !== reviewKey}>
                <Check size={16} />
                {pending
                  ? 'Submitting…'
                  : visibility === 'private'
                    ? 'Approve and submit privately'
                    : 'Approve and submit publicly'}
              </button>
              <button
                type="button"
                className="btn btn-secondary w-full"
                disabled={pending}
                onClick={() => run(`agent-submissions/${id}/reject`, {}, 'Draft rejected.')}
              >
                Reject draft
              </button>
              <p className="text-xs leading-5 text-muted">
                Need changes? Reject this draft and ask your agent to prepare a new one. If the default branch
                changed, refresh the commit preview first.
              </p>
            </form>
          ) : (
            <div className="mt-5">
              <p className="text-sm font-medium capitalize">{status.status.replaceAll('_', ' ')}</p>
              {draft.submissionId && (
                <Link
                  to="/submissions/$id"
                  params={{ id: draft.submissionId }}
                  className="btn btn-primary mt-4"
                >
                  View submission →
                </Link>
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  )
}
