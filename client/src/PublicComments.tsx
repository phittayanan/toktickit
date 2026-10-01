import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, fetchPublicComments, postPublicComment, type Entry } from './api'
import { RoleBadge } from './badges'
import { ConflictNotice, InlineAlert, SAFE_FAILURE_MESSAGE, SuccessNotice } from './feedback'

// BR-35, in the words of POST /api/tickets/:id/comments (api-spec.md
// §6.1): trimmed, not empty, at most 2000 characters.
const MAX_LENGTH = 2000

function validate(body: string): string | null {
  if (body === '') return 'A comment is required.'
  if (body.length > MAX_LENGTH) return `A comment must be at most ${MAX_LENGTH} characters.`
  return null
}

type ListState = { status: 'loading' } | { status: 'success'; comments: Entry[] } | { status: 'error' }

// What the last attempt to post came to, shown at the top of the card.
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

// One Public Comment. The body is plain text (BR-35): React renders it as
// text, the stylesheet keeps its line breaks and wraps long words.
function Comment({ comment }: { comment: Entry }) {
  return (
    <li className="tk-comment">
      <span className="tk-comment__avatar" aria-hidden="true">
        {initials(comment.author.name)}
      </span>
      <div className="tk-comment__content">
        <div className="tk-comment__meta">
          <span className="fw-semibold">{comment.author.name}</span>
          <RoleBadge role={comment.author.role} />
          <time className="text-muted small" dateTime={comment.createdAt}>
            {formatDateTime(comment.createdAt)}
          </time>
        </div>
        <p className="tk-comment__body">{comment.body}</p>
      </div>
    </li>
  )
}

// Public Comments (docs/lab-03/ui-spec.md §7.3): the messages on a Ticket
// that its Requester and Staff both see, newest first. A finished Ticket
// (`finishedAs`) takes no more of them (BR-31), so it has no composer.
// Mount it with the Ticket id as its `key`: it loads once per Ticket.
function PublicComments({
  ticketId,
  finishedAs,
  onConflict,
}: {
  ticketId: number
  finishedAs: 'closed' | 'cancelled' | null
  // The Ticket was finished meanwhile: load it again.
  onConflict: () => void
}) {
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [text, setText] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [outcome, setOutcome] = useState<PostOutcome>(null)
  // What is validated, counted, and sent is the trimmed content.
  const body = text.trim()

  useEffect(() => {
    let cancelled = false

    fetchPublicComments(ticketId)
      .then((comments) => {
        if (!cancelled) setList({ status: 'success', comments })
      })
      .catch(() => {
        if (!cancelled) setList({ status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [ticketId, loadAttempt])

  const retryLoad = () => {
    setList({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (posting) return

    setOutcome(null)
    const invalid = validate(body)
    setFieldError(invalid)
    if (invalid) return

    setPosting(true)
    try {
      const comment = await postPublicComment(ticketId, body)
      if (list.status === 'success') {
        setList({ status: 'success', comments: [comment, ...list.comments] })
      } else {
        retryLoad()
      }
      setText('')
      setOutcome('posted')
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
    <section className="tk-comments card mb-4" aria-labelledby="public-comments-title">
      <div className="card-body">
        <h2 id="public-comments-title" className="h5 mb-1">
          Public Comments{list.status === 'success' && ` (${list.comments.length})`}
        </h2>
        <p className="text-muted small mb-3">Visible to you and IT Staff.</p>

        {outcome === 'posted' && <SuccessNotice>Comment posted</SuccessNotice>}
        {outcome === 'conflict' && <ConflictNotice />}
        {outcome === 'failure' && <InlineAlert variant="error">{SAFE_FAILURE_MESSAGE}</InlineAlert>}

        {finishedAs ? (
          <p className="tk-comments__finished">
            This ticket is {finishedAs}. Create a new ticket if you need more help.
          </p>
        ) : (
          <form className="mb-3" noValidate onSubmit={handleSubmit}>
            <label htmlFor="public-comment-body" className="form-label">
              Add a comment
            </label>
            <textarea
              id="public-comment-body"
              className={`form-control ${fieldError ? 'is-invalid' : ''}`}
              rows={3}
              value={text}
              readOnly={posting}
              aria-invalid={fieldError !== null}
              aria-describedby="public-comment-count public-comment-error"
              onChange={(event) => {
                setText(event.target.value)
                setFieldError(null)
              }}
            />
            <div className="d-flex justify-content-between gap-3 mt-1">
              <div id="public-comment-error" className="invalid-feedback d-block">
                {fieldError}
              </div>
              <div id="public-comment-count" className="tk-comments__count text-muted small">
                {body.length} / {MAX_LENGTH}
              </div>
            </div>
            <button type="submit" className="tk-comments__post btn btn-primary mt-2" disabled={posting} aria-busy={posting}>
              {posting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
              Post Comment
            </button>
          </form>
        )}

        {list.status === 'loading' && (
          <div role="status">
            <span className="visually-hidden">Loading comments…</span>
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

        {list.status === 'success' && list.comments.length === 0 && <p className="text-muted mb-0">No comments yet.</p>}

        {list.status === 'success' && list.comments.length > 0 && (
          <ul className="list-unstyled mb-0">
            {list.comments.map((comment) => (
              <Comment key={comment.id} comment={comment} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default PublicComments
