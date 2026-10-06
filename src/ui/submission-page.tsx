import { Link } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Check,
  Clock3,
  Code2,
  GitCommitHorizontal,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { createClientOnlyFn } from '@tanstack/react-start'
import type { submissionDetail } from '../server/queries'
import { useData } from './api'
import { Avatar, date, Empty, ErrorState, Field, Loading, Modal, PageTitle } from './components'
import { useAction, useSession } from './provider'
import { Markdown } from './markdown'
import { SubmissionTranscripts } from './transcripts'
import { SubmissionRequirements } from './submission-requirements'
import { ShareShowcase, ShowcaseEditor, ShowcaseStory } from './showcase'

const CodeReview = lazy(createClientOnlyFn(() => import('./code-review')))
export type SubmissionDetail = Awaited<ReturnType<typeof submissionDetail>>
export type DiscussionComment = SubmissionDetail['comments'][number]
export function SubmissionPage({ id }: { id: string }) {
  const { data, error, refetch } = useData<SubmissionDetail>(`submissions/${id}`)
  const { data: session } = useSession()
  const [tab, setTab] = useState('overview')
  const { run, pending } = useAction()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  if (error) return <ErrorState error={error} retry={refetch} />
  if (!data) return <Loading />
  const { submission: s, attempt, images, timeline } = data
  const voteDisabled = !session?.user || session.user.id === s.userId || s.archived || s.revoked || pending
  const total = s.up + s.down + s.redo
  return (
    <>
      <Link
        to="/challenges/$id"
        params={{ id: s.challengeId }}
        className="mb-6 inline-flex items-center gap-2 text-xs text-muted"
      >
        <ArrowLeft size={14} />
        {s.challengeTitle}
      </Link>
      {s.visibility === 'private' && (
        <section className="mb-6 rounded-xl border border-line bg-sage p-5">
          <h2 className="font-semibold">Private submission · only you can view it</h2>
          <p className="mt-2 text-sm leading-6">
            Your submission time and this exact snapshot are saved.{' '}
            {s.withheldKudos
              ? `Up to ${s.withheldKudos} kudos are withheld until you publish.`
              : 'This submission has no kudos awaiting publication.'}{' '}
            Publishing later won’t change deadline eligibility.
          </p>
          <p className="mt-2 text-xs leading-5 text-muted">
            Your GitHub repository and external demo or transcript links keep their own visibility.
            Publication on Shipforte is permanent.
          </p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => setPublishOpen(true)}>
            Publish submission
          </button>
        </section>
      )}
      {s.archived && (
        <div className="mb-6 rounded-xl border border-line bg-white p-4 text-sm">
          This submission is archived.{' '}
          {s.replacementId && (
            <Link
              className="font-semibold text-accent"
              to="/submissions/$id"
              params={{ id: s.replacementId }}
            >
              View the new submission →
            </Link>
          )}
          <span className="mt-1 block text-xs text-muted">
            Voting is frozen. This snapshot and its feedback remain available.
          </span>
        </div>
      )}
      {s.revoked && (
        <div className="mb-6 rounded-xl border border-orange-200 bg-accent-soft p-4 text-sm text-accent">
          A moderator revoked this submission’s award. See the timeline for the reason.
        </div>
      )}
      <PageTitle
        eyebrow="From the workbench"
        title={s.title}
        action={
          <div className="flex flex-wrap gap-2">
            {session?.user?.id === s.userId && <ShowcaseEditor data={data} />}
            {s.visibility === 'public' && (
              <ShareShowcase
                path={`/submissions/${id}`}
                image={`/api/share/submissions/${id}.png`}
                title={s.title}
              />
            )}
            {s.demoUrl && (
              <a href={s.demoUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                Try the demo <ArrowUpRight size={16} />
              </a>
            )}
            {session?.user?.moderator && s.visibility === 'public' && (
              <button className="btn btn-secondary" onClick={() => setReviewOpen(true)}>
                <ShieldCheck size={16} />
                Review
              </button>
            )}
          </div>
        }
      />
      <div className="mb-8 flex flex-wrap items-center gap-4 text-xs text-muted">
        <Link
          to="/people/$login"
          params={{ login: s.login }}
          className="flex items-center gap-2 font-medium text-ink"
        >
          <Avatar login={s.login} avatar={s.avatar} size="sm" />
          {s.login}
        </Link>
        <span>Submitted {date(s.createdAt)}</span>
        {s.publishedAt && s.publishedAt !== s.createdAt && <span>Published {date(s.publishedAt)}</span>}
        <span className="rounded-md bg-sage px-2 py-1 font-semibold text-green-900">✳ {s.kudos} kudos</span>
        <span className="flex items-center gap-1">
          {s.createdAt < attempt.deadline ? <Check size={14} /> : <Clock3 size={14} />}
          {s.createdAt < attempt.deadline ? 'On time' : 'Late submission'}
        </span>
      </div>
      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_290px]">
        <div className="min-w-0">
          <div className="mb-6 flex gap-6 border-b border-line">
            {[
              ['overview', 'Overview', MessageSquare],
              ['code', 'Code & feedback', Code2],
              ['timeline', 'Timeline', Clock3],
            ].map(([key, label, Icon]) => {
              const TabIcon = Icon as typeof Code2
              return (
                <button
                  key={String(key)}
                  onClick={() => setTab(String(key))}
                  className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium ${tab === key ? 'border-ink' : 'border-transparent text-muted'}`}
                >
                  <TabIcon size={15} />
                  {String(label)}
                </button>
              )
            })}
          </div>
          {tab === 'overview' && (
            <>
              <ScreenshotGallery images={images} />
              <div className="panel mt-5 p-6">
                <h2 className="mb-4 font-semibold">The build</h2>
                <p className="prose-copy">{s.description}</p>
                <details className="mt-6 border-t border-line pt-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    The original challenge brief
                  </summary>
                  <div className="mt-4">
                    <Markdown>{attempt.brief}</Markdown>
                  </div>
                </details>
              </div>
              <SubmissionRequirements data={data} />
              <ShowcaseStory data={data} owner={session?.user?.id === s.userId} />
              <SubmissionTranscripts items={data.transcripts} />
              {s.visibility === 'public' && (
                <section className="mt-8">
                  <h2 className="mb-5 text-xl font-semibold tracking-tight">The conversation</h2>
                  <div className="space-y-4">
                    {data.comments
                      .filter((c) => !c.file && !c.requirementId)
                      .map((c) => (
                        <CommentCard key={c.id} comment={c} />
                      ))}
                  </div>
                  <CommentForm submissionId={id} />
                </section>
              )}
            </>
          )}
          {tab === 'code' && (
            <Suspense fallback={<Loading />}>
              <CodeReview data={data} />
            </Suspense>
          )}
          {tab === 'timeline' && (
            <div className="panel p-6">
              <h2 className="mb-6 font-semibold">Every step of the build</h2>
              {timeline.map((e, i) => (
                <div key={e.id} className="relative flex gap-4 pb-7 last:pb-0">
                  <div className="relative">
                    <span
                      className={`relative z-10 mt-0.5 block h-3 w-3 rounded-full border-2 border-white ${e.kind === 'redo_unlocked' ? 'bg-accent' : 'bg-[#aeb89b]'}`}
                    />
                    {i < timeline.length - 1 && (
                      <span className="absolute top-3 bottom-[-28px] left-[5px] w-px bg-line" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium capitalize text-muted">
                      {e.kind.replaceAll('_', ' ')} · {e.actor}
                    </p>
                    <p className="mt-1 text-sm leading-6">{e.message}</p>
                    <p className="mt-1 text-[11px] text-muted">{date(e.createdAt)}</p>
                    {e.submissionId && e.submissionId !== id && (
                      <Link
                        className="mt-1 inline-block text-xs text-accent"
                        to="/submissions/$id"
                        params={{ id: e.submissionId }}
                      >
                        View this version →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="space-y-5 xl:sticky xl:top-24">
          {s.visibility === 'public' && (
            <div className="panel p-5">
              <p className="eyebrow">What do you think?</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums">
                {s.up - s.down}
                <span className="ml-2 text-xs font-normal text-muted">community score</span>
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'up', label: 'Upvote', icon: ArrowUp, count: s.up },
                    { value: 'down', label: 'Downvote', icon: ArrowDown, count: s.down },
                    { value: 'redo', label: 'Redo', icon: RotateCcw, count: s.redo },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.value}
                    disabled={voteDisabled}
                    aria-pressed={data.myVote === v.value}
                    onClick={() =>
                      run(`submissions/${id}/vote`, { value: data.myVote === v.value ? null : v.value })
                    }
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs disabled:cursor-not-allowed ${data.myVote === v.value ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-canvas'}`}
                  >
                    <v.icon size={17} />
                    <span className="font-semibold tabular-nums">{v.count}</span>
                    <span className="text-[10px]">{v.label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-muted">
                {session?.user?.id === s.userId
                  ? 'Your community votes. You focus on building.'
                  : !session?.user
                    ? 'Connect GitHub to vote and leave feedback.'
                    : 'One vote, your call. Click again to remove it.'}
              </p>
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-xs font-medium">
                  {s.redoUnlocked ? '↻ Redo opportunity unlocked' : 'Room to improve?'}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  {total ? Math.round((s.redo / total) * 100) : 0}% redo · {total}/30 minimum voters. A redo
                  unlocks at 25% with at least 30 voters.
                </p>
              </div>
              {session?.user?.id === s.userId && !s.archived && (s.redoUnlocked || s.moderatorAllowed) && (
                <Link
                  to="/challenges/$id"
                  params={{ id: s.challengeId }}
                  className="btn btn-secondary mt-4 w-full"
                >
                  Review resubmission options
                </Link>
              )}
            </div>
          )}
          <div className="panel p-5">
            <p className="eyebrow mb-4">Saved in time</p>
            <a
              href={`https://github.com/${s.repoName}/tree/${s.commitSha}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2 break-all text-xs font-medium"
            >
              <Code2 size={15} className="shrink-0" />
              {s.repoName}
              <ArrowUpRight size={13} className="shrink-0" />
            </a>
            <p className="mt-3 flex items-center gap-2 font-mono text-xs text-muted">
              <GitCommitHorizontal size={16} />
              {s.commitSha.slice(0, 12)}
            </p>
            <p className="mt-4 text-xs leading-5 text-muted">
              An immutable snapshot. Exactly what was submitted, even if the repository changes.
            </p>
            {s.previousId && (
              <Link
                to="/submissions/$id"
                params={{ id: s.previousId }}
                className="mt-4 inline-block text-xs font-medium text-accent"
              >
                View previous submission →
              </Link>
            )}
          </div>
        </aside>
      </div>
      <ModerationDialog id={id} open={reviewOpen} onClose={() => setReviewOpen(false)} />
      <Modal title="Publish this submission?" open={publishOpen} onClose={() => setPublishOpen(false)}>
        <p className="text-sm leading-6">
          This makes “{s.title}”, its saved code, screenshots, and build sessions visible to everyone. You
          cannot make it private again. Eligible kudos will be released using the original submission time.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-5 w-full"
          disabled={pending}
          onClick={async () => {
            if (
              await run(
                `submissions/${id}/publish`,
                { revision: s.revision, visibility: 'public' },
                'Your submission is now public.',
              )
            )
              setPublishOpen(false)
          }}
        >
          {pending ? 'Publishing…' : 'Publish permanently'}
        </button>
      </Modal>
    </>
  )
}
function ScreenshotGallery({ images }: { images: SubmissionDetail['images'] }) {
  const [selected, setSelected] = useState(0)
  if (!images.length)
    return <Empty title="No screenshots" description="Screenshots are unavailable for this submission." />
  const current = images[selected] || images[0]
  return (
    <div>
      <a
        href={`/api/images/${current.id}`}
        target="_blank"
        rel="noreferrer"
        className="panel block overflow-hidden bg-[#eeefe9]"
      >
        <img
          src={`/api/images/${current.id}`}
          alt={current.name}
          className="max-h-[560px] w-full object-contain"
        />
      </a>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((image, i) => (
            <button
              key={image.id}
              onClick={() => setSelected(i)}
              aria-label={`View screenshot ${i + 1}`}
              aria-pressed={i === selected}
              className={`overflow-hidden rounded-lg border-2 ${i === selected ? 'border-accent' : 'border-transparent'}`}
            >
              <img src={`/api/images/${image.id}`} alt="" className="h-14 w-20 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
export function CommentCard({ comment }: { comment: DiscussionComment }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 font-sans">
      <div className="flex items-center gap-2">
        <Avatar login={comment.login} avatar={comment.avatar} size="sm" />
        <Link to="/people/$login" params={{ login: comment.login }} className="text-xs font-semibold">
          {comment.login}
        </Link>
        <span className="ml-auto text-[10px] text-muted">{date(comment.createdAt)}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{comment.body}</p>
      {comment.file && (
        <p className="mt-2 text-[10px] text-muted">
          {comment.file}
          {comment.line
            ? `:${comment.line}${comment.endLine && comment.endLine !== comment.line ? `–${comment.endLine}` : ''}`
            : ''}{' '}
          · {comment.commitSha?.slice(0, 7)}
        </p>
      )}
    </div>
  )
}
export function CommentForm({
  submissionId,
  file = null,
  line = null,
  endLine = null,
  requirementId = null,
  onDone,
}: {
  submissionId: string
  file?: string | null
  line?: number | null
  endLine?: number | null
  requirementId?: string | null
  onDone?: () => void
}) {
  const { data } = useSession()
  const { run, pending } = useAction()
  const [body, setBody] = useState('')
  if (!data?.user)
    return (
      <p className="mt-5 text-sm text-muted">
        <a href="/api/auth/login" className="font-medium text-accent">
          Connect GitHub
        </a>{' '}
        to join the conversation.
      </p>
    )
  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (
          await run(
            `submissions/${submissionId}/comments`,
            { body, file, line, endLine, requirementId },
            'Feedback posted.',
          )
        ) {
          setBody('')
          onDone?.()
        }
      }}
    >
      <label className="sr-only" htmlFor={`comment-${file || requirementId || 'discussion'}`}>
        Your feedback
      </label>
      <textarea
        id={`comment-${file || requirementId || 'discussion'}`}
        className="field min-h-24"
        placeholder={
          requirementId
            ? 'What works well or could improve for this requirement?'
            : file
              ? 'Leave thoughtful feedback on this code…'
              : 'Ask a question, share an idea, or give a little encouragement…'
        }
        required
        maxLength={5000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex justify-end">
        <button disabled={pending || !body.trim()} className="btn">
          {pending ? 'Posting…' : 'Post feedback'}
        </button>
      </div>
    </form>
  )
}
function ModerationDialog({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const { run, pending } = useAction()
  const [action, setAction] = useState('review')
  return (
    <Modal title="Review this submission" open={open} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          if (
            await run(
              `submissions/${id}/review`,
              { action, reason: f.get('reason'), allowResubmission: f.get('allow') === 'on' },
              'Moderation action recorded.',
            )
          )
            onClose()
        }}
      >
        <Field label="Action">
          <select className="field" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="review">Record a review</option>
            <option value="allow">Allow a new submission (keep kudos)</option>
            <option value="revoke">Revoke this submission’s award</option>
          </select>
        </Field>
        <Field label="Reason" hint="Visible to the author and on the submission timeline.">
          <textarea name="reason" className="field min-h-28" required minLength={3} maxLength={2000} />
        </Field>
        {action === 'revoke' && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="allow" className="mt-1 accent-accent" />
            Also allow a new submission. A valid on-time replacement can earn the full award.
          </label>
        )}
        {action === 'allow' && (
          <p className="text-xs leading-5 text-muted">
            Existing kudos are kept. A valid on-time replacement earns the 20% repeat award, unless the
            previous submission was revoked.
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? 'Saving…' : 'Save moderation decision'}
        </button>
      </form>
    </Modal>
  )
}
