import { createFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '../ui/community-pages'
export const Route = createFileRoute('/people_/$login')({
  component: () => <ProfilePage login={Route.useParams().login} />,
  ssr: false,
})
