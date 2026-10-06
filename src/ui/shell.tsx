import { Link, useRouterState } from '@tanstack/react-router'
import {
  Bell,
  Bot,
  Compass,
  Github,
  Hammer,
  LogOut,
  Plus,
  ShieldCheck,
  Trophy,
  Users,
  ArrowUpRight,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from './components'
import { useAction, useSession } from './provider'

export function Shell({ children }: { children: ReactNode }) {
  const { data } = useSession()
  const { run } = useAction()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const links = [
    { to: '/', label: 'Discover', icon: Compass },
    { to: '/builds', label: 'My builds', icon: Hammer },
    { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { to: '/people', label: 'Community', icon: Users },
    { to: '/notifications', label: 'Notifications', icon: Bell },
    { to: '/agents', label: 'Connected agents', icon: Bot },
  ]
  return (
    <div className="min-h-dvh lg:pl-60">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:p-3"
      >
        Skip to content
      </a>
      <aside
        aria-label="Workspace navigation"
        className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r border-line bg-[#fcfcfa] px-2.5 py-5 lg:flex"
      >
        <Link to="/" className="mb-10 flex items-center gap-2.5 px-2">
          <img src="/favicon.svg" className="h-8 w-8" alt="" />
          <span className="text-[23px] font-bold tracking-[-.055em]">
            shipforte<span className="text-accent">.</span>
          </span>
        </Link>
        <p className="eyebrow mb-3 px-3 text-[10px]">Your workspace</p>
        <nav className="space-y-1">
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${path === to ? 'bg-[#eeefe8] text-ink' : 'text-muted hover:bg-[#f2f3ec] hover:text-ink'}`}
            >
              <Icon size={18} strokeWidth={1.7} />
              {label}
              {to === '/notifications' && !!data?.unread && (
                <span className="ml-auto rounded bg-accent px-1.5 text-[10px] text-white">{data.unread}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="my-6 border-t border-line" />
        <Link
          to="/propose"
          className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted hover:text-ink"
        >
          <Plus size={18} />
          Propose a challenge
        </Link>
        <Link to="/proposals" className="mt-1 px-3 py-2 text-sm text-muted hover:text-ink">
          My proposals
        </Link>
        {data?.user?.moderator && (
          <Link to="/moderation" className="mt-1 flex items-center gap-3 px-3 py-2 text-sm text-muted">
            <ShieldCheck size={18} />
            Moderation
          </Link>
        )}
        <div className="mt-auto rounded-xl border border-line bg-white p-4">
          <span className="text-lg">↗</span>
          <h3 className="mt-2 text-sm font-semibold">Small steps. Real projects.</h3>
          <p className="mt-2 text-xs leading-5 text-muted">
            A little momentum goes a long way. Your next idea is waiting.
          </p>
          <Link to="/" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent">
            Find your next build <ArrowUpRight size={13} />
          </Link>
        </div>
        <p className="mt-5 px-2 text-[10px] text-muted">Built for the joy of building.</p>
      </aside>
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-4 border-b border-line bg-canvas/95 px-5 backdrop-blur-sm sm:px-9">
        <Link to="/" className="flex items-center gap-2 lg:hidden">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="text-xl font-bold tracking-tight">shipforte.</span>
        </Link>
        <span className="hidden text-xs text-muted lg:block">A place for ideas to become real.</span>
        <div className="ml-auto flex items-center gap-3">
          {data?.user ? (
            <>
              <span className="hidden items-center gap-1.5 rounded-md bg-sage px-2.5 py-1.5 text-xs font-semibold sm:flex">
                <span className="text-green-700">✳</span>
                {data.user.kudos} kudos
              </span>
              <Link
                to="/notifications"
                aria-label={`Notifications, ${data.unread} unread`}
                className="relative p-2 text-muted hover:text-ink"
              >
                <Bell size={18} />
                {!!data.unread && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />}
              </Link>
              <Link to="/people/$login" params={{ login: data.user.login }}>
                <Avatar login={data.user.login} avatar={data.user.avatar} />
              </Link>
              <button
                aria-label="Sign out"
                className="p-1 text-muted hover:text-ink"
                onClick={() => run('auth/logout', {})}
              >
                <LogOut size={15} />
              </button>
            </>
          ) : (
            <a href="/api/auth/login" className="btn btn-secondary">
              <Github size={16} />
              Connect GitHub
            </a>
          )}
        </div>
      </header>
      <nav
        aria-label="Mobile navigation"
        className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 lg:hidden"
      >
        {links.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs ${path === to ? 'bg-white font-semibold' : 'text-muted'}`}
          >
            <Icon size={14} />
            {label}
          </Link>
        ))}
        {data?.user?.moderator && (
          <Link to="/moderation" className="px-3 py-2 text-xs">
            Moderation
          </Link>
        )}
      </nav>
      <main id="main" className="mx-auto max-w-[1440px] px-5 py-8 sm:px-9 sm:py-10">
        {children}
      </main>
      <footer className="mx-5 flex flex-wrap justify-between gap-3 border-t border-line py-6 text-[11px] text-muted sm:mx-9">
        <span>Shipforte · Make time to make something.</span>
        <div className="flex gap-5">
          <Link to="/propose">Suggest a challenge</Link>
          <a href="https://github.com" target="_blank" rel="noreferrer">
            Powered by builders
          </a>
        </div>
      </footer>
    </div>
  )
}
