# Lab 3 API Contract

Extends `docs/lab-02/api-spec.md`. Rule and criterion numbers (BR, AC)
refer to `specification.md` in this folder. "Staff" means IT Staff or
Administrator; a "finished" Ticket is Closed or Cancelled.

## 1. Conventions

### 1.1 Transport

- Base URL as in Lab 2 (`http://localhost:4000` in development). Bodies
  are JSON unless stated. Timestamps are ISO 8601 UTC strings.
- The client sends credentials on every request (`credentials: 'include'`).
- CORS allows exactly one origin, `CLIENT_ORIGIN` (default
  `http://localhost:5173`), with credentials. The Lab 2 wildcard is
  removed.
- Enumerations on the wire:
  - Role: `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`.
  - Priority: `LOW`, `MEDIUM`, `HIGH`.
  - Status: `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`,
    `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`.

### 1.2 Session cookie

| Property | Value |
|---|---|
| Name | `tk_session` |
| Value | Opaque random reference; carries no user data |
| Attributes | `HttpOnly; SameSite=Strict; Path=/`, plus `Secure` when `NODE_ENV=production` |
| Lifetime | No `Max-Age`. The server expires a session unused for 8 hours (BR-13) |
| Set by | `POST /api/auth/login`; reissued with a new value by `POST /api/auth/change-password` |
| Cleared by | `POST /api/auth/logout` (`Max-Age=0`) |

No token is returned in any body and nothing is stored in `localStorage`
or `sessionStorage`. The `X-Requester-Id` header and any `requesterId`
supplied by the client are ignored everywhere (BR-03).

### 1.3 CSRF

A `POST`, `PUT`, `PATCH`, or `DELETE` whose `Origin` header is present and
differs from `CLIENT_ORIGIN` is rejected `403` `ORIGIN_NOT_ALLOWED` before
anything else (BR-15). A request with no `Origin` header (a non-browser
client) is not rejected by this rule. No `GET` changes state.

### 1.4 Errors

Every error body is:

```json
{ "error": "Human-readable, safe to display", "code": "MACHINE_CODE" }
```

A validation error on one field adds `"field": "<name>"`.

Every error defined in this document carries `code`. The `400`, `404`,
and `500` bodies that the Lab 2 endpoints already return
(`docs/lab-02/api-spec.md`) are left exactly as they are, without `code`,
so nothing that depends on them changes. The same endpoints' new `401`,
`403`, and `409` responses do carry it.

| Status | `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing, malformed, or out-of-range input, including query parameters |
| 401 | `UNAUTHENTICATED` | No session, or it is expired or ended |
| 401 | `INVALID_CREDENTIALS` | Login failed (generic, BR-10) |
| 403 | `ACCOUNT_INACTIVE` | Correct password on an inactive account (BR-11) |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Signed in, but the password must be changed first (BR-02) |
| 403 | `FORBIDDEN` | The role may not use this endpoint |
| 403 | `ORIGIN_NOT_ALLOWED` | §1.3 |
| 404 | `NOT_FOUND` | Resource missing, or a Requester's request for a resource that is not theirs |
| 409 | `EMAIL_TAKEN` | Email belongs to another user |
| 409 | `OWNER_CHANGED` | `expectedOwnerId` is stale |
| 409 | `STATUS_CHANGED` | `expectedStatus` is stale |
| 409 | `INVALID_TRANSITION` | Transition not in the BR-28 matrix |
| 409 | `OWNER_REQUIRED` | Resolving a Ticket that has no owner |
| 409 | `TICKET_FINISHED` | Any change to a Closed or Cancelled Ticket |
| 409 | `INDICATION_NOT_AVAILABLE` | Problem Appears Resolved on a Resolved Ticket |
| 409 | `SELF_DEACTIVATION` | An Administrator deactivating their own account |
| 409 | `SELF_INITIAL_PASSWORD` | An Administrator setting an initial password on their own account |
| 409 | `LAST_ADMINISTRATOR` | The change would leave no active Administrator |
| 429 | `LOGIN_THROTTLED` | Login refused for this email (BR-12) |
| 500 | `INTERNAL_ERROR` | Unexpected failure; always the generic body |

An unknown `/api` path, or a method a path does not define, answers `404`
`NOT_FOUND` in the same JSON shape, after the session and role checks of
§1.5 that apply to its prefix. So an unknown path with no session is
`401`, and a Requester gets `403` for anything under `/api/staff` or
`/api/admin`, defined or not.

A `500` body is always `{ "error": "Something went wrong. Please try
again.", "code": "INTERNAL_ERROR" }` or the endpoint's Lab 2 generic text.
No response contains a stack trace, SQL, a file path, or a password hash
(BR-49).

### 1.5 Order of checks

Every endpoint except `GET /api/health`, `POST /api/auth/login`, and
`POST /api/auth/logout` runs these in order and reports the first failure
(BR-19, ADR-0009):

1. Session: none, expired, or belonging to a user who is now inactive →
   `401` `UNAUTHENTICATED`.
2. Password change required → `403` `PASSWORD_CHANGE_REQUIRED`. Exempt:
   `GET /api/auth/me`, `POST /api/auth/change-password`.
3. Role not permitted for the endpoint → `403` `FORBIDDEN`. This runs
   before any path id, body, or resource is examined. The role is fixed by
   prefix: `/api/staff` needs staff, `/api/admin` needs Administrator.
4. Resource lookup and ownership → `404` `NOT_FOUND`.

The endpoints new in Lab 3 continue in this order, so a request that is
wrong in several ways has one defined answer:

5. Body or query validation → `400`. This includes an `ownerId` that is
   not an eligible owner.
6. The Ticket is Closed or Cancelled → `409` `TICKET_FINISHED`.
7. A stale `expectedOwnerId` or `expectedStatus` → `409` `OWNER_CHANGED`
   or `STATUS_CHANGED`.
8. A rule about the current state → `409` `INVALID_TRANSITION`, then
   `OWNER_REQUIRED`; or `INDICATION_NOT_AVAILABLE`.

For user changes (§7.3) the order after validation is `EMAIL_TAKEN`,
`SELF_DEACTIVATION`, `LAST_ADMINISTRATOR`. On the two Lab 2 Attachment
endpoints `TICKET_FINISHED` is checked directly after step 4.

Role and activation are read from the database on each request, not from
the session.

### 1.6 Caching

Every `/api/auth/*` and `/api/admin/*` response carries
`Cache-Control: no-store`.

### 1.7 Shared shapes

`UserIdentity`, returned by the authentication endpoints:

```json
{
  "id": 7,
  "name": "Somchai Jaidee",
  "email": "somchai.jaidee@kmutt.ac.th",
  "role": "REQUESTER",
  "mustChangePassword": false
}
```

`Entry`, a Public Comment or an Internal Note:

```json
{
  "id": 31,
  "body": "We are checking the VPN gateway logs.",
  "createdAt": "2026-10-02T03:15:00.000Z",
  "author": { "id": 12, "name": "Wichai Phromma", "role": "IT_STAFF" }
}
```

`author.role` is the author's current role. `body` is plain text; clients
render it as text (BR-35).

## 2. Authentication

### POST /api/auth/login

Public.

- **Request**: `{ "email": "somchai.jaidee@kmutt.ac.th", "password": "…" }`.
  The email is trimmed and lower-cased before lookup.
- **Success `200`**: `UserIdentity`, with `Set-Cookie: tk_session=…`. A new
  session is always created; a session cookie sent with the request is not
  reused.
- **`400`**: `email` or `password` missing, empty, or not a string; `email`
  longer than 254 characters. `field` names it.
- **`401` `INVALID_CREDENTIALS`**: `"Invalid email or password."` for an
  unknown email, a wrong password, or a user with no password. A password
  comparison is performed in every case so timing does not distinguish
  them.
- **`403` `ACCOUNT_INACTIVE`**: `"This account is inactive. Contact an
  administrator."`, only when the password is correct. No cookie is set.
- **`429` `LOGIN_THROTTLED`**: `"Too many failed sign-in attempts. Try
  again later."` with a `Retry-After` header in seconds. The password is
  not checked while throttled.

Throttle (BR-12), keyed by the normalised email whether or not it matches
a user:

- Each `401` from this endpoint counts as a failure and its time is
  recorded. Only failures in the 15 minutes before now count.
- A failure that brings that count to five is itself answered `401` and
  starts a 15-minute refusal. Every login for that email during it is
  `429`.
- When the refusal ends no earlier failure counts any more. A `200` also
  clears the recorded failures. A `403` `ACCOUNT_INACTIVE` neither counts
  nor clears.

### POST /api/auth/logout

- **Success `204`**: the session row is deleted and the cookie cleared.
  Also `204` when there is no session, so logout is safe to repeat.

### GET /api/auth/me

- **Success `200`**: `UserIdentity`.
- **`401`**: no valid session.

### POST /api/auth/change-password

Any signed-in user, including one who must change their password.

- **Request**:
  ```json
  {
    "currentPassword": "…",
    "newPassword": "…",
    "confirmPassword": "…"
  }
  ```
- **Success `200`**: `UserIdentity` with `mustChangePassword: false`, and a
  `Set-Cookie` carrying a new session value. The user's other sessions are
  deleted (BR-09).
- **`400`**, with `field`:
  - `currentPassword`: missing, or `"Current password is incorrect."`
  - `newPassword`: missing; shorter than 8 or longer than 72 characters, or
    longer than 72 bytes in UTF-8;
    lacking an upper-case letter, a lower-case letter, a digit, or a
    special character; or equal to the current password. The message names
    the first unmet rule.
  - `confirmPassword`: missing or different from `newPassword`.

  On any `400` nothing changes.

## 3. Reference data

`GET /api/categories` and `GET /api/related-systems` are unchanged in
shape and now require a session of any role. `GET /api/health` stays
public. `GET /api/requesters` is removed and is answered like any unknown
path (§1.4): `404` with a session, `401` without.

## 4. Requester Tickets

Role Requester only; staff get `403`. The acting Requester is the session
user. A Ticket or Attachment that is missing or belongs to another
Requester answers the unchanged Lab 2 `404` body (BR-20).

### 4.1 Continued from Lab 2

The request shapes, validation, and success bodies of
`docs/lab-02/api-spec.md` stand, with these changes:

| Endpoint | Change |
|---|---|
| All | The `X-Requester-Id` contract and its `400` are gone; a missing session is `401`. |
| `POST /api/tickets` | `itPriority` equals `requestedPriority` (BR-26). The body has exactly the Lab 2 fields. |
| `GET /api/tickets` | `itPriority` is never null. `currentStatus` accepts all eight statuses. |
| `GET /api/tickets/:id` | Adds the four fields below. |
| `POST /api/tickets/:id/attachments`, `POST /api/attachments/:id/remove` | Add `409` `TICKET_FINISHED` on a finished Ticket (BR-31). |

`GET /api/tickets/:id` adds:

```json
{
  "ownerName": "Wichai Phromma",
  "resolutionSummary": "Replaced the battery; charge now holds for 7 hours.",
  "resolvedAt": "2026-10-03T08:00:00.000Z",
  "requesterResolvedAt": null
}
```

`ownerName` is null when unassigned. `resolutionSummary` and `resolvedAt`
are null until the Ticket is first resolved and afterwards hold the latest
resolution. No Requester response contains an Internal Note or a count of
Internal Notes.

### 4.2 PUT /api/tickets/:id/resolution-indication

Records that the problem appears resolved (BR-33). No body.

- **Success `200`**: `{ "requesterResolvedAt": "2026-10-02T04:00:00.000Z" }`.
  Repeating it keeps the original timestamp. Status is not changed.
- **`404`**: missing or not owned.
- **`409` `INDICATION_NOT_AVAILABLE`**: the Ticket is Resolved.
- **`409` `TICKET_FINISHED`**: the Ticket is Closed or Cancelled.

### 4.3 DELETE /api/tickets/:id/resolution-indication

Withdraws the indication.

- **Success `200`**: `{ "requesterResolvedAt": null }`, also when none was
  set.
- **`404`**, **`409` `TICKET_FINISHED`**: as above.

## 5. Staff Tickets

Role IT Staff or Administrator; a Requester gets `403` for every path
under `/api/staff`, whatever the id. A nonexistent Ticket id answers `404`
`{ "error": "Ticket not found", "code": "NOT_FOUND" }`.

### 5.1 GET /api/staff/tickets

The Ticket Queue: Tickets of all Requesters (BR-44).

| Parameter | Values | Default | Behaviour |
|---|---|---|---|
| `page` | integer ≥ 1 | `1` | A page past the last returns `200` with empty `data` |
| `pageSize` | `10`, `25`, `50` | `10` | |
| `search` | string, at most 100 characters | none | Trimmed; empty is ignored. Case-insensitive substring match on Ticket Number, Summary, or Requester name |
| `status` | one or more Status values, comma-separated | all | Tickets in any listed status |
| `owner` | `unassigned`, `me`, or a user id | none | `me` is the session user |
| `itPriority` | Priority | none | |
| `categoryId` | integer ≥ 1 | none | |
| `appearsResolved` | `true`, `false` | none | Whether the Requester's indication is set |
| `sortBy` | `updatedAt`, `createdAt`, `ticketNumber`, `itPriority` | `updatedAt` | `itPriority` orders Low, Medium, High |
| `sortDir` | `asc`, `desc` | `desc` | Ties are broken by `id` descending |

- **Searchable**: Ticket Number, Summary, Requester name.
- **Filterable**: status, owner, IT Priority, Category, appears-resolved.
  Filters combine with AND, and with `search`.
- **Sortable**: last updated, created, Ticket Number, IT Priority.
- **Invalid parameter**: any value outside the table (for example
  `pageSize=7`, `status=DONE`, `owner=abc`, `sortBy=summary`, a repeated
  parameter) is `400` `VALIDATION_ERROR` with `field` naming the
  parameter. Nothing is silently defaulted. A well-formed `owner` or
  `categoryId` that matches no row yields an empty result, not an error.
  Unknown parameter names are ignored.

- **Success `200`**:
  ```json
  {
    "data": [
      {
        "id": 42,
        "ticketNumber": "TKT-2026-000123",
        "summary": "Laptop battery drains quickly",
        "requester": { "id": 7, "name": "Somchai Jaidee" },
        "category": { "id": 2, "name": "Hardware" },
        "requestedPriority": "MEDIUM",
        "itPriority": "HIGH",
        "currentStatus": "IN_PROGRESS",
        "owner": { "id": 12, "name": "Wichai Phromma" },
        "requesterResolvedAt": null,
        "createdAt": "2026-10-01T02:15:00.000Z",
        "updatedAt": "2026-10-02T03:15:00.000Z"
      }
    ],
    "meta": { "page": 1, "pageSize": 10, "totalItems": 37, "totalPages": 4 }
  }
  ```
  `owner` is null when unassigned. `meta` has the Lab 2 shape;
  `totalItems` counts Tickets matching the search and filters, and
  `totalPages` is 0 when there are none.

### 5.2 GET /api/staff/tickets/:id

- **Success `200`**, the `StaffTicket` shape, also returned by §5.4 to
  §5.6:
  ```json
  {
    "id": 42,
    "ticketNumber": "TKT-2026-000123",
    "summary": "Laptop battery drains quickly",
    "description": "…",
    "requester": { "id": 7, "name": "Somchai Jaidee", "email": "somchai.jaidee@kmutt.ac.th", "isActive": true },
    "category": { "id": 2, "name": "Hardware" },
    "relatedSystem": { "id": 5, "name": "Printing" },
    "requestedPriority": "MEDIUM",
    "itPriority": "HIGH",
    "currentStatus": "IN_PROGRESS",
    "allowedTransitions": ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    "owner": { "id": 12, "name": "Wichai Phromma" },
    "ownerChangedAt": "2026-10-01T04:00:00.000Z",
    "resolutionSummary": null,
    "resolvedAt": null,
    "requesterResolvedAt": null,
    "publicCommentCount": 3,
    "internalNoteCount": 2,
    "attachments": [],
    "createdAt": "2026-10-01T02:15:00.000Z",
    "updatedAt": "2026-10-02T03:15:00.000Z"
  }
  ```
  `allowedTransitions` lists the BR-28 targets from the current status and
  is empty for a finished Ticket. `attachments` has the Lab 2 element
  shape, active and soft-removed alike.
- **`404`**: no such Ticket.

### 5.3 GET /api/staff/eligible-owners

Users who can be made Ticket Owner: active IT Staff and Administrators,
ordered by name.

- **Success `200`**: `[{ "id": 12, "name": "Wichai Phromma", "role": "IT_STAFF" }]`.

### 5.4 PUT /api/staff/tickets/:id/owner

Claim, assign, reassign, or unassign (BR-21 to BR-24).

- **Request**: `{ "ownerId": 12, "expectedOwnerId": null }`. Both keys are
  required. `ownerId` is a user id, or null to unassign.
  `expectedOwnerId` is the owner id the client last saw, or null if it saw
  the Ticket unassigned. A claim is `ownerId` set to the session user.
- **Success `200`**: `StaffTicket`. `ownerChangedAt` is set to now whenever
  the owner changes, including to unassigned. If the Ticket was `NEW` and
  now has an owner, `currentStatus` is `OPEN`. Setting the owner it
  already has changes nothing and still returns `200`.
- **`400`**: a key missing or of the wrong type; or `ownerId` is not an
  active IT Staff or Administrator user, with `field: "ownerId"` and
  `"Owner must be an active IT Staff or Administrator user."` for an
  unknown, inactive, or Requester id alike.
- **`404`**: no such Ticket.
- **`409` `OWNER_CHANGED`**: the current owner differs from
  `expectedOwnerId`. Nothing changes; the client reloads the Ticket.
- **`409` `TICKET_FINISHED`**.

The confirmation required before taking a Ticket from another owner is a
client step (`ui-spec.md` §9); `expectedOwnerId` is what makes the server
refuse a takeover the user never saw.

### 5.5 PUT /api/staff/tickets/:id/it-priority

- **Request**: `{ "itPriority": "HIGH" }`.
- **Success `200`**: `StaffTicket`. `requestedPriority` is never changed.
- **`400`**: missing or not a Priority, `field: "itPriority"`.
- **`404`**; **`409` `TICKET_FINISHED`**.

### 5.6 POST /api/staff/tickets/:id/status

- **Request**:
  ```json
  {
    "status": "RESOLVED",
    "expectedStatus": "IN_PROGRESS",
    "resolutionSummary": "Replaced the battery; charge now holds for 7 hours."
  }
  ```
  `status` and `expectedStatus` are required. `resolutionSummary` is
  required when `status` is `RESOLVED` (trimmed, 10 to 2000 characters)
  and must be absent otherwise.
- **Success `200`**: `StaffTicket`. On `RESOLVED`: `resolutionSummary` is
  stored, `resolvedAt` is set to now, and `requesterResolvedAt` is cleared
  (BR-33). Other transitions leave the resolution fields as they are.
- **`400`**: `status` or `expectedStatus` missing or not a Status;
  `resolutionSummary` missing, too short, or too long for `RESOLVED`, or
  present for another status. `field` names it.
- **`404`**: no such Ticket.
- **`409` `TICKET_FINISHED`**: the Ticket is Closed or Cancelled.
- **`409` `STATUS_CHANGED`**: the current status differs from
  `expectedStatus`.
- **`409` `INVALID_TRANSITION`**: `status` is not reachable from the
  current status under BR-28, including a request for the status it
  already has.
- **`409` `OWNER_REQUIRED`**: `status` is `RESOLVED` and the Ticket has no
  owner (BR-29).

On any error nothing changes. The confirmation required for `RESOLVED`,
`CLOSED`, and `CANCELLED` is a client step (`ui-spec.md` §9).

### 5.7 Internal Notes

`GET /api/staff/tickets/:id/notes`

- **Success `200`**: an array of `Entry`, newest first.
- **`404`**: no such Ticket.

`POST /api/staff/tickets/:id/notes`

- **Request**: `{ "body": "Battery health reported 41% in diagnostics." }`.
- **Success `201`**: the created `Entry`. The author is the session user
  and `createdAt` is the server time. `Ticket.updatedAt` is not changed
  (BR-37).
- **`400`**: `body` missing, empty or whitespace-only after trimming, or
  longer than 4000 characters; `field: "body"`.
- **`404`**; **`409` `TICKET_FINISHED`**.

There is no update or delete route (BR-34). A Requester gets `403` on both
routes for any id (AC-04).

## 6. Shared ticket resources

Usable by the Ticket's Requester and by staff. For a Requester, a Ticket
or Attachment that is missing or not theirs is `404`; for staff, any
existing Ticket is reachable.

### 6.1 Public Comments

`GET /api/tickets/:id/comments`

- **Success `200`**: an array of `Entry`, newest first.
- **`404`**: `{ "error": "Ticket not found", "code": "NOT_FOUND" }`.

`POST /api/tickets/:id/comments`

- **Request**: `{ "body": "It still drains within two hours." }`.
- **Success `201`**: the created `Entry`. Allowed on any unfinished
  Ticket, including Resolved (BR-36). `Ticket.updatedAt` is set to now.
- **`400`**: `body` missing, empty or whitespace-only after trimming, or
  longer than 2000 characters; `field: "body"`.
- **`404`**; **`409` `TICKET_FINISHED`**.

There is no update or delete route.

### 6.2 GET /api/attachments/:id/download

Unchanged for a Requester. Staff may download an active Attachment of any
Ticket (FR-20). A soft-removed Attachment is `404` for everyone. Download
works on a finished Ticket.

## 7. User Management

Role Administrator only; Requesters and IT Staff get `403` for every path
under `/api/admin`.

`AdminUser`:

```json
{
  "id": 12,
  "name": "Wichai Phromma",
  "email": "wichai.phromma@kmutt.ac.th",
  "role": "IT_STAFF",
  "isActive": true,
  "mustChangePassword": false,
  "hasPassword": true,
  "ownedUnfinishedTicketCount": 4,
  "createdAt": "2026-10-01T02:00:00.000Z",
  "updatedAt": "2026-10-01T02:00:00.000Z"
}
```

`hasPassword` is false for a migrated account that has not been issued an
initial password. `ownedUnfinishedTicketCount` is what a deactivation or a
change to Requester would return to the queue (BR-25). The password hash
is never returned.

### 7.1 GET /api/admin/users

| Parameter | Values | Behaviour |
|---|---|---|
| `search` | string, at most 100 characters | Trimmed; empty is ignored. Case-insensitive substring match on name or email |
| `role` | Role | Users with that role |

- **Success `200`**: an array of `AdminUser` ordered by name, then id.
  Active and inactive users are both listed. No pagination.
- **`400`**: an invalid `role` or an over-long `search`, with `field`.

### 7.2 POST /api/admin/users

- **Request**:
  ```json
  {
    "name": "Alex Thompson",
    "email": "alex.thompson@kmutt.ac.th",
    "role": "IT_STAFF",
    "isActive": true
  }
  ```
  `isActive` defaults to true. Any `password` key is rejected `400`: the
  system generates the password (BR-38).
- **Success `201`**:
  ```json
  { "user": { }, "initialPassword": "K7mQ-R2xV-9bTz-HdN4" }
  ```
  `user` is an `AdminUser` with `mustChangePassword: true`.
  `initialPassword` is 16 random characters in four groups, drawn by a
  CSPRNG from the upper-case letters, lower-case letters, and digits
  except `0`, `O`, `o`, `1`, `l`, and `I`. It appears
  in this response only and cannot be retrieved again.
- **`400`**, with `field`: `name` missing or not 2 to 100 characters after
  trimming; `email` missing, malformed, or over 254 characters; `role`
  missing or not a Role; `isActive` not a boolean.
- **`409` `EMAIL_TAKEN`**: `field: "email"`, compared case-insensitively
  against all users, active or not.

### 7.3 PATCH /api/admin/users/:id

- **Request**: any non-empty subset of `name`, `email`, `role`,
  `isActive`, validated as in §7.2. An empty body is `400`.
- **Success `200`**: `{ "user": { }, "unassignedTicketCount": 3 }`.
  `unassignedTicketCount` is the number of Tickets returned to the queue
  by this change, 0 when none.
- Effects, all in one transaction:
  - `isActive` set to false, or `role` changed: the user's sessions are
    deleted (BR-14).
  - `isActive` set to false, or `role` changed to `REQUESTER`: every
    unfinished Ticket the user owns becomes unassigned, status unchanged,
    with `ownerChangedAt` set to now (BR-25).
- **`400`**: validation, with `field`.
- **`404`**: no such user.
- **`409` `EMAIL_TAKEN`**.
- **`409` `SELF_DEACTIVATION`**: the target is the session user and
  `isActive` is false (BR-40).
- **`409` `LAST_ADMINISTRATOR`**: the change would leave no active
  Administrator (BR-41). Checked inside the transaction.

### 7.4 POST /api/admin/users/:id/initial-password

No body.

- **Success `200`**: `{ "initialPassword": "P4wd-Xk8N-m3Rt-Zq6C" }`. The
  hash is replaced, `mustChangePassword` becomes true, and the user's
  sessions are deleted (BR-39). Shown in this response only. Works for an
  inactive user, who still cannot log in until activated.
- **`404`**: no such user.
- **`409` `SELF_INITIAL_PASSWORD`**: the target is the session user.

There is no route to delete a user, to read a password, or to unlock a
throttled email.

## 8. Expected HTTP statuses (summary)

| Status | Meaning in this contract |
|---|---|
| 200 | Successful read, update, transition, password change, or soft-remove |
| 201 | Ticket, Attachment, Public Comment, Internal Note, or user created |
| 204 | Logged out |
| 400 | Invalid input, including an invalid query parameter |
| 401 | Not signed in, session expired or ended, or login failed |
| 403 | Inactive account, password change required, role not permitted, or disallowed origin |
| 404 | Resource missing, or not owned by the requesting Requester |
| 409 | Request conflicts with the current state of the Ticket or user |
| 429 | Login throttled for this email |
| 500 | Unexpected server error, generic body only |
