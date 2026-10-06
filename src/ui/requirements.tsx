import { Plus, X, ArrowUp, ArrowDown } from 'lucide-react'
import type { Requirement, RequirementEvidence } from '../domain/challenge-requirements'
import { requirementsFromBrief } from '../domain/challenge-requirements'
import { Field } from './components'

export function RequirementsEditor({
  value,
  onChange,
  brief,
  disabled,
}: {
  value: Requirement[]
  onChange: (value: Requirement[]) => void
  brief: string
  disabled: boolean
}) {
  function update(index: number, change: Partial<Requirement>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...change } : item)))
  }
  function move(index: number, direction: number) {
    const next = [...value]
    ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
    onChange(next)
  }
  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold">Requirements & stretch goals</legend>
      <p className="text-xs leading-5 text-muted">
        A clear checklist for builders and reviewers. Each accepted attempt keeps its own copy, even if you
        edit this challenge later.
      </p>
      {value.map((item, index) => (
        <div key={item.id} className="space-y-3 rounded-lg border border-line bg-canvas p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">Item {index + 1}</span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={disabled || !index}
                className="p-1.5"
                aria-label={`Move requirement ${index + 1} up`}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                disabled={disabled || index === value.length - 1}
                className="p-1.5"
                aria-label={`Move requirement ${index + 1} down`}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                className="p-1.5"
                aria-label={`Remove requirement ${index + 1}`}
                onClick={() => onChange(value.filter((r) => r.id !== item.id))}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <Field label="Requirement">
            <input
              className="field"
              value={item.title}
              required
              maxLength={240}
              onChange={(e) => update(index, { title: e.target.value })}
            />
          </Field>
          <Field label="Scope">
            <select
              className="field"
              value={item.kind}
              onChange={(e) => update(index, { kind: e.target.value as Requirement['kind'] })}
            >
              <option value="required">Required</option>
              <option value="stretch">Optional stretch goal</option>
            </select>
          </Field>
          <Field label="Details (optional)">
            <textarea
              className="field min-h-20"
              value={item.details}
              maxLength={1500}
              onChange={(e) => update(index, { details: e.target.value })}
            />
          </Field>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled || value.length >= 30}
          onClick={() =>
            onChange([...value, { id: crypto.randomUUID(), title: '', details: '', kind: 'required' }])
          }
        >
          <Plus size={14} />
          Add requirement
        </button>
        {!value.length && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={disabled || !requirementsFromBrief(brief).length}
            onClick={() => onChange(requirementsFromBrief(brief))}
          >
            Import checklist from brief
          </button>
        )}
      </div>
    </fieldset>
  )
}

export function RequirementsList({ items }: { items: Requirement[] }) {
  if (!items.length) return null
  return (
    <section className="mt-6 border-t border-line pt-5">
      <h3 className="mb-4 text-sm font-semibold">The checklist</h3>
      <ol className="space-y-3">
        {items.map((item, index) => (
          <li key={item.id} className="flex gap-3 text-sm">
            <span className="mt-0.5 text-xs tabular-nums text-muted">{index + 1}.</span>
            <div>
              <p className="font-medium">
                {item.title}{' '}
                <span className="ml-1 text-[10px] font-normal uppercase text-muted">
                  {item.kind === 'stretch' ? 'Stretch goal' : 'Required'}
                </span>
              </p>
              {item.details && (
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted">{item.details}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function EvidenceEditor({
  requirements,
  value,
  onChange,
  images,
  disabled,
}: {
  requirements: Requirement[]
  value: RequirementEvidence[]
  onChange: (value: RequirementEvidence[]) => void
  images: { id: string; name: string; url: string }[]
  disabled: boolean
}) {
  if (!requirements.length) return null
  function update(id: string, change: Partial<RequirementEvidence>) {
    const item = value.find((v) => v.requirementId === id) ?? {
      requirementId: id,
      completed: false,
      notes: '',
      screenshots: [],
    }
    onChange([...value.filter((v) => v.requirementId !== id), { ...item, ...change }])
  }
  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold">How your build meets the brief</legend>
      <p className="text-xs leading-5 text-muted">
        Report what you completed and add notes or screenshot evidence. This is your checklist, not an
        automated assessment.
      </p>
      {requirements.map((item) => {
        const evidence = value.find((v) => v.requirementId === item.id)
        return (
          <div key={item.id} className="rounded-lg border border-line p-4">
            <label className="flex items-start gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="mt-1 accent-accent"
                checked={evidence?.completed ?? false}
                onChange={(e) => update(item.id, { completed: e.target.checked })}
              />
              {item.title}
            </label>
            <p className="mt-1 text-[10px] uppercase text-muted">
              {item.kind === 'stretch' ? 'Optional stretch goal' : 'Required'}
            </p>
            {item.details && <p className="mt-2 text-xs leading-5 text-muted">{item.details}</p>}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-accent">
                Notes & screenshot evidence{evidence?.notes || evidence?.screenshots.length ? ' · added' : ''}
              </summary>
              <div className="mt-3 space-y-3">
                <Field label="Implementation notes">
                  <textarea
                    className="field min-h-20"
                    value={evidence?.notes ?? ''}
                    maxLength={1500}
                    onChange={(e) => update(item.id, { notes: e.target.value })}
                    placeholder="What works, how to try it, or what is still missing"
                  />
                </Field>
                {!!images.length && (
                  <fieldset>
                    <legend className="mb-2 text-xs font-medium">Screenshots (up to five)</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {images.map((image) => {
                        const selected = evidence?.screenshots.includes(image.id) ?? false
                        return (
                          <label
                            key={image.id}
                            className="flex items-center gap-2 rounded border border-line p-2 text-xs"
                          >
                            <input
                              type="checkbox"
                              className="accent-accent"
                              checked={selected}
                              disabled={disabled || (!selected && (evidence?.screenshots.length ?? 0) >= 5)}
                              onChange={() =>
                                update(item.id, {
                                  screenshots: selected
                                    ? evidence!.screenshots.filter((id) => id !== image.id)
                                    : [...(evidence?.screenshots ?? []), image.id],
                                })
                              }
                            />
                            <img src={image.url} alt="" className="h-8 w-12 rounded object-cover" />
                            <span className="truncate">{image.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                )}
              </div>
            </details>
          </div>
        )
      })}
    </fieldset>
  )
}

export function EvidenceSummary({
  requirements,
  evidence,
  images,
}: {
  requirements: Requirement[]
  evidence: RequirementEvidence[]
  images: { id: string; name: string }[]
}) {
  if (!requirements.length) return null
  return (
    <div className="space-y-4">
      {requirements.map((item) => {
        const report = evidence.find((entry) => entry.requirementId === item.id)
        return (
          <article key={item.id} className="rounded-lg border border-line p-4">
            <p className="text-sm font-medium">{item.title}</p>
            <p className="mt-1 text-xs text-muted">
              {item.kind === 'stretch' ? 'Stretch goal' : 'Required'} ·{' '}
              {report
                ? report.completed
                  ? 'Builder marked complete'
                  : 'Builder marked incomplete'
                : 'Not reported'}
            </p>
            {item.details && <p className="mt-2 text-xs leading-5 text-muted">{item.details}</p>}
            {report?.notes && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{report.notes}</p>}
            <EvidenceImages ids={report?.screenshots ?? []} images={images} />
          </article>
        )
      })}
    </div>
  )
}
export function EvidenceImages({ ids, images }: { ids: string[]; images: { id: string; name: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {ids.flatMap((id) => {
        const image = images.find((item) => item.id === id)
        return image
          ? [
              <a key={id} href={`/api/images/${id}`} target="_blank" rel="noreferrer">
                <img
                  src={`/api/images/${id}`}
                  alt={image.name}
                  className="h-20 w-28 rounded-lg border border-line object-cover"
                />
              </a>,
            ]
          : []
      })}
    </div>
  )
}
