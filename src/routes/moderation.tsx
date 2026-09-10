import { createFileRoute } from '@tanstack/react-router'
import { ModerationPage } from '../ui/challenge-editor'
export const Route = createFileRoute('/moderation')({ component: ModerationPage, ssr: false })
