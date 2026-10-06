import { useState } from 'react'
import { ArrowDown, ArrowUp, Share2, Pin, Play, X } from 'lucide-react'
import { videoEmbed } from '../domain/showcase'
import type { profile } from '../server/queries'
import type { SubmissionDetail } from './submission-page'
import type { transcriptDetail } from '../server/transcripts'
import { Field, Modal, ErrorState, Loading } from './components'
import { Markdown } from './markdown'
import { useAction } from './provider'
import { useData } from './api'

export function ShowcaseFields({ videoUrl = '', learnings = '' }: { videoUrl?: string; learnings?: string }) {
  return (
    <div className="space-y-4">
      <Field
        label="Demo video or livestream recording (optional)"
        hint="An HTTPS recording link. YouTube, Vimeo, and Loom videos play inline; other recordings open in a new tab."
      >
        <input
          className="field"
          name="videoUrl"
          type="url"
          pattern="https://.*"
          maxLength={2000}
          defaultValue={videoUrl}
          placeholder="https://www.youtube.com/watch?v=…"
        />
      </Field>
      <Field
        label="What I learned (optional)"
        hint="Share discoveries, tradeoffs, or what you would do differently. Supports Markdown. You can update these showcase notes after submission."
      >
        <textarea
          className="field min-h-28"
          name="learnings"
          defaultValue={learnings}
          maxLength={5000}
          placeholder="The surprising part was…"
        />
      </Field>
    </div>
  )
}

export function VideoRecording({ url }: { url: string }) {
  const embed = videoEmbed(url)
  return (
    <section className="panel mt-5 overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Play size={16} />
          Watch the build
        </h2>
        <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent">
          Open recording ↗
        </a>
      </div>
      {embed ? (
        <iframe
          src={embed}
          title="Project demo or build recording"
          className="aspect-video min-h-[200px] w-full border-0"
          loading="lazy"
          allow="fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <p className="px-5 pb-5 text-sm text-muted">
          Watch the demo or livestream recording using the link above.
        </p>
      )}
    </section>
  )
}

export function ShowcaseEditor({ data }: { data: SubmissionDetail }) {
  const [open, setOpen] = useState(false)
  const { run, pending } = useAction()
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Edit showcase
      </button>
      <Modal title="Tell the story of your build" open={open} onClose={() => setOpen(false)}>
        {open && (
          <form
            key={data.submission.revision}
            className="space-y-5"
            onSubmit={async (event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              if (
                await run(
                  `submissions/${data.submission.id}/showcase`,
                  {
                    videoUrl: form.get('videoUrl'),
                    learnings: form.get('learnings'),
                    revision: data.submission.revision,
                  },
                  'Showcase updated.',
                )
              )
                setOpen(false)
            }}
          >
            <ShowcaseFields videoUrl={data.submission.videoUrl} learnings={data.submission.learnings} />
            <p className="text-xs leading-5 text-muted">
              These notes and the recording follow your submission’s visibility. The saved code, deadline, and
              requirement evidence stay tied to the original submission.
            </p>
            <button className="btn btn-primary w-full" disabled={pending}>
              {pending ? 'Saving…' : 'Save showcase'}
            </button>
          </form>
        )}
      </Modal>
    </>
  )
}

export function ShareShowcase({ path, image, title }: { path: string; image: string; title: string }) {
  const [open, setOpen] = useState(false)
  const { toast } = useAction()
  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).href)
      toast('Share link copied.')
    } catch {
      toast('Couldn’t copy the link. Copy it from the field below.', true)
    }
  }
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Share2 size={15} />
        Share
      </button>
      <Modal title="Share your work" open={open} onClose={() => setOpen(false)}>
        {open && (
          <div className="space-y-4">
            <img
              src={image}
              alt={`Share card for ${title}`}
              className="w-full rounded-lg border border-line"
            />
            <Field label="Public share link">
              <input
                readOnly
                className="field"
                value={new URL(path, window.location.origin).href}
                onFocus={(e) => e.target.select()}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={copy}>
                Copy link
              </button>
              <a className="btn btn-secondary" href={`${image}?download=1`}>
                Download card
              </a>
            </div>
            <p className="text-xs text-muted">
              Your link includes a preview image for social platforms and messaging apps.
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}

type Profile = Awaited<ReturnType<typeof profile>>
export function PortfolioEditor({ data }: { data: Profile }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Pin size={15} />
        Pin projects
      </button>
      <Modal title="Your featured builds" open={open} onClose={() => setOpen(false)}>
        {open && <PinForm data={data} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  )
}
function PinForm({ data, onDone }: { data: Profile; onDone: () => void }) {
  const [ids, setIds] = useState(data.pinned.map((item) => item.id))
  const { run, pending } = useAction()
  const options = [
    ...new Map([...data.pinned, ...data.portfolioOptions].map((item) => [item.id, item])).values(),
  ]
  function move(index: number, direction: number) {
    const next = [...ids]
    ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
    setIds(next)
  }
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run('portfolio/pins', { ids }, 'Featured builds updated.')) onDone()
      }}
    >
      <p className="text-sm text-muted">
        Choose up to three public, active builds and arrange their order on your profile.
      </p>
      <ol className="space-y-2">
        {ids.map((id, index) => (
          <li key={id} className="flex items-center gap-2 rounded-lg bg-canvas p-3 text-sm">
            <span className="flex-1">{options.find((item) => item.id === id)?.title}</span>
            <button
              type="button"
              aria-label={`Move project ${index + 1} up`}
              disabled={pending || !index}
              onClick={() => move(index, -1)}
              className="p-1"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              aria-label={`Move project ${index + 1} down`}
              disabled={pending || index === ids.length - 1}
              onClick={() => move(index, 1)}
              className="p-1"
            >
              <ArrowDown size={14} />
            </button>
          </li>
        ))}
      </ol>
      <fieldset disabled={pending} className="max-h-64 space-y-2 overflow-auto">
        <legend className="sr-only">Projects to feature</legend>
        {options.length ? (
          options.map((item) => (
            <label key={item.id} className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-accent"
                checked={ids.includes(item.id)}
                disabled={!ids.includes(item.id) && ids.length >= 3}
                onChange={() =>
                  setIds(ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])
                }
              />
              {item.title}
            </label>
          ))
        ) : (
          <p className="text-sm text-muted">Publish a build to feature it here.</p>
        )}
      </fieldset>
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? 'Saving…' : 'Save featured builds'}
      </button>
    </form>
  )
}

export function ShowcaseStory({ data, owner }: { data: SubmissionDetail; owner: boolean }) {
  const [open, setOpen] = useState(false)
  const { run, pending } = useAction()
  return (
    <>
      {data.submission.videoUrl && <VideoRecording url={data.submission.videoUrl} />}
      {data.submission.learnings && (
        <section className="panel mt-5 p-6">
          <h2 className="mb-4 font-semibold">What I learned</h2>
          <Markdown>{data.submission.learnings}</Markdown>
        </section>
      )}
      {(owner || data.highlights.length > 0) && (
        <section className="panel mt-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Moments from the build</h2>
            {owner && data.highlights.length < 5 && (
              <button type="button" className="text-xs font-medium text-accent" onClick={() => setOpen(true)}>
                Add transcript highlight
              </button>
            )}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            Passages selected by the builder from attached session transcripts.
          </p>
          <div className="mt-4 space-y-4">
            {data.highlights.map((highlight) => (
              <article key={highlight.id} className="rounded-lg border border-line p-4">
                <div className="flex gap-2">
                  <h3 className="flex-1 text-sm font-medium">{highlight.caption}</h3>
                  {owner && (
                    <button
                      type="button"
                      aria-label={`Remove highlight ${highlight.caption}`}
                      disabled={pending}
                      onClick={() => run(`highlights/${highlight.id}/remove`, {}, 'Highlight removed.')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {highlight.hidden && (
                  <p className="mt-2 text-xs text-accent">
                    Source hidden by a moderator · not shown publicly
                  </p>
                )}
                <blockquote className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words border-l-2 border-accent pl-4 text-sm leading-6">
                  {highlight.excerpt ?? 'This source passage is currently unavailable.'}
                </blockquote>
                <a
                  href={`#transcript-${highlight.transcriptId}`}
                  className="mt-3 inline-block text-xs text-accent"
                >
                  {highlight.label} · view session ↓
                </a>
              </article>
            ))}
          </div>
          {owner && !data.highlights.length && (
            <p className="mt-3 text-sm text-muted">
              Pick a useful decision, breakthrough, or surprising detour to tell the story behind your
              project.
            </p>
          )}
        </section>
      )}
      <Modal title="Choose a moment from your transcript" open={open} onClose={() => setOpen(false)}>
        {open && <HighlightPicker data={data} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  )
}
function HighlightPicker({ data, onDone }: { data: SubmissionDetail; onDone: () => void }) {
  const sources = data.transcripts.filter((item) => item.name && !item.hiddenAt)
  const [id, setId] = useState(sources[0]?.id ?? '')
  return (
    <div className="space-y-4">
      {sources.length ? (
        <>
          <Field label="Source transcript">
            <select className="field" value={id} onChange={(e) => setId(e.target.value)}>
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <HighlightForm key={id} id={id} submissionId={data.submission.id} onDone={onDone} />
        </>
      ) : (
        <p className="text-sm text-muted">
          Highlights need an uploaded transcript attached to this submission. External share links cannot
          supply a saved excerpt.
        </p>
      )}
    </div>
  )
}
function HighlightForm({
  id,
  submissionId,
  onDone,
}: {
  id: string
  submissionId: string
  onDone: () => void
}) {
  const { data, error, refetch } = useData<Exclude<Awaited<ReturnType<typeof transcriptDetail>>, Response>>(
    `transcripts/${id}`,
    true,
    { refetchInterval: false },
  )
  const [source, setSource] = useState('original')
  const [range, setRange] = useState({ start: 0, end: 0 })
  const { run, pending } = useAction()
  if (error) return <ErrorState error={error} retry={refetch} />
  if (!data) return <Loading />
  const turns = 'parsed' in data ? (data.parsed?.turns ?? []) : []
  const text = source === 'original' ? (data.text ?? '') : (turns[Number(source)]?.text ?? '')
  const selected = text.slice(range.start, range.end)
  function rememberSelection(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const { selectionStart: start, selectionEnd: end } = event.currentTarget
    if (end > start) setRange({ start, end })
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (
          await run(
            `submissions/${submissionId}/highlights`,
            {
              transcriptId: id,
              turnIndex: source === 'original' ? null : Number(source),
              startOffset: range.start,
              endOffset: range.end,
              caption: new FormData(e.currentTarget).get('caption'),
            },
            'Transcript highlight added.',
          )
        )
          onDone()
      }}
    >
      {!!turns.length && (
        <Field label="Message">
          <select
            className="field"
            value={source}
            onChange={(e) => {
              setSource(e.target.value)
              setRange({ start: 0, end: 0 })
            }}
          >
            <option value="original">Original transcript text</option>
            {turns.map((turn, i) => (
              <option key={i} value={i}>
                {i + 1}. {turn.role} — {turn.text.slice(0, 65)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field
        label="Select a passage"
        hint="Highlight text below with your mouse or keyboard (up to 6,000 characters)."
      >
        <textarea
          readOnly
          className="field min-h-52 font-mono text-xs"
          value={text.slice(0, 100_000)}
          onSelect={rememberSelection}
          onPointerUp={rememberSelection}
          onKeyUp={rememberSelection}
          onBlur={rememberSelection}
        />
      </Field>
      {!!text.trim() && text.length <= 6000 && (
        <button
          type="button"
          className="text-xs font-medium text-accent"
          onClick={() => setRange({ start: 0, end: text.length })}
        >
          Use this whole passage
        </button>
      )}
      <p className="text-xs text-muted">
        {selected.length.toLocaleString()} characters selected
        {text.length > 100_000
          ? ' · original preview limited to 100,000 characters; select a message for later passages.'
          : ''}
      </p>
      <Field label="Why this moment matters">
        <input
          className="field"
          name="caption"
          required
          maxLength={200}
          placeholder="The decision that simplified the whole project"
        />
      </Field>
      <button
        className="btn btn-primary w-full"
        disabled={pending || !selected.trim() || selected.length > 6000}
      >
        {pending ? 'Saving…' : 'Save highlight'}
      </button>
    </form>
  )
}
