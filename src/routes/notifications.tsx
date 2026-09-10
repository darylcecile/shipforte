import { createFileRoute } from '@tanstack/react-router'
import { NotificationsPage } from '../ui/community-pages'
export const Route = createFileRoute('/notifications')({ component: NotificationsPage, ssr: false })
