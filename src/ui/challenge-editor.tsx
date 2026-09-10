import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { categories, tiers, type Tier } from '../domain/rules'
import type { Challenge } from '../db/schema'
import type { moderation, proposals } from '../server/queries'
import { useData } from './api'
import {
  date,
  Empty,
  ErrorState,
  Field,
  Loading,
  LoginPrompt,
  Modal,
  PageTitle,
  TierBadge,
} from './components'
import { useAction, useSession } from './provider'
import type { ChallengeDetail } from './challenge-page'
import { Markdown } from './markdown'
import { ChallengeArchiveButton } from './challenge-archive-button'
import { canEditChallenge, isPublishedChallenge } from '../domain/challenge-status'

export function ChallengeEditor({ id }: { id?: string }) {
  const { data: session } = useSession()
  const { data, error } = useData<ChallengeDetail>(`challenges/${id}`, !!id)
  if (!session) return <Loading />
  if (!session.user) return <LoginPrompt />
  if (error) return <ErrorState error={error} />
  if (id && !data) return <Loading />
  const previous = data?.challenge
  if (previous && !canEditChallenge(previous, session.user))
    return (
      <Empty
        title="This challenge is in the community’s hands."
        description="Only moderators can edit published or archived challenges."
      />
    )
  return (
    <>
      <PageTitle
        eyebrow="A good idea deserves company"
        title={id ? 'Fine-tune the challenge.' : 'What should we build next?'}
        description="Give builders a clear brief, a little constraint, and room to make it their own."
      />
      <EditorForm key={id || 'new'} challenge={previous} />
    </>
  )
}
function EditorForm({ challenge }: { challenge?: Challenge }) {
  const [tier, setTier] = useState<Tier>(challenge?.tier || 'small')
  const [brief, setBrief] = useState(challenge?.brief || '')
  const [previewOpen, setPreviewOpen] = useState(false)
  const { run, pending } = useAction()
  const navigate = useNavigate()
  return (
    <form
      className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_300px]"
      onSubmit={async (e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const result = await run<{ id: string }>(
          challenge ? `challenges/${challenge.id}/edit` : 'challenges',
          {
            title: f.get('title'),
            summary: f.get('summary'),
            brief: f.get('brief'),
            days: Number(f.get('days')),
            category: f.get('category'),
            tier,
          },
          challenge && isPublishedChallenge(challenge.status)
            ? 'Challenge updated. Existing attempts keep their original terms.'
            : 'Challenge sent for moderator review.',
        )
        if (result) await navigate({ to: '/challenges/$id', params: { id: result.id } })
      }}
    >
      <div className="panel space-y-6 p-6 sm:p-8">
        <Field label="Challenge title">
          <input
            className="field"
            name="title"
            defaultValue={challenge?.title}
            required
            minLength={5}
            maxLength={120}
            placeholder="Build a tiny habit tracker"
          />
        </Field>
        <Field label="The short version" hint="A concise invitation that appears on the challenge card.">
          <textarea
            className="field min-h-20"
            name="summary"
            defaultValue={challenge?.summary}
            required
            minLength={20}
            maxLength={250}
            placeholder="Help someone build a small daily habit, one satisfying checkmark at a time."
          />
        </Field>
        <Field
          label="The brief"
          hint="Supports GitHub-flavoured Markdown: headings, lists, links, code blocks, tables, and task lists."
        >
          <textarea
            className="field min-h-80"
            name="brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            required
            minLength={50}
            maxLength={20000}
            placeholder={
              '## The idea\n\nWhat should people build?\n\n## Requirements\n\n- [ ] First requirement\n- [ ] Second requirement\n\n## What makes a great submission?'
            }
          />
        </Field>
        <details
          className="rounded-lg border border-line p-4"
          onToggle={(e) => setPreviewOpen(e.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-medium">Preview formatting</summary>
          {previewOpen && (
            <div className="mt-4">
              {brief.trim() ? (
                <Markdown>{brief}</Markdown>
              ) : (
                <p className="text-sm text-muted">Write your brief above to preview it here.</p>
              )}
            </div>
          )}
        </details>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category">
            <select className="field" name="category" defaultValue={challenge?.category || 'Tools'}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Time to build (days)">
            <input
              className="field"
              name="days"
              type="number"
              min={1}
              max={365}
              defaultValue={challenge?.days || 7}
              required
            />
          </Field>
        </div>
      </div>
      <aside className="panel p-6">
        <p className="eyebrow mb-3">Give it a size</p>
        <p className="mb-5 text-xs leading-5 text-muted">
          Choose the scope, not the difficulty. A small, beautifully finished project is a great project.
        </p>
        <fieldset className="space-y-2">
          <legend className="sr-only">Challenge sizing tier</legend>
          {Object.entries(tiers).map(([key, amount]) => (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${key === tier ? 'border-accent bg-accent-soft' : 'border-line'}`}
            >
              <input
                type="radio"
                name="tier"
                value={key}
                checked={tier === key}
                onChange={() => setTier(key as Tier)}
                className="accent-accent"
              />
              <span className="flex-1 text-sm font-medium capitalize">
                {key === 'xlarge' ? 'Extra large' : key}
              </span>
              <span className="text-xs text-muted">{amount} kudos</span>
            </label>
          ))}
        </fieldset>
        <p className="mt-5 text-xs leading-5 text-muted">
          {challenge?.status === 'archived'
            ? 'Changes will be saved without relisting this challenge. Existing attempts retain their original terms.'
            : challenge?.status === 'live'
              ? 'Changes apply to new attempts. Existing builders retain their original brief, deadline, and award.'
              : 'A moderator will review your proposal. You can keep editing until it’s approved. Once live, only moderators can update it.'}
        </p>
        <button disabled={pending} className="btn btn-primary mt-6 w-full">
          {pending
            ? 'Saving…'
            : challenge?.status === 'archived'
              ? 'Save changes'
              : challenge?.status === 'live'
                ? 'Publish update'
                : 'Send for review'}
          <ArrowUpRight size={15} />
        </button>
      </aside>
    </form>
  )
}
export function ProposalsPage() {
  const { data: session } = useSession()
  const { data, error } = useData<Awaited<ReturnType<typeof proposals>>>('proposals', !!session?.user)
  if (!session) return <Loading />
  if (!session.user) return <LoginPrompt />
  if (error) return <ErrorState error={error} />
  return (
    <>
      <PageTitle
        eyebrow="Ideas worth sharing"
        title="Your challenge proposals."
        description="From a spark of an idea to the community’s next build."
        action={
          <Link to="/propose" className="btn btn-primary">
            <Plus size={16} />
            New challenge
          </Link>
        }
      />
      {!data ? (
        <Loading />
      ) : data.length ? (
        <div className="space-y-3">
          {data.map((c) => (
            <Link
              key={c.id}
              to="/challenges/$id"
              params={{ id: c.id }}
              className="panel flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div>
                <span className="text-[10px] font-medium uppercase text-muted">
                  {c.status.replace('_', ' ')}
                </span>
                <h2 className="mt-1 font-semibold">{c.title}</h2>
                {c.feedback && <p className="mt-2 text-xs text-muted">{c.feedback}</p>}
              </div>
              <TierBadge tier={c.tier} />
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="What’s that idea you keep coming back to?"
          description="Turn it into a challenge and see what the community makes of it."
          action={
            <Link to="/propose" className="btn">
              Propose a challenge
            </Link>
          }
        />
      )}
    </>
  )
}
export function ModerationPage() {
  const { data: session } = useSession()
  const { data, error, refetch } = useData<Awaited<ReturnType<typeof moderation>>>(
    'moderation',
    !!session?.user?.moderator,
  )
  const [review, setReview] = useState<Challenge | null>(null)
  const [tab, setTab] = useState('pending')
  if (!session) return <Loading />
  if (!session.user?.moderator)
    return <Empty title="Moderator workspace" description="This area is available to platform moderators." />
  if (error) return <ErrorState error={error} retry={refetch} />
  if (!data) return <Loading />
  const list = data.challenges.filter((c) => tab === 'all' || c.status === tab)
  return (
    <>
      <PageTitle
        eyebrow="Keep the workbench welcoming"
        title="The moderator’s desk."
        description="Review ideas, recognize good work, and keep the briefs meaningful."
      />
      <div className="mb-6 flex gap-5 overflow-x-auto border-b border-line">
        {[
          ['pending', 'Awaiting review'],
          ['all', 'All challenges'],
          ['archived', 'Archived'],
          ['submissions', 'Submissions'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`shrink-0 border-b-2 pb-3 text-sm ${key === tab ? 'border-ink font-semibold' : 'border-transparent text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'submissions' ? (
        <div className="space-y-3">
          {data.submissions.map((s) => (
            <Link
              key={s.id}
              to="/submissions/$id"
              params={{ id: s.id }}
              className="panel flex items-center justify-between gap-4 p-5"
            >
              <div>
                <h2 className="font-semibold">{s.title}</h2>
                <p className="mt-1 text-xs text-muted">
                  {s.login} · {s.challengeTitle} ·{' '}
                  {s.revoked ? 'Revoked' : s.archived ? 'Archived' : 'Active'}
                </p>
              </div>
              <span className="text-xs text-muted">Review →</span>
            </Link>
          ))}
        </div>
      ) : list.length ? (
        <div className="space-y-4">
          {list.map((c) => (
            <div key={c.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link to="/challenges/$id" params={{ id: c.id }} className="text-lg font-semibold">
                    {c.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted">
                    {c.status.replace('_', ' ')} · {date(c.updatedAt)}
                  </p>
                </div>
                <TierBadge tier={c.tier} />
              </div>
              <p className="mt-3 text-sm text-muted">{c.summary}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/challenges/$id" params={{ id: c.id }} className="btn btn-secondary">
                  Read brief
                </Link>
                {isPublishedChallenge(c.status) ? (
                  <Link to="/challenges/$id/edit" params={{ id: c.id }} className="btn">
                    Edit challenge
                  </Link>
                ) : (
                  <button className="btn" onClick={() => setReview(c)}>
                    Review proposal
                  </button>
                )}
                <ChallengeArchiveButton challenge={c} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title={tab === 'archived' ? 'No archived challenges.' : 'The review queue is clear.'}
          description={
            tab === 'archived'
              ? 'Unlisted challenges will appear here. Restore one to reopen it to new builders.'
              : 'New community proposals will appear here.'
          }
        />
      )}
      <ChallengeReviewDialog challenge={review} onClose={() => setReview(null)} />
    </>
  )
}
function ChallengeReviewDialog({ challenge, onClose }: { challenge: Challenge | null; onClose: () => void }) {
  const { run, pending } = useAction()
  const [status, setStatus] = useState('live')
  return (
    <Modal open={!!challenge} onClose={onClose} title="Give this idea its next step.">
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          if (
            await run(
              `challenges/${challenge?.id}/review`,
              { status, reason: f.get('reason') },
              'Review saved.',
            )
          )
            onClose()
        }}
      >
        <Field label="Decision">
          <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="live">Approve and publish</option>
            <option value="changes_requested">Request changes</option>
            <option value="rejected">Reject proposal</option>
          </select>
        </Field>
        <Field label="Feedback for the author">
          <textarea className="field min-h-28" name="reason" required={status !== 'live'} maxLength={2000} />
        </Field>
        <button disabled={pending} className="btn btn-primary w-full">
          {pending ? 'Saving…' : 'Save decision'}
        </button>
      </form>
    </Modal>
  )
}
