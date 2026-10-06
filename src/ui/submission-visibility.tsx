import type { SubmissionVisibility } from '../domain/submission-visibility'
import { Field } from './components'

export function VisibilityField({
  value,
  onChange,
  disabled = false,
}: {
  value: SubmissionVisibility
  onChange: (value: SubmissionVisibility) => void
  disabled?: boolean
}) {
  return (
    <Field
      label="Submission visibility"
      hint={
        value === 'private'
          ? 'Only you can view this submission on Shipforte. Your submission time and snapshot are saved now; eligible kudos are withheld until you publish, even if you publish after the deadline. Your GitHub repository and external demo/share links remain public.'
          : 'Your project, screenshots, code snapshot, and build sessions will be public. Once public, a submission cannot be made private.'
      }
    >
      <select
        className="field"
        name="visibility"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as SubmissionVisibility)}
      >
        <option value="public">Public — share now</option>
        <option value="private">Private — publish later</option>
      </select>
    </Field>
  )
}
