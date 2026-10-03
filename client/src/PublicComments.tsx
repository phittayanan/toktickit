import EntryThread from './EntryThread'

// Public Comments (docs/lab-03/ui-spec.md §7.3): the messages on a Ticket
// that its Requester and Staff both see, newest first, as the Requester's
// Ticket Detail shows them. A finished Ticket (`finishedAs`) takes no more
// of them (BR-31), so it has no composer. Mount it with the Ticket id as
// its `key`: it loads once per Ticket.
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
  return (
    <section className="tk-comments card mb-4" aria-labelledby="public-comments-title">
      <div className="card-body">
        <EntryThread
          kind="comment"
          ticketId={ticketId}
          header={(count) => (
            <>
              <h2 id="public-comments-title" className="h5 mb-1">
                Public Comments{count !== null && ` (${count})`}
              </h2>
              <p className="text-muted small mb-3">Visible to you and IT Staff.</p>
            </>
          )}
          submitLabel="Post Comment"
          submitClassName="btn-primary"
          finished={finishedAs && `This ticket is ${finishedAs}. Create a new ticket if you need more help.`}
          onConflict={onConflict}
        />
      </div>
    </section>
  )
}

export default PublicComments
