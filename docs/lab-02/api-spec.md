# Lab 2 API Contract

All endpoints are relative to the existing API base URL. All request/
response bodies are JSON. Every endpoint below requires a header:

```
X-Requester-Id: <positive integer>
```

Resolved against active `RequesterUser`s. Missing, non-numeric, or
unresolvable (no matching active `RequesterUser`) → `400`:

```json
{ "error": "A valid X-Requester-Id header is required" }
```

This header contract is not repeated per-endpoint below — assume it on
every route unless noted otherwise. It is never substituted with a
`requesterId` body field, path segment, or query parameter (ADR-0006,
BR-06).

Every error response has the shape `{ "error": string }`. A validation
error on a specific field additionally includes `field`:
`{ "error": string, "field": string }`.

## GET /api/categories

Retrieve active Categories.

- **Success `200`**: `[{ "id": number, "name": string }]` (unchanged from
  Lab 1's response shape — only rows with `isActive: true` are now
  returned).

## GET /api/related-systems

Retrieve active Related Systems.

- **Success `200`**: `[{ "id": number, "name": string }]`.

## GET /api/requesters

Retrieve active Development Requesters, for the Selector.

- **Success `200`**: `[{ "id": number, "name": string, "email": string }]`
  — inactive rows excluded.
- Note: this endpoint is the one exception that does not require
  `X-Requester-Id` (it's how the client discovers who it can act as).

## POST /api/tickets

Create a Ticket owned by the requesting Requester.

- **Request body**:
  ```json
  {
    "categoryId": 1,
    "relatedSystemId": 3,
    "requestedPriority": "MEDIUM",
    "summary": "Laptop battery drains quickly",
    "description": "My laptop battery is draining much faster than usual…"
  }
  ```
- **Success `201`**:
  ```json
  {
    "id": 42,
    "ticketNumber": "TKT-2026-000123",
    "requesterId": 7,
    "categoryId": 1,
    "relatedSystemId": 3,
    "summary": "Laptop battery drains quickly",
    "description": "…",
    "requestedPriority": "MEDIUM",
    "itPriority": null,
    "currentStatus": "NEW",
    "createdAt": "2026-08-23T10:15:00.000Z",
    "updatedAt": "2026-08-23T10:15:00.000Z"
  }
  ```
- **Validation failure `400`** (per-field): missing/blank Summary
  (BR-08), missing/blank Description (BR-09), Summary/Description out of
  length bounds, missing/invalid `requestedPriority` enum value (BR-11),
  `categoryId`/`relatedSystemId` missing or not an active row (BR-10).
- **`X-Requester-Id` failure `400`**: as in the shared header contract
  above.
- **Unexpected server error `500`**: `{ "error": "Unable to create ticket" }`.

## GET /api/tickets

Retrieve the requesting Requester's own Tickets — paginated, searchable,
filterable, sortable (BR-22).

- **Query parameters**:
  | Param | Type | Default | Notes |
  |---|---|---|---|
  | `page` | integer ≥ 1 | `1` | |
  | `pageSize` | `10`\|`25`\|`50` | `10` | any other value → `400` |
  | `search` | string | — | matches `ticketNumber` (substring) OR `summary` (substring, case-insensitive) |
  | `categoryId` | integer | — | filters to that Category |
  | `requestedPriority` | `LOW`\|`MEDIUM`\|`HIGH` | — | |
  | `itPriority` | `LOW`\|`MEDIUM`\|`HIGH` | — | |
  | `currentStatus` | enum | — | |
  | `sortBy` | `createdAt`\|`updatedAt`\|`ticketNumber` | `updatedAt` | |
  | `sortDir` | `asc`\|`desc` | `desc` | |

  An invalid value for any of these (e.g. `pageSize=999`, unknown
  `sortBy`) → `400` with `field` naming the offending parameter.

- **Success `200`**:
  ```json
  {
    "data": [
      {
        "id": 42,
        "ticketNumber": "TKT-2026-000123",
        "summary": "Laptop battery drains quickly",
        "categoryId": 1,
        "requestedPriority": "MEDIUM",
        "itPriority": null,
        "currentStatus": "NEW",
        "createdAt": "2026-08-23T10:15:00.000Z",
        "updatedAt": "2026-08-23T10:15:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "pageSize": 10,
      "totalItems": 1,
      "totalPages": 1
    }
  }
  ```
  Rows belonging to any other Requester are never included, regardless of
  filter/search values (BR-22).

## GET /api/tickets/:id

Retrieve one Ticket owned by the requesting Requester, including all of
its Attachments — active and soft-removed alike, so removed metadata stays
visible per BR-20/AC-29.

- **Success `200`**:
  ```json
  {
    "id": 42,
    "ticketNumber": "TKT-2026-000123",
    "requesterId": 7,
    "categoryId": 1,
    "relatedSystemId": 3,
    "summary": "Laptop battery drains quickly",
    "description": "…",
    "requestedPriority": "MEDIUM",
    "itPriority": null,
    "currentStatus": "NEW",
    "createdAt": "2026-08-23T10:15:00.000Z",
    "updatedAt": "2026-08-23T10:15:00.000Z",
    "attachments": [
      {
        "id": 5,
        "originalFilename": "screenshot.png",
        "mimeType": "image/png",
        "sizeBytes": 204800,
        "createdAt": "2026-08-23T10:15:05.000Z",
        "removedAt": null,
        "removedByRequesterId": null,
        "removalReason": null
      },
      {
        "id": 4,
        "originalFilename": "old-screenshot.png",
        "mimeType": "image/png",
        "sizeBytes": 190000,
        "createdAt": "2026-08-23T09:50:00.000Z",
        "removedAt": "2026-08-23T10:20:00.000Z",
        "removedByRequesterId": 7,
        "removalReason": "Uploaded the wrong screenshot"
      }
    ]
  }
  ```
  Every Attachment (`removedAt: null` = active, non-null = removed) is
  included; the client is responsible for splitting active vs. removed for
  display (`ui-spec.md` §9) and must never offer a download control for a
  removed entry — only `GET /api/attachments/:id/download` enforces that
  refusal server-side (below).
- **Missing or not-owned `404`** (identical body either way, per
  ADR-0004/BR-21): `{ "error": "Ticket not found" }`.

## POST /api/tickets/:id/attachments

Upload one Attachment to a Ticket owned by the requesting Requester.
Multipart form data, one file per request (client fires these
sequentially per BR-16, not in this endpoint's concern — the endpoint
itself only ever handles one file per call).

- **Request**: `multipart/form-data` with a single `file` field.
- **Success `201`**:
  ```json
  {
    "id": 6,
    "ticketId": 42,
    "originalFilename": "receipt.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 102400,
    "createdAt": "2026-08-23T10:16:00.000Z"
  }
  ```
- **Unsupported type `400`**: `{ "error": "Unsupported file type", "field": "file" }`
  (BR-13).
- **Oversized `400`**: `{ "error": "File exceeds the 5 MB limit", "field": "file" }`
  (BR-14).
- **Limit reached `400`**: `{ "error": "This Ticket already has 5 active attachments" }`
  (BR-15) — the active-Attachment count is checked immediately before
  persisting, inside this request.
- **Missing/not-owned Ticket `404`**: same shared shape as
  `GET /api/tickets/:id`.

## GET /api/attachments/:id/download

Download the file content of an active Attachment owned (via its Ticket)
by the requesting Requester.

- **Success `200`**: binary file stream with the original `mimeType` and
  a `Content-Disposition` naming `originalFilename`.
- **Missing/not-owned Attachment `404`**: `{ "error": "Attachment not found" }`.
- **Soft-removed Attachment `404`**: same body as above — a removed
  Attachment's content is never served (BR-20/AC-30), indistinguishable
  from a missing one.

## POST /api/attachments/:id/remove

Soft-remove an active Attachment owned (via its Ticket) by the requesting
Requester.

- **Request body**:
  ```json
  { "removalReason": "Uploaded the wrong screenshot" }
  ```
- **Success `200`**:
  ```json
  {
    "id": 6,
    "removedAt": "2026-08-23T10:20:00.000Z",
    "removedByRequesterId": 7,
    "removalReason": "Uploaded the wrong screenshot"
  }
  ```
- **Missing/blank reason `400`**: `{ "error": "A removal reason (5-500 characters) is required", "field": "removalReason" }`
  (BR-19) — rejected before any DB write.
- **Missing/not-owned Attachment `404`**: same shared shape.
- **Already-removed Attachment**: treated as not-found `404` (an
  already-removed Attachment is not a valid target for another removal).

## Expected HTTP statuses (summary)

| Status | Meaning in this contract |
|---|---|
| 200 | Successful retrieval, download, or soft-remove |
| 201 | Ticket or Attachment created |
| 400 | Invalid input — missing/malformed field, bad header, unsupported file type/size, attachment limit reached |
| 404 | Resource missing, not owned by the requesting Requester, or (Attachment) already removed |
| 500 | Unexpected server error — always the generic safe body, never a stack trace |
