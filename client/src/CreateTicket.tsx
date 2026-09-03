import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  createTicket,
  fetchCategories,
  fetchRelatedSystems,
  uploadAttachment,
  type Attachment,
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

// One selected/uploading/uploaded/failed Attachment (ui-spec.md §3 chip
// states). `pending` files haven't been sent yet — that only happens once
// the Ticket itself has been created (BR-16/ADR-0003).
interface AttachmentEntry {
  file: File
  status: 'pending' | 'uploading' | 'uploaded' | 'failed'
  error?: string
  attachment?: Attachment
}

// BR-13/BR-14/BR-15 mirrored client-side, same as the core fields above —
// the server independently re-validates (api-spec.md).
const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024
const MAX_ACTIVE_ATTACHMENTS = 5

function validateFile(file: File): string | null {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return `${file.name}: unsupported file type. Allowed types are JPG, PNG, WEBP, and PDF.`
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `${file.name}: exceeds the 5 MB limit.`
  }
  return null
}

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

// Create Ticket, core fields plus Attachments (ui-spec.md §7, ticket #19).
function CreateTicket() {
  const [reference, setReference] = useState<ReferenceState>({ status: 'loading' })
  const [values, setValues] = useState<FormValues>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [failureMessage, setFailureMessage] = useState<string | null>(null)
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null)
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([])
  const [attachmentPickError, setAttachmentPickError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setAttachments([])
    setAttachmentPickError(null)
  }

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files
    event.target.value = '' // allow re-selecting the same file after removing it

    if (!fileList || fileList.length === 0) return

    const additions: AttachmentEntry[] = []
    const errors: string[] = []
    let count = attachments.length

    for (const file of Array.from(fileList)) {
      const fileError = validateFile(file)
      if (fileError) {
        errors.push(fileError)
        continue
      }
      if (count >= MAX_ACTIVE_ATTACHMENTS) {
        errors.push(`${file.name}: you can attach up to ${MAX_ACTIVE_ATTACHMENTS} files per Ticket.`)
        continue
      }
      additions.push({ file, status: 'pending' })
      count++
    }

    // Every rejection in this selection is shown, not just the last one.
    setAttachmentPickError(errors.length > 0 ? errors.join(' ') : null)
    if (additions.length > 0) setAttachments((prev) => [...prev, ...additions])
  }

  const removePendingAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_entry, i) => i !== index))
  }

  // BR-16/ADR-0003: uploads fire sequentially, awaiting each response
  // before starting the next — required for the server's 5-active-limit
  // check (BR-15) to stay correct, not just a nicety.
  const uploadAttachmentsSequentially = async (ticketId: number, entries: AttachmentEntry[]) => {
    for (let i = 0; i < entries.length; i++) {
      setAttachments((prev) => prev.map((e, idx) => (idx === i ? { ...e, status: 'uploading' } : e)))
      try {
        const attachment = await uploadAttachment(ticketId, entries[i].file)
        setAttachments((prev) =>
          prev.map((e, idx) => (idx === i ? { ...e, status: 'uploaded', attachment, error: undefined } : e)),
        )
      } catch (err) {
        // BR-17: one failed file doesn't roll back the Ticket or any
        // already-successful upload — it's just marked failed, with retry.
        setAttachments((prev) =>
          prev.map((e, idx) =>
            idx === i
              ? { ...e, status: 'failed', error: err instanceof Error ? err.message : 'Upload failed' }
              : e,
          ),
        )
      }
    }
  }

  const retryAttachment = async (index: number) => {
    if (!createdTicket) return
    const entry = attachments[index]
    if (!entry || entry.status !== 'failed') return

    setAttachments((prev) => prev.map((e, idx) => (idx === index ? { ...e, status: 'uploading' } : e)))
    try {
      // Retry re-attempts only this file, via the same upload endpoint.
      const attachment = await uploadAttachment(createdTicket.id, entry.file)
      setAttachments((prev) =>
        prev.map((e, idx) => (idx === index ? { ...e, status: 'uploaded', attachment, error: undefined } : e)),
      )
    } catch (err) {
      setAttachments((prev) =>
        prev.map((e, idx) =>
          idx === index ? { ...e, status: 'failed', error: err instanceof Error ? err.message : 'Upload failed' } : e,
        ),
      )
    }
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
      if (attachments.length > 0) {
        await uploadAttachmentsSequentially(ticket.id, attachments)
      }
    } catch (err) {
      // AC-12: entered field values are left untouched on failure.
      setFailureMessage(err instanceof Error ? err.message : 'Unable to create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  if (createdTicket) {
    const uploadedCount = attachments.filter((e) => e.status === 'uploaded').length
    const stillWorking = attachments.some((e) => e.status === 'pending' || e.status === 'uploading')

    return (
      <div className="create-ticket-confirmation container py-5" style={{ maxWidth: 640 }}>
        <h1 className="h3 mb-3">Ticket Created</h1>
        <p className="text-success mb-1">Your Ticket Number:</p>
        <p className="h4 mb-4">{createdTicket.ticketNumber}</p>

        {attachments.length > 0 && (
          <div className="mb-4">
            <p className="mb-2">
              {stillWorking
                ? 'Uploading attachments…'
                : `${uploadedCount} of ${attachments.length} attachments uploaded`}
            </p>
            <ul className="list-unstyled d-flex flex-column gap-2">
              {attachments.map((entry, index) => (
                <li
                  key={`${entry.file.name}-${index}`}
                  className={`d-flex align-items-center gap-2 p-2 rounded border ${
                    entry.status === 'failed' ? 'border-danger' : 'border-secondary-subtle'
                  }`}
                >
                  <span className="flex-grow-1 text-truncate">{entry.file.name}</span>
                  {(entry.status === 'pending' || entry.status === 'uploading') && (
                    <span role="status" className="text-muted small">
                      Uploading…
                    </span>
                  )}
                  {entry.status === 'uploaded' && <span className="text-success small">Uploaded</span>}
                  {entry.status === 'failed' && (
                    <>
                      <span className="text-danger small" role="alert">
                        {entry.error ?? 'Upload failed'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => retryAttachment(index)}
                      >
                        Retry
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

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

          <div className="mb-4">
            <label htmlFor="attachments" className="form-label">
              Attachments
            </label>
            <input
              id="attachments"
              ref={fileInputRef}
              type="file"
              className="form-control"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFilesSelected}
              disabled={submitting}
            />
            <div className="form-text">JPG, PNG, WEBP, or PDF — up to 5 MB each, up to 5 files.</div>
            {attachmentPickError && (
              <div className="text-danger small mt-1" role="alert">
                {attachmentPickError}
              </div>
            )}

            {attachments.length > 0 && (
              <ul className="list-unstyled d-flex flex-column gap-2 mt-2">
                {attachments.map((entry, index) => (
                  <li
                    key={`${entry.file.name}-${index}`}
                    className="d-flex align-items-center gap-2 p-2 rounded border border-secondary-subtle"
                  >
                    <span className="flex-grow-1 text-truncate">{entry.file.name}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      aria-label={`Remove ${entry.file.name}`}
                      onClick={() => removePendingAttachment(index)}
                      disabled={submitting}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
