import { CommentCard, CommentForm, type SubmissionDetail } from './submission-page'
import { EvidenceImages } from './requirements'

export function SubmissionRequirements({ data }: { data: SubmissionDetail }) {
  if (!data.attempt.requirements.length) return null
  return (
    <section className="panel mt-5 p-6">
      <h2 className="font-semibold">How it meets the brief</h2>
      <p className="mt-2 text-xs leading-5 text-muted">
        The checklist accepted for this attempt. Completion is reported by the builder; reviewers can leave
        feedback on each item.
      </p>
      <div className="mt-4 space-y-4">
        {data.attempt.requirements.map((item) => {
          const evidence = data.submission.evidence.find((entry) => entry.requirementId === item.id)
          const discussion = data.comments.filter((comment) => comment.requirementId === item.id)
          return (
            <article
              key={item.id}
              id={`requirement-${item.id}`}
              className="rounded-lg border border-line p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-xs ${evidence?.completed ? 'border-green-700 bg-sage text-green-900' : 'border-line text-muted'}`}
                >
                  {evidence?.completed ? '✓' : '—'}
                </span>
                <div>
                  <h3 className="text-sm font-medium">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {item.kind === 'stretch' ? 'Optional stretch goal' : 'Required'} ·{' '}
                    {evidence
                      ? evidence.completed
                        ? 'Builder marked complete'
                        : 'Builder marked incomplete'
                      : 'Not reported'}
                  </p>
                </div>
              </div>
              {item.details && (
                <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-muted">{item.details}</p>
              )}
              {evidence?.notes && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{evidence.notes}</p>
              )}
              <EvidenceImages ids={evidence?.screenshots ?? []} images={data.images} />
              {data.submission.visibility === 'public' && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-accent">
                    Feedback on this requirement{discussion.length ? ` (${discussion.length})` : ''}
                  </summary>
                  <div className="mt-4 space-y-3">
                    {discussion.map((comment) => (
                      <CommentCard key={comment.id} comment={comment} />
                    ))}
                  </div>
                  <CommentForm submissionId={data.submission.id} requirementId={item.id} />
                </details>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
