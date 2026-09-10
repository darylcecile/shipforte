import { createFileRoute } from '@tanstack/react-router'
import { ProposalsPage } from '../ui/challenge-editor'
export const Route = createFileRoute('/proposals')({ component: ProposalsPage, ssr: false })
