import { createFileRoute } from '@tanstack/react-router'
import { AgentSubmissionPage } from '../ui/agent-pages'
export const Route = createFileRoute('/agent-submissions/$id')({ component: Page, ssr: false })
function Page() {
  const { id } = Route.useParams()
  return <AgentSubmissionPage id={id} />
}
