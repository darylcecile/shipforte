import { createFileRoute } from '@tanstack/react-router'
import { AgentsPage } from '../ui/agent-pages'
export const Route = createFileRoute('/agents')({ component: AgentsPage, ssr: false })
