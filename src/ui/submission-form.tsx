import { useNavigate } from '@tanstack/react-router'
import { Github, ImagePlus, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import type { Attempt } from '../db/schema'
import type { Repository } from '../server/github'
import { api, useData } from './api'
import { ErrorState, Field } from './components'
import { useAction, useSession } from './provider'
import { TranscriptAttachments, type Transcript } from './transcripts'
import { VisibilityField } from './submission-visibility'
import type { SubmissionVisibility } from '../domain/submission-visibility'
import { withRequirements, type RequirementEvidence } from '../domain/challenge-requirements'
import { EvidenceEditor } from './requirements'
import { ShowcaseFields } from './showcase'

type Uploaded = { id: string; name: string; url: string }
export function SubmissionForm({ attempt }: { attempt: Attempt }) {
  const { data: session } = useSession()
  const {
    data: repos,
    error,
    refetch,
    isFetching,
  } = useData<Repository[]>('repositories', true, {
    refetchOnWindowFocus: 'always',
    refetchInterval: false,
  })
  const [selectedRepoId, setRepoId] = useState('')
  const repoId = selectedRepoId || (repos?.length === 1 ? String(repos[0].id) : '')
  const selectedRepo = repos?.find((r) => String(r.id) === repoId)
  const [images, setImages] = useState<Uploaded[]>([])
  const [uploading, setUploading] = useState(false)
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [attaching, setAttaching] = useState(false)
  const [visibility, setVisibility] = useState<SubmissionVisibility>('public')
  const [evidence, setEvidence] = useState<RequirementEvidence[]>([])
  const { run, pending, toast } = useAction()
  const navigate = useNavigate()
  async function upload(files: FileList | null) {
    if (!files) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const body = new FormData()
        body.set('file', file)
        const image = await api<Uploaded>('uploads', body)
        setImages((old) => [...old, image])
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed. Please retry.', true)
    } finally {
      setUploading(false)
    }
  }
  return (
    <div className="panel p-6 sm:p-8">
      <p className="eyebrow mb-2">The finish line</p>
      <h2 className="text-2xl font-semibold tracking-tight">Show us what you made.</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Choose your repository and show us the working output. We’ll pin its latest default-branch commit when
        you submit.
      </p>
      <div className="my-5 flex flex-wrap items-center gap-3 rounded-lg bg-canvas p-3 text-xs">
        <Github size={16} />
        <span>Your public repositories are discovered automatically from GitHub.</span>
        {session?.installUrl && (
          <a href={session.installUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent">
            Connect an organization ↗
          </a>
        )}
        <button
          type="button"
          className="ml-auto p-1"
          aria-label="Refresh repositories"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>
      {error && (
        <div className="mb-4">
          <ErrorState error={error} retry={refetch} />
          <a href="/api/auth/login" className="mt-3 inline-block text-sm font-medium text-accent">
            Reconnect GitHub
          </a>
        </div>
      )}
      <div className="mt-5">
        <VisibilityField value={visibility} onChange={setVisibility} disabled={pending} />
      </div>
      <TranscriptAttachments
        items={transcripts}
        onChange={setTranscripts}
        onBusy={setAttaching}
        visibility={visibility}
      />
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          const values = new FormData(e.currentTarget)
          const result = await run<{
            id: string
            earned: number
            withheld: number
            visibility: SubmissionVisibility
          }>('submissions', {
            attemptId: attempt.id,
            repoId: Number(repoId),
            title: values.get('title'),
            description: values.get('description'),
            demoUrl: values.get('demoUrl'),
            screenshots: images.map((i) => i.id),
            transcripts: transcripts.map((item) => item.id),
            visibility,
            evidence: evidence.map((item) => ({
              ...item,
              screenshots: item.screenshots.filter((id) => images.some((image) => image.id === id)),
            })),
            videoUrl: values.get('videoUrl'),
            learnings: values.get('learnings'),
          })
          if (result) {
            toast(
              result.visibility === 'private'
                ? `Submitted privately. ${result.withheld} kudos withheld until publication.`
                : result.earned
                  ? `Shipped! You earned ${result.earned} kudos.`
                  : 'Shipped! Your project is ready for the community.',
            )
            await navigate({ to: '/submissions/$id', params: { id: result.id } })
          }
        }}
      >
        <Field label="Project name">
          <input
            className="field"
            name="title"
            placeholder="Give your build a name"
            required
            minLength={3}
            maxLength={120}
          />
        </Field>
        <Field
          label="What did you build?"
          hint="Tell the community how it meets the brief, how to run it, and what you learned."
        >
          <textarea
            className="field min-h-32"
            name="description"
            required
            minLength={20}
            maxLength={10000}
            placeholder="The idea, the implementation, and the little details you’re proud of…"
          />
        </Field>
        <Field
          label="Public GitHub repository"
          hint="Choosing a public repository shares the submitted version with Shipforte. Repositories reload automatically when you return from GitHub."
        >
          <select
            className="field"
            required
            disabled={!repos?.length}
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
          >
            <option value="">
              {error
                ? 'Could not load repositories'
                : repos
                  ? 'Choose your repository'
                  : 'Loading your repositories…'}
            </option>
            {repos?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </select>
        </Field>
        {repos?.length === 0 && (
          <div className="rounded-lg border border-line bg-canvas p-4 text-sm">
            <p className="font-medium">Your project needs a public home on GitHub.</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Create a public repository or make an existing one public. It will appear here when you return.
            </p>
            <a
              href="https://github.com/new"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary mt-3"
            >
              Create a repository ↗
            </a>
          </div>
        )}
        {selectedRepo && (
          <p className="rounded-lg bg-sage p-3 text-xs leading-5">
            We’ll save the latest commit on{' '}
            <code className="font-semibold">{selectedRepo.default_branch}</code> when you submit. Push your
            finished work there first. Later pushes won’t change this submission.
          </p>
        )}
        <Field label="Live demo (optional)">
          <input
            className="field"
            type="url"
            name="demoUrl"
            placeholder="https://your-project.com"
            pattern="https://.*"
          />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium">
            Screenshots of your working output <span className="text-accent">*</span>
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line bg-canvas p-7 text-center hover:border-accent">
            {uploading ? (
              <LoaderCircle className="animate-spin text-muted" size={24} />
            ) : (
              <ImagePlus className="text-muted" size={24} />
            )}
            <span className="mt-3 text-sm font-medium">
              {uploading ? 'Uploading your screenshots…' : 'Choose screenshots'}
            </span>
            <span className="mt-1 text-xs text-muted">
              PNG, JPEG, or WebP · 10 MB each · at least one image
            </span>
            <input
              type="file"
              className="sr-only"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={uploading || pending}
              onChange={(e) => {
                void upload(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
          {!!images.length && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {images.map((i) => (
                <div key={i.id} className="relative overflow-hidden rounded-lg border border-line">
                  <img src={i.url} alt={i.name} className="h-24 w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove ${i.name}`}
                    onClick={() => setImages((old) => old.filter((x) => x.id !== i.id))}
                    className="absolute top-1 right-1 rounded-full bg-white p-1"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <EvidenceEditor
          requirements={withRequirements(attempt).requirements}
          value={evidence}
          onChange={setEvidence}
          images={images}
          disabled={pending}
        />
        <ShowcaseFields />
        <button
          className="btn btn-primary w-full"
          disabled={pending || uploading || attaching || !images.length || !repoId}
        >
          {pending ? (
            <>
              <LoaderCircle size={16} className="animate-spin" />
              Saving your immutable snapshot…
            </>
          ) : visibility === 'private' ? (
            'Submit privately'
          ) : (
            'Submit my project ↗'
          )}
        </button>
        {pending && (
          <output className="block text-xs leading-5 text-muted">
            Keep this page open while we verify your repository and save the code. We check the time your
            submission request arrived, so snapshot processing won’t cost you your deadline.
          </output>
        )}
      </form>
    </div>
  )
}
