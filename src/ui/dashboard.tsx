import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, Clock3, Plus, Search, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import type { home } from '../server/queries'
import { tiers, type Tier } from '../domain/rules'
import { useData } from './api'
import {
  Artwork,
  Countdown,
  Empty,
  ErrorState,
  Loading,
  LoginPrompt,
  PageTitle,
  SubmissionCard,
  TierBadge,
} from './components'
import { useSession } from './provider'

type Home = Awaited<ReturnType<typeof home>>
export function Dashboard() {
  const { data, error, refetch } = useData<Home>('home')
  const { data: session } = useSession()
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState('all')
  const [category, setCategory] = useState('All challenges')
  if (error) return <ErrorState error={error} retry={refetch} />
  if (!data) return <Loading />
  const active = data.attempts.find((a) => !a.submittedAt)
  const matches = data.challenges.filter(
    (c) =>
      `${c.title} ${c.summary}`.toLowerCase().includes(query.toLowerCase()) &&
      (tier === 'all' || c.tier === tier) &&
      (category === 'All challenges' || c.category === category),
  )
  const authError =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('authError') : null
  return (
    <>
      {authError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-orange-200 bg-accent-soft p-4 text-sm text-accent"
        >
          {authError}
        </div>
      )}
      <PageTitle
        eyebrow={
          session?.user
            ? `Good to see you, ${session.user.name.split(' ')[0]}`
            : 'For the makers, the tinkerers, the just-getting-starteds'
        }
        title="Less someday. More shipped."
        description="Pick a challenge, make it your own, and build something worth sharing."
        action={
          <Link to="/propose" className="btn btn-secondary">
            <Plus size={16} />
            Propose a challenge
          </Link>
        }
      />
      <div className="mb-10 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="relative overflow-hidden rounded-xl border border-[#dfe4d4] bg-[#edf0e5] p-6 sm:p-8">
          <div className="relative z-10 max-w-md">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-900/10 bg-white/55 px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase">
              <Sparkles size={12} />A little constraint. A lot of possibility.
            </span>
            <h2 className="mt-5 max-w-sm text-[28px] leading-[1.18] font-semibold tracking-[-.045em]">
              Your next great project
              <br />
              starts with a small challenge.
            </h2>
            <p className="mt-3 max-w-xs text-sm leading-6 text-ink/75">
              Build with AI, without AI, your way.
              <br />
              The only thing that matters? Making it real.
            </p>
            <a href="#challenges" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">
              Find your challenge <ArrowRight size={16} />
            </a>
          </div>
          <div
            aria-hidden
            className="absolute top-12 -right-12 hidden h-64 w-64 rotate-[-20deg] rounded-[40px] border-[28px] border-[#d8e0c9] sm:block"
          />
          <div
            aria-hidden
            className="absolute right-5 bottom-7 hidden h-24 w-24 rotate-12 rounded-2xl border border-white bg-[#f9fbf6] text-center text-5xl leading-[96px] shadow-lg sm:block"
          >
            ↗
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-xl bg-[#2b3029] p-6 text-white sm:p-8">
          <p className="eyebrow text-white/65">
            {active ? 'Currently on your workbench' : 'The loop is simple'}
          </p>
          {active ? (
            <>
              <h2 className="my-5 text-2xl font-medium tracking-tight">{active.title}</h2>
              <Countdown deadline={active.deadline} startedAt={active.startedAt} />
              <Link
                to="/challenges/$id"
                params={{ id: active.challengeId }}
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium"
              >
                Keep building <ArrowUpRight size={16} />
              </Link>
            </>
          ) : (
            <>
              <div className="my-6 space-y-4">
                {[
                  'Pick something that sparks your curiosity.',
                  'Build it before the clock runs out.',
                  'Share your work. Earn your kudos.',
                ].map((s, i) => (
                  <p key={s} className="flex items-center gap-3 text-sm text-white/80">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/20 text-[10px] text-white/70">
                      0{i + 1}
                    </span>
                    {s}
                  </p>
                ))}
              </div>
              <div className="flex gap-6 border-t border-white/10 pt-4 text-xs text-white/70">
                <span>
                  <b className="mr-1 text-white">{data.stats?.builders || 0}</b> builders
                </span>
                <span>
                  <b className="mr-1 text-white">{data.stats?.submissions || 0}</b> projects shipped
                </span>
              </div>
            </>
          )}
        </div>
      </div>
      <section id="challenges" className="scroll-mt-24">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Find your next build</h2>
            <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">
              {data.challenges.length}
            </span>
          </div>
          <div className="flex gap-2">
            <label className="relative">
              <Search size={15} className="absolute top-3 left-3 text-muted" />
              <input
                aria-label="Search challenges"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="field max-w-48 pl-9"
                placeholder="Find a challenge…"
              />
            </label>
            <select
              aria-label="Filter by challenge size"
              className="field w-auto"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
            >
              <option value="all">All sizes</option>
              {Object.keys(tiers).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
          {['All challenges', ...new Set(data.challenges.map((c) => c.category))].map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`shrink-0 border-b-2 px-3 py-3 text-xs font-medium ${category === item ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {item}
            </button>
          ))}
        </div>
        {matches.length ? (
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {matches.map((c) => (
              <Link
                key={c.id}
                to="/challenges/$id"
                params={{ id: c.id }}
                className="panel group overflow-hidden transition-shadow hover:shadow-md"
              >
                <Artwork category={c.category} />
                <div className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="eyebrow text-[10px]">{c.category}</span>
                    <TierBadge tier={c.tier as Tier} />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight group-hover:text-accent">{c.title}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-muted">{c.summary}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                      <Clock3 size={14} />
                      {c.days} days<span className="mx-1 text-line">|</span>
                      <Users size={14} />
                      {c.builders}
                    </span>
                    <span className="text-xs font-semibold text-accent">✳ {tiers[c.tier]} kudos</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="A little room for a new idea."
            description={
              query
                ? 'No challenges match your search. Try another term or size.'
                : 'The first challenges are on their way. Have an idea? Propose one for the community.'
            }
            action={
              <Link to="/propose" className="btn btn-secondary">
                Propose a challenge
              </Link>
            }
          />
        )}
      </section>
      <section className="mt-12">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Fresh from the workbench</h2>
          <span className="text-xs text-muted">Real projects. Real progress.</span>
        </div>
        {data.recent.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.recent.map((item) => (
              <SubmissionCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <Empty
            title="Be the first to ship."
            description="Every submission starts with someone deciding to give it a go. Why not you?"
          />
        )}
      </section>
    </>
  )
}
export function Builds() {
  const { data: session } = useSession()
  const { data, error } = useData<Home>('home')
  if (!session || !data) return <Loading />
  if (!session.user) return <LoginPrompt />
  if (error) return <ErrorState error={error} />
  return (
    <>
      <PageTitle
        eyebrow="Your workbench"
        title="One build at a time."
        description="Your clock starts when you take a challenge. Your ideas are always worth finishing."
      />
      {data.attempts.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {data.attempts.map((a) => (
            <div key={a.id} className="panel p-6">
              <div className="flex items-center justify-between">
                <TierBadge tier={a.tier} />
                <span className="text-xs text-muted">
                  {a.submittedAt ? 'Submitted' : 'In progress'} · {a.kind}
                </span>
              </div>
              <h2 className="mt-4 text-xl font-semibold">{a.title}</h2>
              <div className="mt-5">
                {a.submittedAt ? (
                  <p className="text-sm text-muted">
                    {a.submittedAt < a.deadline
                      ? 'Submitted before the deadline.'
                      : 'Submitted after the kudos window.'}
                  </p>
                ) : (
                  <Countdown deadline={a.deadline} startedAt={a.startedAt} />
                )}
              </div>
              <Link to="/challenges/$id" params={{ id: a.challengeId }} className="btn btn-secondary mt-5">
                {a.submittedAt ? 'View challenge' : 'Continue to submission'}
                <ArrowUpRight size={15} />
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="A clean workbench. Endless possibilities."
          description="Choose a challenge to start your first build."
          action={
            <Link to="/" className="btn">
              Explore challenges
            </Link>
          }
        />
      )}
    </>
  )
}
