import { createFileRoute } from '@tanstack/react-router'
import { Builds } from '../ui/dashboard'
export const Route = createFileRoute('/builds')({ component: Builds, ssr: false })
