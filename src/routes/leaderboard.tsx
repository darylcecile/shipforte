import { createFileRoute } from '@tanstack/react-router'
import { PeoplePage } from '../ui/community-pages'
export const Route = createFileRoute('/leaderboard')({
  component: () => <PeoplePage leaderboard />,
  ssr: false,
})
