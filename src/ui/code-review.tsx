import { File, MultiFileDiff, type SelectedLineRange } from '@pierre/diffs/react'
import { Download, FileCode2, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { SnapshotFile } from '../server/snapshots'
import { useData } from './api'
import { Empty, ErrorState, Loading } from './components'
import { CommentCard, CommentForm, type SubmissionDetail } from './submission-page'

interface FileData extends SnapshotFile {
  contents: string | null
}
export default function CodeReview({ data }: { data: SubmissionDetail }) {
  const { data: manifest, error } = useData<{ files: SnapshotFile[] }>(
    `submissions/${data.submission.id}/files`,
  )
  const [path, setPath] = useState('')
  const [search, setSearch] = useState('')
  const [diff, setDiff] = useState(false)
  const { data: previousManifest, error: previousError } = useData<{ files: SnapshotFile[] }>(
    `submissions/${data.submission.previousId}/files`,
    diff && !!data.submission.previousId,
  )
  const current = path || manifest?.files[0]?.path || ''
  if (error) return <ErrorState error={error} />
  if (previousError) return <ErrorState error={previousError} />
  if (!manifest) return <Loading />
  const files = [
    ...manifest.files,
    ...(diff
      ? previousManifest?.files.filter((old) => !manifest.files.some((f) => f.path === old.path)) || []
      : []),
  ]
  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
        <p className="flex items-center gap-2 text-xs font-medium">
          <FileCode2 size={16} />
          {manifest.files.length} saved files
        </p>
        {data.submission.previousId && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={diff}
              onChange={(e) => setDiff(e.target.checked)}
              className="accent-accent"
            />
            Compare with previous submission
          </label>
        )}
      </div>
      <div className="grid lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="border-b border-line p-3 lg:border-r lg:border-b-0">
          <label className="relative">
            <Search size={13} className="absolute top-0.5 left-2 text-muted" />
            <input
              aria-label="Find a file"
              placeholder="Find a file…"
              className="field mb-3 py-2 pl-7 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="max-h-48 space-y-0.5 overflow-auto lg:max-h-[650px]">
            {files
              .filter((f) => f.path.toLowerCase().includes(search.toLowerCase()))
              .map((f) => (
                <button
                  title={f.path}
                  key={f.path}
                  onClick={() => setPath(f.path)}
                  className={`block w-full truncate rounded-md px-2 py-2 text-left font-mono text-[10px] ${current === f.path ? 'bg-sage font-medium' : 'text-muted hover:bg-canvas'}`}
                >
                  {f.path}
                  {!manifest.files.some((currentFile) => currentFile.path === f.path) ? ' (deleted)' : ''}
                </button>
              ))}
          </div>
        </aside>
        <div className="min-w-0">
          {current && (
            <FileReview
              key={`${current}-${diff}`}
              path={current}
              data={data}
              compare={diff}
              currentExists={manifest.files.some((f) => f.path === current)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
function FileReview({
  path,
  data,
  compare,
  currentExists,
}: {
  path: string
  data: SubmissionDetail
  compare: boolean
  currentExists: boolean
}) {
  const id = data.submission.id
  const { data: file, error } = useData<FileData>(
    `submissions/${id}/files?path=${encodeURIComponent(path)}`,
    currentExists,
  )
  const { data: previousManifest, error: manifestError } = useData<{ files: SnapshotFile[] }>(
    `submissions/${data.submission.previousId}/files`,
    compare && !!data.submission.previousId,
  )
  const oldExists = previousManifest?.files.some((f) => f.path === path)
  const { data: oldFile, error: oldError } = useData<FileData>(
    `submissions/${data.submission.previousId}/files?path=${encodeURIComponent(path)}`,
    compare && !!oldExists,
  )
  const [range, setRange] = useState<SelectedLineRange | null>(null)
  const comments = data.comments.filter((c) => c.file === path)
  if (error) return <ErrorState error={error} />
  if (manifestError || oldError) return <ErrorState error={(manifestError || oldError)!} />
  if ((currentExists && !file) || (compare && (!previousManifest || (oldExists && !oldFile))))
    return <Loading />
  if (!currentExists && !compare)
    return <Empty title="This file was removed." description="Enable comparison to view the deleted file." />
  const lineComments = comments.map((c) => ({ lineNumber: c.line || 0, metadata: c }))
  function selectRange(next: SelectedLineRange | null) {
    // Comments on old code stay with the old submission, never the replacement.
    if (next?.side === 'deletions' || next?.endSide === 'deletions') return
    setRange(next)
  }
  const options = { theme: 'pierre-light' as const, enableLineSelection: true, onLineSelected: selectRange }
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-line p-3">
        <span className="truncate font-mono text-xs">{path}</span>
        <a
          aria-label="Download snapshot file"
          className="p-1 text-muted"
          href={`/api/submissions/${currentExists ? id : data.submission.previousId}/files?path=${encodeURIComponent(path)}&download=1`}
        >
          <Download size={15} />
        </a>
      </div>
      {(file || oldFile)?.binary ? (
        <div className="p-5">
          <Empty
            title="Binary file"
            description="Download this file from the saved snapshot. You can leave file-level feedback below."
          />
          {comments.map((c) => (
            <CommentCard key={c.id} comment={c} />
          ))}
        </div>
      ) : (
        <div className="max-h-[650px] overflow-auto text-xs">
          {compare ? (
            <MultiFileDiff
              oldFile={{ name: path, contents: oldFile?.contents || '' }}
              newFile={{ name: path, contents: file?.contents || '' }}
              options={{ ...options, diffStyle: 'unified' }}
              selectedLines={range}
              lineAnnotations={lineComments.map((c) => ({ ...c, side: 'additions' as const }))}
              renderAnnotation={(a) => (
                <div className="p-3">
                  <CommentCard comment={a.metadata} />
                </div>
              )}
            />
          ) : (
            <File
              file={{ name: path, contents: file?.contents || '' }}
              options={options}
              selectedLines={range}
              lineAnnotations={lineComments}
              renderAnnotation={(a) => (
                <div className="p-3">
                  <CommentCard comment={a.metadata} />
                </div>
              )}
            />
          )}
        </div>
      )}
      <div className="border-t border-line p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium">
            {range
              ? `Feedback on lines ${Math.min(range.start, range.end)}–${Math.max(range.start, range.end)}`
              : 'Feedback on this file'}
          </p>
          {range && (
            <button className="text-xs text-muted" onClick={() => setRange(null)}>
              Clear selection
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] leading-5 text-muted">
          Select line numbers to anchor feedback to this commit.
          {compare && ' To comment on deleted code, open the previous submission.'}
        </p>
        {currentExists ? (
          <CommentForm
            submissionId={id}
            file={path}
            line={range ? Math.min(range.start, range.end) : null}
            endLine={range ? Math.max(range.start, range.end) : null}
            onDone={() => setRange(null)}
          />
        ) : (
          <Link
            to="/submissions/$id"
            params={{ id: data.submission.previousId! }}
            className="btn btn-secondary mt-4"
          >
            Comment on the previous snapshot
          </Link>
        )}
      </div>
    </>
  )
}
