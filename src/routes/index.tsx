import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '../ui/dashboard'
export const Route = createFileRoute('/')({ component: Dashboard, ssr: false })
