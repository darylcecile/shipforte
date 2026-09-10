import { createFileRoute } from '@tanstack/react-router'
import '@tanstack/react-start'
import { handle } from '../server/api'

export const Route = createFileRoute('/api/$')({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
})
