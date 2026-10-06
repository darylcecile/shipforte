import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bell,
  CheckCheck,
  Github,
  RotateCcw,
  Search,
  Trophy,
  UserPlus,
} from 'lucide-react'
import { useState } from 'react'
import type { inbox, people, profile } from '../server/queries'
import { useData } from './api'
import {
  Avatar,
  date,
  Empty,
  ErrorState,
  Loading,
  LoginPrompt,
  PageTitle,
  SubmissionCard,
} from './components'
import { useAction, useSession } from './provider'
import { useNow } from './components'
import { PortfolioEditor, ShareShowcase } from './showcase'

type People = Awaited<ReturnType<typeof people>>
export function PeoplePage({ leaderboard = false }: { leaderboard?: boolean }) {
  const [query, setQuery] = useState('')
  const { data, error, refetch } = useData<People>('people')
  const { data: session } = useSession()
  const { run, pending } = useAction()
  if (error) return <ErrorState error={error} retry={refetch} />
  if (!data) return <Loading />
  const filtered = data.filter((p) => `${p.name} ${p.login}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <>
      <PageTitle
        eyebrow={leaderboard ? 'A little friendly competition' : 'Good company, great builds'}
        title={leaderboard ? 'Built it. Shipped it. Earned it.' : 'Meet your fellow makers.'}
        description={
          leaderboard
            ? 'Kudos celebrate the people who follow through. Every size of project counts.'
            : 'Find people who share your curiosity. Follow their journey and invite them to build.'
        }
        action={
          <label className="relative">
            <Search size={15} className="absolute top-3 left-3 text-muted" />
            <input
              aria-label="Search builders"
              className="field pl-9"
              placeholder="Find a builder…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        }
      />
      {leaderboard && !!data.length && (
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          {data.slice(0, 3).map((p, i) => (
            <Link
              to="/people/$login"
              params={{ login: p.login }}
              key={p.id}
              className={`panel relative p-6 ${i === 0 ? 'border-[#dce4cb] bg-[#eef2e5]' : ''}`}
            >
              <span className="absolute top-5 right-5 text-sm font-medium text-muted">#{p.rank}</span>
              <Avatar login={p.login} avatar={p.avatar} />
              <h2 className="mt-4 text-lg font-semibold">{p.name}</h2>
              <p className="mt-1 text-xs text-muted">@{p.login}</p>
              <p className="mt-5 flex items-center gap-2 text-2xl font-semibold tabular-nums">
                <Trophy size={18} className="text-accent" />
                {p.kudos}
                <span className="text-xs font-normal text-muted">kudos</span>
              </p>
            </Link>
          ))}
        </div>
      )}
      {filtered.length ? (
        leaderboard ? (
          <div className="panel overflow-hidden">
            <div className="grid grid-cols-[48px_1fr_80px] gap-3 border-b border-line bg-white px-5 py-3 text-[10px] font-semibold tracking-wider uppercase text-muted sm:grid-cols-[60px_1fr_120px_100px]">
              <span>Rank</span>
              <span>Builder</span>
              <span className="hidden sm:block">Submissions</span>
              <span className="text-right">Kudos</span>
            </div>
            {filtered.map((p) => (
              <Link
                to="/people/$login"
                params={{ login: p.login }}
                key={p.id}
                className="grid grid-cols-[48px_1fr_80px] items-center gap-3 border-b border-line px-5 py-4 last:border-0 hover:bg-canvas sm:grid-cols-[60px_1fr_120px_100px]"
              >
                <span className="text-sm tabular-nums text-muted">#{p.rank}</span>
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar login={p.login} avatar={p.avatar} />
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-medium">{p.name}</strong>
                    <span className="text-xs text-muted">@{p.login}</span>
                  </span>
                </span>
                <span className="hidden text-sm text-muted sm:block">{p.submissions}</span>
                <strong className="text-right text-sm font-semibold tabular-nums">{p.kudos}</strong>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <div key={p.id} className="panel p-5">
                <div className="flex items-start justify-between">
                  <Link to="/people/$login" params={{ login: p.login }}>
                    <Avatar login={p.login} avatar={p.avatar} />
                  </Link>
                  <span className="text-xs font-medium text-accent">✳ {p.kudos}</span>
                </div>
                <Link
                  to="/people/$login"
                  params={{ login: p.login }}
                  className="mt-4 block text-lg font-semibold"
                >
                  {p.name}
                </Link>
                <p className="text-xs text-muted">@{p.login}</p>
                <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-muted">
                  {p.bio || 'Making time to make something.'}
                </p>
                {session?.user && p.id !== session.user.id && (
                  <button
                    disabled={pending}
                    onClick={() => run(`people/${p.id}/follow`, { following: !p.following })}
                    className={`btn mt-4 w-full ${p.following ? 'btn-secondary' : ''}`}
                  >
                    <UserPlus size={14} />
                    {p.following ? 'Following · Unfollow' : 'Follow builder'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <Empty
          title="Your people are on their way."
          description={
            query
              ? 'Try searching for another name.'
              : 'Connect GitHub and help start a community of builders.'
          }
        />
      )}
    </>
  )
}
export function ProfilePage({ login }: { login: string }) {
  const { data, error, refetch } = useData<Awaited<ReturnType<typeof profile>>>(`people/${login}`)
  const { data: session } = useSession()
  const { run, pending } = useAction()
  if (error) return <ErrorState error={error} retry={refetch} />
  if (!data) return <Loading />
  const p = data.user
  return (
    <>
      <div className="panel mb-8 flex flex-wrap items-center gap-6 p-7">
        <Avatar login={p.login} avatar={p.avatar} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">{p.name}</h1>
          <p className="mt-1 text-sm text-muted">@{p.login}</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            {p.bio || 'Making time to make something.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-5 text-xs">
            <strong className="text-accent">✳ {data.kudos} kudos</strong>
            <span>{data.counts?.followers || 0} followers</span>
            <span>{data.counts?.following || 0} following</span>
            <a
              href={`https://github.com/${p.login}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1"
            >
              <Github size={13} />
              GitHub <ArrowUpRight size={12} />
            </a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {session?.user?.id === p.id && <PortfolioEditor data={data} />}
          <ShareShowcase
            path={`/people/${p.login}`}
            image={`/api/share/people/${p.login}.png`}
            title={`${p.name} on Shipforte`}
          />
        </div>
        {session?.user && session.user.id !== p.id && p.githubId > 0 && (
          <button
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run(`people/${p.id}/follow`, { following: !data.following })}
          >
            <UserPlus size={15} />
            {data.following ? 'Following · Unfollow' : 'Follow builder'}
          </button>
        )}
      </div>
      {!!data.pinned.length && (
        <section className="mb-10">
          <h2 className="mb-5 text-xl font-semibold tracking-tight">Featured builds</h2>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.pinned.map((item) => (
              <SubmissionCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
      <h2 className="mb-5 text-xl font-semibold tracking-tight">A body of work.</h2>
      {data.submissions.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.submissions.map((s) => (
            <div key={s.id}>
              {s.archived && <p className="mb-2 text-xs text-muted">Archived version</p>}
              <SubmissionCard item={s} />
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="The next great build is still taking shape."
          description="Projects will appear here when this builder shares their first submission."
        />
      )}
    </>
  )
}
export function NotificationsPage() {
  const now = useNow()
  const { data: session } = useSession()
  const { data, error, refetch } = useData<Awaited<ReturnType<typeof inbox>>>(
    'notifications',
    !!session?.user,
  )
  const { run, pending } = useAction()
  const navigate = useNavigate()
  if (!session) return <Loading />
  if (!session.user) return <LoginPrompt />
  if (error) return <ErrorState error={error} retry={refetch} />
  return (
    <>
      <PageTitle
        eyebrow="You’re in the loop"
        title="A little good news."
        description="Invitations, feedback, milestones, and new opportunities to build."
        action={
          <button
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run('notifications/read', {}, 'All caught up.')}
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        }
      />
      {!data ? (
        <Loading />
      ) : data.length ? (
        <div className="panel overflow-hidden">
          {data.map((n) => (
            <button
              key={n.id}
              className={`flex w-full items-start gap-4 border-b border-line p-5 text-left last:border-0 hover:bg-canvas ${n.readAt ? '' : 'bg-[#f5f7ef]'}`}
              onClick={async () => {
                if (await run('notifications/read', { id: n.id })) await navigate({ to: n.href })
              }}
            >
              <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-muted">
                <Bell size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {n.title}
                  {!n.readAt && <i className="h-1.5 w-1.5 rounded-full bg-accent" />}
                </span>
                <span className="mt-1 block text-sm leading-6 text-muted">{n.body}</span>
                {n.progress && (
                  <span className="mt-2 block text-xs text-muted">
                    {n.progress.submittedAt
                      ? 'Submitted'
                      : n.progress.deadline <= now
                        ? 'Building · kudos window closed'
                        : 'Challenge in progress'}
                  </span>
                )}
                {n.votes && (
                  <span className="mt-2 flex gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <ArrowUp size={12} />
                      {n.votes.up}
                    </span>
                    <span className="flex items-center gap-1">
                      <ArrowDown size={12} />
                      {n.votes.down}
                    </span>
                    <span className="flex items-center gap-1">
                      <RotateCcw size={12} />
                      {n.votes.redo}
                    </span>
                  </span>
                )}
                <span className="mt-2 block text-[10px] text-muted">{date(n.createdAt)}</span>
              </span>
              <ArrowUpRight size={15} className="mt-1 shrink-0 text-muted" />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="All quiet on the workbench."
          description="We’ll let you know when someone invites you, leaves feedback, or you reach a new milestone."
        />
      )}
    </>
  )
}
