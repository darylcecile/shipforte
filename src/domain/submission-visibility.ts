export type SubmissionVisibility = 'public' | 'private'

export function canReadSubmission(
  submission: { userId: string; visibility: SubmissionVisibility },
  viewer: { id: string } | null,
) {
  return submission.visibility === 'public' || viewer?.id === submission.userId
}

export function eligibleKudos(submittedAt: number, deadline: number, amount: number) {
  return submittedAt < deadline ? amount : 0
}

export function releasedKudos(pending: number, kind: string, held: number) {
  return kind === 'redo' ? Math.min(pending, held) : pending
}
