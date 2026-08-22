# TokTickIT

A ticketing system for KMUTT IT support requests. This context covers the
Requester-facing side introduced in Lab 2.

## Language

**Requester** / **Development Requester**:
The end user who owns and submits Tickets. In Lab 2 this identity is
chosen, not authenticated.
_Avoid_: user, account, login.

**RequesterUser**:
The Prisma model name for that same identity at the implementation layer.
_Avoid_: User, Session.

**Ticket**:
An IT support request.

**Ticket Number**:
The official, unique, human-readable identifier for a Ticket, formatted
`TKT-YYYY-NNNNNN`.
_Avoid_: ID.

**Current Status**:
The Ticket's lifecycle state.

**Requested Priority**:
The priority the Requester selects at creation.
_Avoid_: priority (ambiguous with IT Priority).

**IT Priority**:
The priority IT Staff sets, distinct from Requested Priority.

**Category**:
The fixed top-level classification of a Ticket.

**Related System**:
The specific service, application, or device a Ticket concerns.

**Attachment**:
A supporting file uploaded to a Ticket.

**Soft removal**:
Marking a record inactive without deleting it, keeping its data rather than
erasing it.
_Avoid_: delete, hard delete.
