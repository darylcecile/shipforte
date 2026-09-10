import { createFileRoute } from '@tanstack/react-router'
import { ChallengePage } from '../ui/challenge-page'
export const Route = createFileRoute('/challenges/$id')({
  component: () => <ChallengePage id={Route.useParams().id} />,
  ssr: false,
})
