import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpRight, Clock3, Copy, Github, Pencil, Plus, Trophy, UserPlus } from 'lucide-react'
import { useState } from 'react'
import type { challengeDetail, people } from '../server/queries'
import { repeatAward } from '../domain/rules'
import { useData } from './api'
import {
  Avatar,
  Countdown,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageTitle,
  SubmissionCard,
  TierBadge,
} from './components'
import { useAction, useSession } from './provider'
import { SubmissionForm } from './submission-form'
import { Markdown } from './markdown'
import { ChallengeArchiveButton } from './challenge-archive-button'
import { canEditChallenge } from '../domain/challenge-status'
import { RequirementsList } from './requirements'

export type ChallengeDetail = Awaited<ReturnType<typeof challengeDetail>>
export function ChallengePage({ id }: { id: string }) {
  const { data, error, refetch } = useData<ChallengeDetail>(`challenges/${id}`)
  const { data: session } = useSession()
  const [tab, setTab] = useState('brief')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [startKind, setStartKind] = useState<'initial' | 'repeat' | 'redo' | 'moderator' | null>(null)
  const { run, pending, toast } = useAction()
  if (error) return <ErrorState error={error} retry={refetch} />
  if (!data) return <Loading />
  const { challenge, attempts, leaderboard } = data
  const active = attempts.find((a) => !a.submittedAt)
  const privateSubmission = data.privateSubmissions[0]
  const brief = active?.brief || challenge.brief
  const previous = data.submissions.find((s) => s.userId === session?.user?.id)
  const canEdit = session?.user ? canEditChallenge(challenge, session.user) : false
  async function copyBrief() {
    try {
      const checklist = active?.requirements ?? challenge.requirements
      const text = checklist.length
        ? `${brief}\n\n## Checklist\n\n${checklist.map((item) => `- [ ] ${item.title}${item.kind === 'stretch' ? ' (optional stretch goal)' : ''}${item.details ? `\n  ${item.details}` : ''}`).join('\n')}`
        : brief
      await navigator.clipboard.writeText(text)
      toast('Challenge brief copied.')
    } catch {
      toast('Couldn’t access the clipboard. Select the brief and copy it manually.', true)
    }
  }
  async function accept() {
    const result = await run(
      `challenges/${id}/accept`,
      { kind: startKind },
      'Your countdown has started. Happy building!',
    )
    if (result) setStartKind(null)
  }
  return (
    <>
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-xs text-muted hover:text-ink">
        <ArrowLeft size={14} />
        All challenges
      </Link>
      <PageTitle
        eyebrow={challenge.category}
        title={challenge.title}
        description={challenge.summary}
        action={
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Link to="/challenges/$id/edit" params={{ id }} className="btn btn-secondary">
                <Pencil size={15} />
                Edit
              </Link>
            )}
            {session?.user && challenge.status === 'live' && (
              <button className="btn btn-secondary" onClick={() => setInviteOpen(true)}>
                <UserPlus size={16} />
                Invite a builder
              </button>
            )}
            {session?.user?.moderator && <ChallengeArchiveButton challenge={challenge} />}
          </div>
        }
      />
      {challenge.status === 'archived' && (
        <div className="mb-6 rounded-xl border border-line bg-white p-4 text-sm">
          <strong>Archived challenge</strong>
          <p className="mt-1 text-muted">
            This challenge is unlisted and closed to new attempts and invitations. Direct links still work,
            and existing builders can finish with their original deadline and award.
          </p>
        </div>
      )}
      {challenge.status !== 'live' && challenge.status !== 'archived' && (
        <div className="mb-6 rounded-xl border border-orange-200 bg-accent-soft p-4 text-sm">
          <strong className="capitalize">{challenge.status.replace('_', ' ')}</strong>
          <p className="mt-1">
            {challenge.feedback || 'A moderator will review this challenge before it goes live.'}
          </p>
        </div>
      )}
      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div>
          {privateSubmission && (
            <div className="panel mb-6 p-5">
              <p className="text-sm font-semibold">Your private submission is saved.</p>
              <p className="mt-2 text-xs leading-5 text-muted">
                Only you can see it. Publish when you’re ready to share and release eligible kudos.
              </p>
              <Link
                to="/submissions/$id"
                params={{ id: privateSubmission.id }}
                className="btn btn-secondary mt-3"
              >
                Review & publish
              </Link>
            </div>
          )}
          <div className="mb-6 flex gap-6 border-b border-line">
            {[
              ['brief', 'The brief'],
              ['submissions', `Submissions (${data.submissions.length})`],
              ['leaderboard', 'Leaderboard'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`border-b-2 pb-3 text-sm font-medium ${tab === key ? 'border-ink' : 'border-transparent text-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'brief' && (
            <div className="panel relative p-6 sm:p-8">
              <p className="eyebrow mb-5 pr-14">What you’re building</p>
              <button
                type="button"
                onClick={copyBrief}
                aria-label="Copy challenge brief"
                title="Copy brief as Markdown"
                className="absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-canvas hover:text-ink"
              >
                <Copy size={14} aria-hidden="true" />
                Copy
              </button>
              <Markdown>{brief}</Markdown>
              <RequirementsList items={active?.requirements ?? challenge.requirements} />
              {active && active.brief !== challenge.brief && (
                <p className="mt-5 text-xs text-muted">
                  Showing the original brief you accepted. Your deadline and award are preserved.
                </p>
              )}
              <div className="mt-8 border-t border-line pt-5 text-xs leading-6 text-muted">
                Build with or without AI. Submit a public GitHub repository with screenshots of your working
                output. We’ll save the latest commit on its default branch for the community to review.
              </div>
            </div>
          )}
          {tab === 'submissions' &&
            (data.submissions.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {data.submissions.map((s) => (
                  <div key={s.id}>
                    {s.archived && <p className="mb-2 text-xs text-muted">Archived version</p>}
                    <SubmissionCard item={s} />
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="The first spot is open."
                description="Take on the challenge and give the community something to talk about."
              />
            ))}
          {tab === 'leaderboard' && (
            <div className="panel overflow-hidden">
              {leaderboard.length ? (
                leaderboard.map((s) => (
                  <Link
                    key={s.id}
                    to="/submissions/$id"
                    params={{ id: s.id }}
                    className="flex items-center gap-4 border-b border-line p-5 last:border-0 hover:bg-canvas"
                  >
                    <span className="w-7 text-lg font-medium tabular-nums text-muted">{s.rank}</span>
                    <Avatar login={s.login} avatar={s.avatar} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">{s.title}</h3>
                      <p className="text-xs text-muted">{s.login}</p>
                    </div>
                    <span className="text-lg font-semibold tabular-nums">
                      {s.up - s.down}
                      <span className="ml-1 text-xs font-normal text-muted">score</span>
                    </span>
                  </Link>
                ))
              ) : (
                <Empty
                  title="A leaderboard waiting to happen."
                  description="Active submissions will be ranked by upvotes minus downvotes. Tied scores share a rank."
                />
              )}
            </div>
          )}
          {active && (
            <section id="submit" className="mt-8 scroll-mt-24">
              <SubmissionForm attempt={active} />
            </section>
          )}
        </div>
        <aside className="space-y-5 xl:sticky xl:top-24">
          <div className="panel p-6">
            <div className="flex items-center justify-between">
              <TierBadge tier={active?.tier || challenge.tier} />
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Clock3 size={14} />
                {active?.days || challenge.days} days
              </span>
            </div>
            <div className="my-6">
              <span className="text-4xl font-semibold tracking-tight">{active?.award ?? data.fullAward}</span>
              <span className="ml-2 text-sm text-muted">
                {challenge.status === 'archived' && !active ? 'original kudos award' : 'kudos up for grabs'}
              </span>
            </div>
            {active ? (
              <>
                <Countdown deadline={active.deadline} startedAt={active.startedAt} />
                <a href="#submit" className="btn btn-primary mt-5 w-full">
                  Submit your build <ArrowUpRight size={16} />
                </a>
                <p className="mt-3 text-xs leading-5 text-muted">
                  Late? You can still share your work, just without kudos.
                </p>
              </>
            ) : privateSubmission ? (
              <Link
                to="/submissions/$id"
                params={{ id: privateSubmission.id }}
                className="btn btn-primary w-full"
              >
                View private submission
              </Link>
            ) : challenge.status === 'archived' ? (
              <p className="text-sm leading-6 text-muted">
                This challenge is archived and closed to new attempts.
              </p>
            ) : session?.user ? (
              <div className="space-y-2">
                {challenge.status === 'live' && (
                  <>
                    <button
                      disabled={pending}
                      className="btn btn-primary w-full"
                      onClick={() => setStartKind(previous ? 'repeat' : 'initial')}
                    >
                      {previous ? 'Build again with a new repo' : 'Take on this challenge'} <Plus size={16} />
                    </button>
                    {previous?.redoUnlocked && !previous.revoked && (
                      <button className="btn btn-secondary w-full" onClick={() => setStartKind('redo')}>
                        Start an unlocked redo
                      </button>
                    )}
                    {previous?.moderatorAllowed && (
                      <button className="btn btn-secondary w-full" onClick={() => setStartKind('moderator')}>
                        Start approved resubmission
                      </button>
                    )}
                    {previous && (
                      <p className="text-xs leading-5 text-muted">
                        New-repository repeats earn {repeatAward(data.fullAward)} kudos. Forks and copies
                        count as reuse.
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <a href="/api/auth/login" className="btn btn-primary w-full">
                <Github size={16} />
                Connect GitHub to build
              </a>
            )}
          </div>
          <div className="px-2 text-xs leading-6 text-muted">
            <p className="flex items-center gap-2 font-medium text-ink">
              <Trophy size={15} />A little friendly competition
            </p>
            <p className="mt-2">
              Kudos reward finishing. Votes celebrate the implementation. Your community helps you make it
              better.
            </p>
            <p className="mt-4">
              Challenge by{' '}
              <Link to="/people/$login" params={{ login: challenge.author }} className="font-medium text-ink">
                @{challenge.author}
              </Link>
            </p>
          </div>
        </aside>
      </div>
      <Modal
        open={!!startKind}
        onClose={() => setStartKind(null)}
        title={startKind === 'redo' ? 'A fresh start has real stakes.' : 'Ready to make it real?'}
      >
        <div className="space-y-4 text-sm leading-6 text-muted">
          <p>
            Starting this attempt begins a fresh{' '}
            <strong className="text-ink">{challenge.days}-day countdown</strong>. You cannot abandon or reset
            it.
          </p>
          {startKind === 'redo' ? (
            <div className="rounded-lg border border-orange-200 bg-accent-soft p-4 text-ink">
              <strong>{data.redoKudos} earned kudos will be removed.</strong>
              <p className="mt-2">
                Only a new valid submission strictly before the new deadline restores them. If you miss the
                deadline, those kudos stay lost.
              </p>
            </div>
          ) : (
            <p>
              Submit a working project with screenshots strictly before the deadline to earn{' '}
              {startKind === 'repeat' || (startKind === 'moderator' && !previous?.revoked)
                ? repeatAward(data.fullAward)
                : data.fullAward}{' '}
              kudos.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn btn-secondary" onClick={() => setStartKind(null)}>
              Not yet
            </button>
            <button className="btn btn-primary" disabled={pending} onClick={accept}>
              {pending ? 'Starting…' : 'Start my countdown'}
            </button>
          </div>
        </div>
      </Modal>
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} challengeId={id} />
    </>
  )
}
function InviteDialog({
  open,
  onClose,
  challengeId,
}: {
  open: boolean
  onClose: () => void
  challengeId: string
}) {
  const { data, error } = useData<Awaited<ReturnType<typeof people>>>('people?following=1', open)
  const { run, pending } = useAction()
  const [recipientId, setRecipientId] = useState('')
  const following = data?.filter((p) => p.following) || []
  return (
    <Modal open={open} onClose={onClose} title="Better with a little company.">
      {error ? (
        <ErrorState error={error} />
      ) : !data ? (
        <Loading />
      ) : following.length ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(`challenges/${challengeId}/invite`, { recipientId }, 'Invitation sent.')) onClose()
          }}
          className="space-y-5"
        >
          <Field label="Invite someone you follow">
            <select
              required
              className="field"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
            >
              <option value="">Choose a builder</option>
              {following.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name} (@{p.login})
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs leading-5 text-muted">
            They’ll receive an invitation in their notifications. Their timer starts only when they take the
            challenge.
          </p>
          <button disabled={pending} className="btn btn-primary w-full">
            {pending ? 'Sending…' : 'Send invitation'}
          </button>
        </form>
      ) : (
        <Empty
          title="Find your people first."
          description="Follow a few builders in the community, then invite them to a challenge."
          action={
            <Link to="/people" onClick={onClose} className="btn btn-secondary">
              Explore the community
            </Link>
          }
        />
      )}
    </Modal>
  )
}
