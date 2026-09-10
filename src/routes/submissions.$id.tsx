import { createFileRoute } from '@tanstack/react-router'
import { SubmissionPage } from '../ui/submission-page'
export const Route = createFileRoute('/submissions/$id')({
  component: () => <SubmissionPage id={Route.useParams().id} />,
  ssr: false,
})
