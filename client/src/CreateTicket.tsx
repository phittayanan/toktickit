import { useEffect, useState, type FormEvent } from 'react'
import {
  createTicket,
  fetchCategories,
  fetchRelatedSystems,
  type Category,
  type Priority,
  type RelatedSystem,
  type Ticket,
} from './api'

interface FormValues {
  categoryId: string
  relatedSystemId: string
  requestedPriority: Priority | ''
  summary: string
  description: string
}

type FieldErrors = Partial<Record<keyof FormValues, string>>

type ReferenceState =
  | { status: 'loading' }
  | { status: 'success'; categories: Category[]; relatedSystems: RelatedSystem[] }
  | { status: 'error'; message: string }

const EMPTY_FORM: FormValues = {
  categoryId: '',
  relatedSystemId: '',
  requestedPriority: '',
  summary: '',
  description: '',
}

// BR-08/BR-09/BR-11 mirrored client-side (AC-09) — the server independently
// re-validates the same rules (AC-10, api-spec.md).
function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {}

  if (!values.categoryId) errors.categoryId = 'Category is required.'
  if (!values.relatedSystemId) errors.relatedSystemId = 'Related System is required.'
  if (!values.requestedPriority) errors.requestedPriority = 'Requested Priority is required.'

  const summary = values.summary.trim()
  if (!summary) {
    errors.summary = 'Summary is required.'
  } else if (summary.length < 5 || summary.length > 150) {
    errors.summary = 'Summary must be between 5 and 150 characters.'
  }

  const description = values.description.trim()
  if (!description) {
    errors.description = 'Description is required.'
  } else if (description.length < 10 || description.length > 5000) {
    errors.description = 'Description must be between 10 and 5000 characters.'
  }

  return errors
}

// Create Ticket, core fields only (ui-spec.md §7). Attachments are ticket
// #19's scope.
function CreateTicket() {
  const [reference, setReference] = useState<ReferenceState>({ status: 'loading' })
  const [values, setValues] = useState<FormValues>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [failureMessage, setFailureMessage] = useState<string | null>(null)
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([fetchCategories(), fetchRelatedSystems()])
      .then(([categories, relatedSystems]) => {
        if (!cancelled) setReference({ status: 'success', categories, relatedSystems })
      })
      .catch((err) => {
        if (!cancelled) {
          setReference({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load Create Ticket options',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const updateField = (field: keyof FormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  const resetForm = () => {
    setValues(EMPTY_FORM)
    setFieldErrors({})
    setFailureMessage(null)
    setCreatedTicket(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return // AC-11: a second click cannot double-submit

    const errors = validate(values)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setFailureMessage(null)
    setSubmitting(true)
    try {
      const ticket = await createTicket({
        categoryId: Number(values.categoryId),
        relatedSystemId: Number(values.relatedSystemId),
        requestedPriority: values.requestedPriority as Priority,
        summary: values.summary,
        description: values.description,
      })
      setCreatedTicket(ticket)
    } catch (err) {
      // AC-12: entered field values are left untouched on failure.
      setFailureMessage(err instanceof Error ? err.message : 'Unable to create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  if (createdTicket) {
    return (
      <div className="create-ticket-confirmation container py-5" style={{ maxWidth: 640 }}>
        <h1 className="h3 mb-3">Ticket Created</h1>
        <p className="text-success mb-1">Your Ticket Number:</p>
        <p className="h4 mb-4">{createdTicket.ticketNumber}</p>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-primary" onClick={resetForm}>
            Create Another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="create-ticket container py-5" style={{ maxWidth: 720 }}>
      <h1 className="h3 mb-4">Create Ticket</h1>

      {reference.status === 'loading' && <p role="status">⏳ Loading form options…</p>}
      {reference.status === 'error' && (
        <p className="text-danger" role="alert">
          {reference.message}
        </p>
      )}

      {reference.status === 'success' && (
        <form onSubmit={handleSubmit} noValidate>
          {failureMessage && (
            <div className="alert alert-danger" role="alert">
              {failureMessage}
            </div>
          )}

          <div className="row mb-3">
            <div className="col-md-4">
              <label htmlFor="category" className="form-label">
                Category <span className="text-danger">*</span>
              </label>
              <select
                id="category"
                className="form-select"
                value={values.categoryId}
                onChange={(e) => updateField('categoryId', e.target.value)}
              >
                <option value="">Choose…</option>
                {reference.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {fieldErrors.categoryId && <div className="text-danger small mt-1">{fieldErrors.categoryId}</div>}
            </div>

            <div className="col-md-4">
              <label htmlFor="related-system" className="form-label">
                Related System <span className="text-danger">*</span>
              </label>
              <select
                id="related-system"
                className="form-select"
                value={values.relatedSystemId}
                onChange={(e) => updateField('relatedSystemId', e.target.value)}
              >
                <option value="">Choose…</option>
                {reference.relatedSystems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.name}
                  </option>
                ))}
              </select>
              {fieldErrors.relatedSystemId && (
                <div className="text-danger small mt-1">{fieldErrors.relatedSystemId}</div>
              )}
            </div>

            <div className="col-md-4">
              <label htmlFor="requested-priority" className="form-label">
                Requested Priority <span className="text-danger">*</span>
              </label>
              <select
                id="requested-priority"
                className="form-select"
                value={values.requestedPriority}
                onChange={(e) => updateField('requestedPriority', e.target.value)}
              >
                <option value="">Choose…</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
              {fieldErrors.requestedPriority && (
                <div className="text-danger small mt-1">{fieldErrors.requestedPriority}</div>
              )}
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor="summary" className="form-label">
              Summary <span className="text-danger">*</span>
            </label>
            <input
              id="summary"
              type="text"
              className="form-control"
              value={values.summary}
              onChange={(e) => updateField('summary', e.target.value)}
            />
            {fieldErrors.summary && <div className="text-danger small mt-1">{fieldErrors.summary}</div>}
          </div>

          <div className="mb-4">
            <label htmlFor="description" className="form-label">
              Description <span className="text-danger">*</span>
            </label>
            <textarea
              id="description"
              className="form-control"
              style={{ minHeight: 160, resize: 'vertical' }}
              value={values.description}
              onChange={(e) => updateField('description', e.target.value)}
            />
            {fieldErrors.description && <div className="text-danger small mt-1">{fieldErrors.description}</div>}
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={resetForm} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default CreateTicket
