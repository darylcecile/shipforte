import { HeadContent, Scripts, createRootRoute, Outlet } from '@tanstack/react-router'
import { Providers } from '../ui/provider'
import { Shell } from '../ui/shell'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Shipforte — Less someday. More shipped.' },
      {
        name: 'description',
        content:
          'Pick a challenge. Build something real. Share your work and grow alongside a community of makers.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  component: () => (
    <Providers>
      <Shell>
        <Outlet />
      </Shell>
    </Providers>
  ),
  notFoundComponent: () => (
    <div className="py-24 text-center">
      <h1 className="text-3xl font-bold">Nothing here. Yet.</h1>
      <p className="mt-3 text-muted">This page may have moved.</p>
      <a className="btn mt-6" href="/">
        Explore challenges
      </a>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div role="alert" className="p-12">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-3">{error instanceof Error ? error.message : 'Please try again.'}</p>
      <button className="btn mt-5" onClick={reset}>
        Try again
      </button>
    </div>
  ),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
