import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  ApiError,
  fetchInternalNotes,
  fetchPublicComments,
  postInternalNote,
  postPublicComment,
  type Entry,
} from './api'
import { RoleBadge } from './badges'
import { ConflictNotice, InlineAlert, SAFE_FAILURE_MESSAGE, SuccessNotice } from './feedback'

// What tells a thread of Public Comments from one of Internal Notes: its
// words, its limit (BR-35), and its two endpoints. Nothing is shared
// between the two but the layout (ADR-0010).
interface Kind {
  // Prefix of the element ids, so both threads can be in one document.
  id: string
  composerLabel: string
  maxLength: number
  required: string
  tooLong: string
  loading: string
  empty: string
  posted: string
  load: (ticketId: number) => Promise<Entry[]>
  post: (ticketId: number, body: string) => Promise<Entry>
}

const KINDS = {
  comment: {
    id: 'public-comment',
    composerLabel: 'Add a comment',
    maxLength: 2000,
    required: 'A comment is required.',
    tooLong: 'A comment must be at most 2000 characters.',
    loading: 'Loading comments…',
    empty: 'No comments yet.',
    posted: 'Comment posted',
    load: (ticketId) => fetchPublicComments(ticketId),
    post: (ticketId, body) => postPublicComment(ticketId, body),
  },
  note: {
    id: 'internal-note',
    composerLabel: 'Add an internal note',
    maxLength: 4000,
    required: 'A note is required.',
    tooLong: 'A note must be at most 4000 characters.',
    loading: 'Loading internal notes…',
    empty: 'No internal notes yet.',
    posted: 'Internal note added',
    load: (ticketId) => fetchInternalNotes(ticketId),
    post: (ticketId, body) => postInternalNote(ticketId, body),
  },
} satisfies Record<string, Kind>

type ListState = { status: 'loading' } | { status: 'success'; entries: Entry[] } | { status: 'error' }

// What the last attempt to post came to, shown at the top of the thread.
type PostOutcome = 'posted' | 'conflict' | 'failure' | null

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// "Wichai Phromma" → "WP": the first letters of the first and last words.
function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words

  return letters.map((word) => word.charAt(0).toUpperCase()).join('')
}

// One Public Comment or Internal Note. The body is plain text (BR-35):
// React renders it as text, the stylesheet keeps its line breaks and wraps
// long words.
function EntryItem({ entry }: { entry: Entry }) {
  return (
    <li className="tk-comment">
      <span className="tk-comment__avatar" aria-hidden="true">
        {initials(entry.author.name)}
      </span>
      <div className="tk-comment__content">
        <div className="tk-comment__meta">
          <span className="fw-semibold">{entry.author.name}</span>
          <RoleBadge role={entry.author.role} />
          <time className="text-muted small" dateTime={entry.createdAt}>
            {formatDateTime(entry.createdAt)}
          </time>
        </div>
        <p className="tk-comment__body">{entry.body}</p>
      </div>
    </li>
  )
}

// The entries of one kind on a Ticket, newest first, under a composer
// (docs/lab-03/ui-spec.md §7.3, §9.3, §9.4). `finished` is what stands in
// place of the composer on a finished Ticket, which takes no more entries
// (BR-31). Mount it with the Ticket id as its `key`: it loads once per
// Ticket.
function EntryThread({
  kind,
  ticketId,
  header,
  submitLabel,
  submitClassName,
  finished,
  onConflict,
  onCount,
  onPosted,
}: {
  kind: keyof typeof KINDS
  ticketId: number
  // What stands above the composer: a title with the count, a caption.
  header: (count: number | null) => ReactNode
  submitLabel: string
  submitClassName: string
  finished: ReactNode | null
  // The Ticket was finished meanwhile: load it again.
  onConflict: () => void
  // How many entries the thread holds, once it knows.
  onCount?: (count: number) => void
  onPosted?: (entry: Entry) => void
}) {
  const { id, composerLabel, maxLength, required, tooLong, loading, empty, posted, load, post } = KINDS[kind]
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [text, setText] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [outcome, setOutcome] = useState<PostOutcome>(null)
  // What is validated, counted, and sent is the trimmed content.
  const body = text.trim()
  const count = list.status === 'success' ? list.entries.length : null

  useEffect(() => {
    let cancelled = false

    load(ticketId)
      .then((entries) => {
        if (!cancelled) setList({ status: 'success', entries })
      })
      .catch(() => {
        if (!cancelled) setList({ status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [load, ticketId, loadAttempt])

  useEffect(() => {
    if (count !== null) onCount?.(count)
  }, [count, onCount])

  const retryLoad = () => {
    setList({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }

  const validate = (): string | null => {
    if (body === '') return required
    if (body.length > maxLength) return tooLong
    return null
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (posting) return

    setOutcome(null)
    const invalid = validate()
    setFieldError(invalid)
    if (invalid) return

    setPosting(true)
    try {
      const entry = await post(ticketId, body)
      if (list.status === 'success') {
        setList({ status: 'success', entries: [entry, ...list.entries] })
      } else {
        retryLoad()
      }
      setText('')
      setOutcome('posted')
      onPosted?.(entry)
    } catch (err) {
      // In every case the typed text stays in the composer.
      if (err instanceof ApiError && err.status === 409) {
        setOutcome('conflict')
        onConflict()
      } else if (err instanceof ApiError && err.status === 400 && err.field === 'body') {
        // The API's message, under the textarea it concerns.
        setFieldError(err.message)
      } else {
        setOutcome('failure')
      }
    } finally {
      setPosting(false)
    }
  }

  return (
    <>
      {header(count)}

      {outcome === 'posted' && <SuccessNotice>{posted}</SuccessNotice>}
      {outcome === 'conflict' && <ConflictNotice />}
      {outcome === 'failure' && <InlineAlert variant="error">{SAFE_FAILURE_MESSAGE}</InlineAlert>}

      {finished ? (
        <p className="tk-comments__finished">{finished}</p>
      ) : (
        <form className="mb-3" noValidate onSubmit={handleSubmit}>
          <label htmlFor={`${id}-body`} className="form-label">
            {composerLabel}
          </label>
          <textarea
            id={`${id}-body`}
            className={`form-control ${fieldError ? 'is-invalid' : ''}`}
            rows={3}
            value={text}
            readOnly={posting}
            aria-invalid={fieldError !== null}
            aria-describedby={`${id}-count ${id}-error`}
            onChange={(event) => {
              setText(event.target.value)
              setFieldError(null)
            }}
          />
          <div className="d-flex justify-content-between gap-3 mt-1">
            <div id={`${id}-error`} className="invalid-feedback d-block">
              {fieldError}
            </div>
            <div id={`${id}-count`} className="tk-comments__count text-muted small">
              {body.length} / {maxLength}
            </div>
          </div>
          <button
            type="submit"
            className={`tk-comments__post btn ${submitClassName} mt-2`}
            disabled={posting}
            aria-busy={posting}
          >
            {posting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            {submitLabel}
          </button>
        </form>
      )}

      {list.status === 'loading' && (
        <div role="status">
          <span className="visually-hidden">{loading}</span>
          <div className="tk-skeleton" />
          <div className="tk-skeleton" />
          <div className="tk-skeleton" />
        </div>
      )}

      {list.status === 'error' && (
        <InlineAlert variant="error">
          {SAFE_FAILURE_MESSAGE}{' '}
          <button type="button" className="btn btn-link p-0 align-baseline" onClick={retryLoad}>
            Retry
          </button>
        </InlineAlert>
      )}

      {list.status === 'success' && list.entries.length === 0 && <p className="text-muted mb-0">{empty}</p>}

      {list.status === 'success' && list.entries.length > 0 && (
        <ul className="list-unstyled mb-0">
          {list.entries.map((entry) => (
            <EntryItem key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </>
  )
}

export default EntryThread
