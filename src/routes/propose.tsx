import { createFileRoute } from '@tanstack/react-router'
import { ChallengeEditor } from '../ui/challenge-editor'
export const Route = createFileRoute('/propose')({ component: ChallengeEditor, ssr: false })
