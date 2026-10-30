# TokTickIT

A ticketing system for KMUTT IT support requests. This context covers the
Requester-facing side introduced in Lab 2 and the authenticated roles, IT
Staff workflow, and user administration introduced in Lab 3.

## Language

### People and access

**User**:
A person with an account: one email address, one Role, and an activation
state. Also the Prisma model name.
_Avoid_: account (as the noun for the person), member.

**Role**:
The single permission set a User holds: Requester, IT Staff, or
Administrator.
_Avoid_: group, permission level.

**Requester**:
A User whose Role is Requester: the person who submits Tickets, which
are then theirs.
_Avoid_: customer, end user, client.

**IT Staff**:
A User whose Role is IT Staff: works Tickets from the Ticket Queue.
_Avoid_: agent, technician, support.

**Administrator**:
A User whose Role is Administrator: manages Users, and also holds every IT
Staff ticket permission.
_Avoid_: admin user, superuser.

**Staff**:
Shorthand for "IT Staff or Administrator" where a rule applies to both.
It is not a Role.

**Session**:
The server-side record that a User is signed in, referenced from a cookie.
_Avoid_: JWT, access token, login (as a noun for the record).

**Initial Password**:
A system-generated temporary password, shown once to the Administrator who
issued it, that the User must replace at their next sign-in.
_Avoid_: default password, reset link.

**Deactivation**:
Making a User inactive so they cannot sign in. Users are never deleted.
_Avoid_: delete, remove, ban, lock.

**Development Requester** / **RequesterUser** (retired):
The Lab 2 identity that was chosen from a selector instead of
authenticated, and its Prisma model. Replaced in Lab 3 by User and Session.
Use only when describing Lab 2 or the migration.

### Tickets

**Ticket**:
An IT support request.

**Ticket Number**:
The official, unique, human-readable identifier for a Ticket, formatted
`TKT-YYYY-NNNNNN`.
_Avoid_: ID.

**Current Status**:
The Ticket's lifecycle state: New, Open, In Progress, Waiting for
Requester, Resolved, Closed, Reopened, or Cancelled.

**Finished** / **Unfinished**:
A Ticket is finished when its Current Status is Closed or Cancelled, and
is then read-only. Every other Ticket, including a Resolved one, is
unfinished.
_Avoid_: done, completed, open (ambiguous with the Open status), active
(reserved for a User's activation state).

**Requested Priority**:
The priority the Requester selects at creation. It never changes.
_Avoid_: priority (ambiguous with IT Priority).

**IT Priority**:
The priority Staff work to. It starts as a copy of the Requested Priority
and only Staff change it.

**Ticket Owner**:
The one Staff User responsible for working a Ticket. A Ticket may have
none, in which case it is unassigned. Distinct from the Requester, who
submitted it: "a Requester's own Tickets" and "ownership protection" are
about the Requester, never the Ticket Owner.
_Avoid_: assignee.

**Claim**:
A Staff User making themselves the Ticket Owner of an unassigned Ticket.
_Avoid_: take, grab, pick up.

**Ticket Queue**:
The shared list of all Requesters' Tickets that Staff work from.
_Avoid_: dashboard, inbox, backlog.

**Resolution Summary**:
The text Staff write when moving a Ticket to Resolved, visible to the
Requester.
_Avoid_: resolution note (collides with Internal Note), fix description.

**Problem Appears Resolved**:
The Requester's signal that the problem seems fixed. It is a flag on the
Ticket, not a Current Status, and Staff alone decide whether to resolve.
_Avoid_: mark as resolved, requester-resolved status.

**Public Comment**:
A message on a Ticket visible to its Requester and to Staff.
_Avoid_: reply, message, note.

**Internal Note**:
A note on a Ticket visible only to Staff, never to the Requester.
_Avoid_: private comment, comment.

**Ticket Change**:
An action that writes to an Unfinished Ticket: changing its Ticket Owner,
IT Priority, or Current Status; Problem Appears Resolved; adding a Public
Comment or Internal Note; adding or removing an Attachment. Every Ticket
Change records the last-updated time, except an Internal Note and Attachment
changes. A Finished Ticket takes no Ticket Change.
_Avoid_: ticket update, ticket edit.

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
