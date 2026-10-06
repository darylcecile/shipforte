import { useState } from 'react'
import { Bot, Download, EyeOff, FileText, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { harnessNames } from '../domain/harnesses'
import type { SessionUsage } from '../domain/transcript-data'
import type { transcriptDetail, transcriptSummary } from '../server/transcripts'
import { api, useData } from './api'
import { ErrorState, Field, Loading, Modal } from './components'
import { useAction, useSession } from './provider'
import type { SubmissionVisibility } from '../domain/submission-visibility'

export type Transcript = ReturnType<typeof transcriptSummary>
const usageLabels: Record<keyof SessionUsage, string> = {
  inputTokens: 'Input tokens',
  outputTokens: 'Output tokens',
  cacheReadTokens: 'Cache-read tokens',
  cacheWriteTokens: 'Cache-write tokens',
  reasoningTokens: 'Reasoning tokens',
  costUsd: 'Cost (USD)',
}
function Usage({ usage }: { usage: SessionUsage | null }) {
  return (
    <div className="mt-3 text-xs text-muted">
      <p className="font-medium">Reported usage & cost</p>
      {usage ? (
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(usageLabels).map(([key, label]) => {
            const value = usage[key as keyof SessionUsage]
            return (
              <div key={key}>
                <dt>{label}</dt>
                <dd className="mt-0.5 font-mono text-ink">
                  {value === null
                    ? 'Not reported'
                    : key === 'costUsd'
                      ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
                      : value.toLocaleString()}
                </dd>
              </div>
            )
          })}
        </dl>
      ) : (
        <p className="mt-1">Not reported by this session source.</p>
      )}
      {usage && (
        <p className="mt-2">
          As reported by the export or submitter; not a billing record. Cache and reasoning accounting varies
          by harness and may overlap other counts.
        </p>
      )}
    </div>
  )
}
export function TranscriptCard({ item, children }: { item: Transcript; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div id={`transcript-${item.id}`} className="scroll-mt-24 rounded-xl border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        <Bot size={18} className="mt-1 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="font-medium [overflow-wrap:anywhere]">{item.label}</p>
          <p className="mt-1 text-xs text-muted">
            {harnessNames[item.harness as keyof typeof harnessNames] || item.harness}
            {item.version && ` · ${item.version}`}
            {item.agent && ` · Agent: ${item.agent}`}
          </p>
          <p className="mt-1 break-words text-xs text-muted">
            Models: {item.models.length ? item.models.join(', ') : item.model || 'Not reported'}
          </p>
          {!!item.hiddenAt && (
            <p className="mt-2 flex items-center gap-1 text-xs text-accent">
              <EyeOff size={13} /> Hidden by a moderator
              {item.moderationReason && `: ${item.moderationReason}`}
            </p>
          )}
        </div>
        {children}
      </div>
      <Usage usage={item.usage} />
      <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-accent">
        {item.sourceUrl ? (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
            Open shared session ↗
          </a>
        ) : (
          <button type="button" onClick={() => setOpen(true)}>
            Read transcript →
          </button>
        )}
        {item.name && (
          <a href={`/api/transcripts/${item.id}?download`} className="inline-flex items-center gap-1">
            <Download size={13} />
            Download original
          </a>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {item.sourceUrl
          ? 'External link · content can change or become unavailable.'
          : `User-provided transcript · ${Math.ceil(item.size / 1024)} KB`}
      </p>
      <Modal title={item.label} open={open} onClose={() => setOpen(false)}>
        {open && <TranscriptReader id={item.id} />}
      </Modal>
    </div>
  )
}
function TranscriptReader({ id }: { id: string }) {
  const { data, error, refetch } = useData<Exclude<Awaited<ReturnType<typeof transcriptDetail>>, Response>>(
    `transcripts/${id}`,
    true,
    { refetchInterval: false },
  )
  const [raw, setRaw] = useState(false)
  const [shown, setShown] = useState(50)
  if (error) return <ErrorState error={error} retry={refetch} />
  if (!data) return <Loading />
  if (!data.text) return <p className="text-sm text-muted">This transcript is an external link.</p>
  const parsed = 'parsed' in data ? data.parsed : undefined
  const hasTurns = !!parsed?.turns.length
  const excerpt = data.text.slice(0, 100_000)
  return (
    <div className="min-w-0 space-y-4">
      {hasTurns && (
        <button type="button" className="btn btn-secondary" onClick={() => setRaw(!raw)}>
          {raw ? 'Conversation view' : 'Original text'}
        </button>
      )}
      {hasTurns && !raw ? (
        <>
          {parsed!.turns.slice(0, shown).map((turn, i) => (
            <article key={i} className="rounded-lg border border-line p-3">
              <p className="mb-2 text-xs font-semibold capitalize text-muted">
                {turn.role}
                {turn.model && ` · ${turn.model}`}
              </p>
              {turn.tool ? (
                <details>
                  <summary className="cursor-pointer text-xs">Tool output</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{turn.text}</pre>
                </details>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{turn.text}</p>
              )}
            </article>
          ))}
          {shown < parsed!.turns.length && (
            <button type="button" className="btn btn-secondary" onClick={() => setShown(shown + 50)}>
              Show more messages
            </button>
          )}
          <p className="text-xs text-muted">
            Conversation view shows recognized messages.{' '}
            {parsed!.truncated && 'Long messages are shortened. '}Download the original for all records.
          </p>
        </>
      ) : data.format === 'md' ? (
        <div className="markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={{
              img: ({ alt }) => <span>[Image: {alt || 'attachment'}]</span>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {excerpt}
          </ReactMarkdown>
        </div>
      ) : (
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
          {excerpt}
        </pre>
      )}
      {(raw || !hasTurns) && data.text.length > excerpt.length && (
        <p className="text-xs text-muted">
          Preview shortened to 100,000 characters. Download the original for the full transcript.
        </p>
      )}
    </div>
  )
}

export function TranscriptAttachments({
  items,
  onChange,
  onBusy,
  visibility = 'public',
}: {
  items: Transcript[]
  onChange: (items: Transcript[]) => void
  onBusy: (busy: boolean) => void
  visibility?: SubmissionVisibility
}) {
  const [mode, setMode] = useState('file')
  const [busy, setBusy] = useState(false)
  const { toast } = useAction()
  async function add(form: HTMLFormElement) {
    const values = new FormData(form)
    setBusy(true)
    onBusy(true)
    try {
      let result: Transcript
      if (mode === 'link')
        result = await api<Transcript>('transcripts/link', {
          sourceUrl: values.get('sourceUrl'),
        })
      else {
        const body = new FormData()
        const file =
          mode === 'paste'
            ? new File([String(values.get('text') || '')], 'session.txt', { type: 'text/plain' })
            : values.get('file')
        if (!(file instanceof File) || !file.size)
          throw new Error('Choose a transcript file or paste its contents.')
        body.set('file', file)
        result = await api<Transcript>('transcripts/upload', body)
      }
      onChange([...items, result])
      form.reset()
      toast('Session imported with its available details. It follows your submission’s visibility.')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not attach this session.', true)
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  return (
    <section className="my-6 rounded-xl border border-line bg-canvas p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <FileText size={16} />
        Build sessions <span className="font-normal text-muted">(optional)</span>
      </h3>
      <p className="mt-2 text-xs leading-5 text-muted">
        Attach your session and we’ll identify the harness, models, version, and usage from the export where
        available. No metadata to fill in.{' '}
        {visibility === 'private'
          ? 'This session stays private on Shipforte until you publish the submission.'
          : 'Your session becomes public when you submit; moderators can hide it if needed.'}
      </p>
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-white p-4">
        <Bot size={18} className="mt-0.5 shrink-0 text-accent" />
        <div>
          <p className="text-sm font-medium">Building with an agent?</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Connect it via MCP to attach its build session and prepare your submission. You review and approve
            everything in Shipforte before it’s published.
          </p>
          <a
            href="/agents"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-xs font-semibold text-accent"
          >
            Connect your agent via MCP ↗<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <TranscriptCard key={item.id} item={item}>
            <button
              type="button"
              disabled={busy}
              aria-label={`Remove ${item.label}`}
              onClick={async () => {
                setBusy(true)
                onBusy(true)
                try {
                  await api(`transcripts/${item.id}/remove`, {})
                  onChange(items.filter((t) => t.id !== item.id))
                } catch (error) {
                  toast(error instanceof Error ? error.message : 'Removal failed.', true)
                } finally {
                  setBusy(false)
                  onBusy(false)
                }
              }}
            >
              <X size={16} />
            </button>
          </TranscriptCard>
        ))}
      </div>
      {items.length < 10 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-accent">Attach a build session</summary>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void add(event.currentTarget)
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <Field label="Attachment type">
                <select className="field" value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="file">Upload an export</option>
                  <option value="paste">Paste transcript text</option>
                  <option value="link">Link a shared session</option>
                </select>
              </Field>
              {mode === 'file' && (
                <Field label="Transcript file" hint="Markdown, TXT, JSON, or JSONL · up to 10 MB">
                  <input type="file" name="file" accept=".md,.txt,.json,.jsonl" required className="field" />
                </Field>
              )}
              {mode === 'paste' && (
                <Field label="Transcript text">
                  <textarea name="text" className="field min-h-36" required />
                </Field>
              )}
              {mode === 'link' && (
                <Field
                  label="Shared session URL"
                  hint="Use a link your audience can open. Available metadata is detected; a native export usually includes more detail."
                >
                  <input
                    name="sourceUrl"
                    type="url"
                    pattern="https://.*"
                    className="field"
                    required
                    maxLength={2000}
                  />
                </Field>
              )}
              <p className="text-xs leading-5 text-muted">
                Details the source doesn’t provide are shown as “not reported.” Cost is displayed only when
                the source reports a USD amount.
              </p>
              <button className="btn btn-secondary" disabled={busy}>
                {busy ? 'Importing session…' : 'Import session'}
              </button>
            </fieldset>
          </form>
        </details>
      )}
    </section>
  )
}

export function SubmissionTranscripts({ items }: { items: Transcript[] }) {
  const { data: session } = useSession()
  const { run, pending } = useAction()
  const [selected, setSelected] = useState<Transcript | null>(null)
  return (
    <section className="panel mt-5 p-6">
      <h2 className="font-semibold">Build sessions</h2>
      <p className="mt-2 text-xs leading-5 text-muted">
        User-provided records of the build, including reported agents, models, usage, and cost.
      </p>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item) => (
            <TranscriptCard key={item.id} item={item}>
              {session?.user?.moderator && (
                <button
                  type="button"
                  className="text-xs font-medium text-accent"
                  onClick={() => setSelected(item)}
                >
                  {item.hiddenAt ? 'Restore' : 'Hide'}
                </button>
              )}
            </TranscriptCard>
          ))
        ) : (
          <p className="text-sm text-muted">No public build sessions attached.</p>
        )}
      </div>
      <Modal
        title={selected?.hiddenAt ? 'Restore transcript' : 'Hide transcript'}
        open={!!selected}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              const reason = new FormData(e.currentTarget).get('reason')
              if (
                await run(
                  `transcripts/${selected.id}/moderate`,
                  { hidden: !selected.hiddenAt, reason },
                  'Transcript visibility updated.',
                )
              )
                setSelected(null)
            }}
          >
            <Field label="Reason" hint="Visible to the author and moderators.">
              <textarea name="reason" className="field" required minLength={3} maxLength={2000} />
            </Field>
            <button className="btn btn-primary" disabled={pending}>
              Save visibility
            </button>
          </form>
        )}
      </Modal>
    </section>
  )
}
