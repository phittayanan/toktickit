# Server-side sessions in PostgreSQL behind an httpOnly cookie

Status: accepted. Supersedes the `Authorization`-header forecast in
[ADR-0006](./0006-requester-identity-transport.md) and retires the temporary
mechanism of [ADR-0001](./0001-requesteruser-temporary-auth.md).

Lab 3 replaces the Development Requester selector with real login. The
login is remembered by a **Session** row in PostgreSQL. The browser holds
only an opaque random reference to it in a cookie:

- Cookie `tk_session`: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure`
  when `NODE_ENV=production`, no `Max-Age` (a browser-session cookie; the
  server decides expiry).
- The cookie value is 32 random bytes (base64url) from the Node CSPRNG. The
  database stores only its SHA-256 hash, so a leaked table cannot be
  replayed as live cookies.
- Idle expiry is 8 hours, enforced on the server from `Session.expiresAt`,
  which slides forward on use.
- The session stores the user id only. Role, activation state, and the
  must-change-password flag are read from `User` on every request.
- Logout deletes the row. Deactivating a user, changing a user's role, and
  setting a new initial password delete all of that user's rows in the same
  transaction, so access ends at the next request.
- Login and a successful password change issue a new session value
  (no session fixation).

Hard to reverse: every route, the client fetch layer, the CORS policy, and
every test helper depend on how identity reaches the server. Surprising
without context: ADR-0006 said real auth would arrive as an `Authorization`
header, and it does not.

## Why not a browser-held token

Immediate revocation is a stated requirement (logout and deactivation end
access at once). A signed token stays valid until it expires unless the
server also keeps a deny list, which is a session table with extra steps.
A token readable by client code is also exposed to any script injection;
an httpOnly cookie is not. And opaque sessions need no signing secret, so
there is no authentication secret to keep out of client code or source
control.

## CSRF

A cookie is sent automatically, so cross-site request forgery has to be
handled, which a header token would have avoided. Three layers:

1. `SameSite=Strict` — the cookie is not sent on any cross-site request.
   The SPA calls the API from the same site (`localhost`, any port), so
   normal use is unaffected.
2. CORS allows exactly one origin (`CLIENT_ORIGIN`) with credentials; the
   Lab 2 wildcard `cors()` is removed.
3. Every state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) whose
   `Origin` header is present and is not `CLIENT_ORIGIN` is rejected `403`.
   No endpoint changes state on `GET`.

## Consequences

- `X-Requester-Id` is no longer read. A request carrying it gets no
  identity from it (specification BR-03).
- The client sends `credentials: 'include'` on every request and stores no
  identity or token in `localStorage`; the legacy `toktickit.requester` key
  is removed on start.
- One extra indexed lookup per request. Acceptable at this scale; no cache.
- Login throttling state (`LoginThrottle`) also lives in PostgreSQL, so it
  survives a server restart.

## Considered Options

- Signed JWT in `localStorage` with an `Authorization` header (ADR-0006's
  forecast) — rejected: no immediate revocation, readable by scripts, needs
  a secret.
- JWT in an httpOnly cookie — rejected: fixes script exposure but still
  cannot be revoked without server state, and still needs a secret.
- `express-session` with an in-memory store — rejected: sessions vanish on
  restart and cannot be ended per user from another request.
