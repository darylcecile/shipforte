import { createFileRoute } from '@tanstack/react-router'
import { ChallengeEditor } from '../ui/challenge-editor'
export const Route = createFileRoute('/challenges/$id_/edit')({
  component: () => <ChallengeEditor id={Route.useParams().id} />,
  ssr: false,
})
