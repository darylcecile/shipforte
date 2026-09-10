import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Clock3,
  Code2,
  Layers3,
  LoaderCircle,
  MessageSquare,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { tiers, type Tier } from '../domain/rules'
import type { submissionCards } from '../server/queries'

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      {' '}
      <div>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="text-3xl leading-tight font-semibold tracking-[-.04em] sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
export function Loading() {
  return (
    <output className="flex min-h-60 items-center justify-center gap-3 text-sm text-muted">
      <LoaderCircle className="animate-spin" size={18} /> Loading your workspace…
    </output>
  )
}
export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div role="alert" className="panel p-8">
      <h2 className="font-semibold">We couldn’t load this.</h2>
      <p className="mt-2 text-sm text-muted">{error.message}</p>
      {retry && (
        <button className="btn btn-secondary mt-5" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  )
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-white text-muted">
        <Layers3 size={22} />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
export function Avatar({
  login,
  avatar,
  size = 'md',
}: {
  login: string
  avatar?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const classes = { sm: 'h-6 w-6 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-20 w-20 text-2xl' }
  return avatar ? (
    <img
      alt={login}
      src={avatar}
      className={`${classes[size]} shrink-0 rounded-full bg-sage object-cover`}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className={`${classes[size]} grid shrink-0 place-items-center rounded-full bg-sage font-semibold`}>
      {login.slice(0, 1).toUpperCase()}
    </span>
  )
}
export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-canvas px-2 py-1 text-[11px] font-semibold text-muted">
      <span className="flex items-end gap-0.5" aria-hidden>
        {Object.keys(tiers).map((t, i) => (
          <i
            key={t}
            className={`w-0.5 rounded-sm ${i <= Object.keys(tiers).indexOf(tier) ? 'bg-ink' : 'bg-line'}`}
            style={{ height: 5 + i * 2 }}
          />
        ))}
      </span>
      {tier === 'xlarge' ? 'Extra large' : tier[0].toUpperCase() + tier.slice(1)}
    </span>
  )
}
export function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}
export function Countdown({ deadline, startedAt }: { deadline: number; startedAt?: number }) {
  const now = useNow()
  const remaining = Math.max(0, deadline - now)
  const days = Math.floor(remaining / 86_400_000)
  const hours = Math.floor(remaining / 3_600_000) % 24
  const minutes = Math.floor(remaining / 60_000) % 60
  const seconds = Math.floor(remaining / 1000) % 60
  return (
    <div>
      <p
        className={`flex items-center gap-2 text-sm font-medium tabular-nums ${remaining ? '' : 'text-accent'}`}
      >
        <Clock3 size={15} />
        {remaining ? `${days}d ${hours}h ${minutes}m ${seconds}s left` : 'Kudos window closed'}
      </p>
      {startedAt && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.max(0, Math.min(100, (remaining / (deadline - startedAt)) * 100))}%` }}
          />
        </div>
      )}
    </div>
  )
}
export function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClose={onClose}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-ink shadow-2xl backdrop:bg-black/40"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          className="rounded-md p-2 text-muted hover:bg-canvas"
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-5 text-muted">{hint}</span>}
    </label>
  )
}
export function LoginPrompt() {
  return (
    <Empty
      title="Your next build starts here."
      description="Connect GitHub to take on challenges, share your work, and join the conversation."
      action={
        <a href="/api/auth/login" className="btn btn-primary">
          Connect GitHub <ArrowUpRight size={16} />
        </a>
      }
    />
  )
}
export function Artwork({ category, compact = false }: { category: string; compact?: boolean }) {
  const palette: Record<string, string> = {
    Tools: 'bg-[#e9edde]',
    Productivity: 'bg-[#e4eafa]',
    Creative: 'bg-[#f7e7da]',
    Community: 'bg-[#eee5f2]',
    Games: 'bg-[#f7edcd]',
    Learning: 'bg-[#dcece8]',
  }
  const Icon =
    category === 'Community'
      ? Users
      : category === 'Creative'
        ? Sparkles
        : category === 'Productivity'
          ? Layers3
          : Code2
  return (
    <div
      aria-hidden
      className={`${palette[category] || palette.Tools} relative flex items-center justify-center overflow-hidden ${compact ? 'h-16 w-16 rounded-xl' : 'h-36 rounded-t-xl'}`}
    >
      <div className="absolute h-36 w-36 rounded-full border border-current opacity-[.07]" />
      <div className="absolute h-52 w-52 rounded-full border border-current opacity-[.06]" />
      <div
        className={`relative rotate-[-8deg] rounded-xl border border-white/80 bg-white/70 shadow-[3px_5px_0_0_rgba(0,0,0,.06)] ${compact ? 'p-3' : 'p-5'}`}
      >
        <Icon size={compact ? 23 : 30} strokeWidth={1.4} />
      </div>
    </div>
  )
}
export type SubmissionCardData = Awaited<ReturnType<typeof submissionCards>>[number]
export function SubmissionCard({ item }: { item: SubmissionCardData }) {
  return (
    <Link
      to="/submissions/$id"
      params={{ id: item.id }}
      className="panel group block overflow-hidden transition-shadow hover:shadow-md"
    >
      {item.imageId ? (
        <img
          src={`/api/images/${item.imageId}`}
          alt={`${item.title} working output`}
          className="aspect-[16/10] w-full border-b border-line object-cover object-top"
          loading="lazy"
        />
      ) : (
        <Artwork category="Creative" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold tracking-tight group-hover:text-accent">{item.title}</h3>
          <ArrowUpRight size={16} className="mt-1 shrink-0 text-muted" />
        </div>
        <p className="mt-1 truncate text-xs text-muted">{item.challengeTitle}</p>
        <div className="mt-5 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs">
            <Avatar login={item.login} avatar={item.avatar} size="sm" />
            {item.login}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <MessageSquare size={13} />
            {item.up - item.down} score
          </span>
        </div>
      </div>
    </Link>
  )
}
export function date(value: number) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(value)
}
