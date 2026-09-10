export const challengeStatuses = ['pending', 'changes_requested', 'rejected', 'live', 'archived'] as const
export type ChallengeStatus = (typeof challengeStatuses)[number]

interface ChallengeAccess {
  status: ChallengeStatus
  authorId: string
}
interface Viewer {
  id: string
  moderator: boolean
}

export function isPublishedChallenge(status: ChallengeStatus) {
  return status === 'live' || status === 'archived'
}

export function canReadChallenge(challenge: ChallengeAccess, viewer: Viewer | null | undefined) {
  return (
    isPublishedChallenge(challenge.status) || viewer?.id === challenge.authorId || Boolean(viewer?.moderator)
  )
}

export function canEditChallenge(challenge: ChallengeAccess, viewer: Viewer) {
  return viewer.moderator || (viewer.id === challenge.authorId && !isPublishedChallenge(challenge.status))
}

export function editedChallengeStatus(status: ChallengeStatus): ChallengeStatus {
  return isPublishedChallenge(status) ? status : 'pending'
}
