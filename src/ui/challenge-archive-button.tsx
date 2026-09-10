import { Archive, ArchiveRestore } from 'lucide-react'
import type { Challenge } from '../db/schema'
import { isPublishedChallenge } from '../domain/challenge-status'
import { useAction } from './provider'

export function ChallengeArchiveButton({ challenge }: { challenge: Challenge }) {
  const { run, pending } = useAction()
  if (!isPublishedChallenge(challenge.status)) return null
  const archived = challenge.status === 'archived'
  const Icon = archived ? ArchiveRestore : Archive
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={pending}
      aria-label={`${archived ? 'Restore' : 'Archive'} ${challenge.title}`}
      onClick={() =>
        run(
          `challenges/${challenge.id}/archive`,
          { archived: !archived },
          archived
            ? 'Challenge restored to public discovery.'
            : 'Challenge archived. Direct links and existing attempts still work.',
        )
      }
    >
      <Icon size={15} />
      {pending ? 'Saving…' : archived ? 'Restore challenge' : 'Archive challenge'}
    </button>
  )
}
