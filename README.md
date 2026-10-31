# TokTickIT

TokTickIT (ตอกติ๊กกิต) is an IT service desk application for Account and Access,
Hardware, Software, and Network requests. This repository is being built
incrementally across CPE 334 Individual Sprints (Labs 1–4).

## Sprints

| Sprint | What it delivered | Contract |
|--------|-------------------|----------|
| Lab 1 | The stack end to end (React UI → Express REST API → Prisma ORM → PostgreSQL), with a health check and the request Categories loaded from the database. | `docs/lab-01/` |
| Lab 2 | The Requester side: Create Ticket with Attachments, My Tickets (search, filter, sort, pagination), and Requester Ticket Detail. | `docs/lab-02/` |
| Lab 3 | Login with email and password, three roles (Requester, IT Staff, Administrator) enforced by the backend, Public Comments and Internal Notes, the IT Staff Ticket Queue and Staff Ticket Detail, and Administrator User Management. | `docs/lab-03/` |
| Lab 4 | Actions Taken on each Ticket, the Resolution Gate on moves to Resolved, and Requester, IT Staff, and Administrator Dashboards with drill-down. | `docs/lab-04/` |

## Tech Stack

| Layer      | Technology                              |
|------------|------------------------------------------|
| Frontend   | React + TypeScript + Vite + Bootstrap    |
| Backend    | Node.js + Express + TypeScript           |
| Database   | PostgreSQL + Prisma                      |
| Testing    | Vitest + Supertest (server), Vitest + Testing Library (client), Playwright (E2E, visual, responsive) |

## Repository Structure

```
toktickit/
├── client/                 # React + TypeScript + Vite frontend
│   └── src/                 # Screens, with component tests beside them or in lab-04/
├── server/
│   ├── prisma/              # Prisma schema, migrations, rollback, and seed
│   ├── src/                 # Express + TypeScript source
│   └── tests/               # Vitest + Supertest suites: lab-01 to lab-04
├── e2e/                    # Playwright suites: lab-02, lab-03, lab-04
├── artifacts/              # Screenshots: lab-02, lab-03, lab-04
├── docs/
│   ├── adr/                 # Architecture decision records
│   ├── lab-01/              # Lab 1 tests, peer review, AI use
│   ├── lab-02/              # Lab 2 contract, tests, AI use
│   ├── lab-03/              # Lab 3 contract, tests, peer review, AI use
│   └── lab-04/              # Lab 4 contract and test plan
├── .github/workflows/      # CI
├── CONTEXT.md              # Domain vocabulary
├── playwright.config.ts
└── README.md
```

## Setup

### Prerequisites

- Node.js (CI uses Node 26)
- PostgreSQL running locally
- npm

### Database and backend (`server/`)

```bash
createdb toktickit_dev
cd server
npm install
cp .env.example .env   # then set DATABASE_URL to your PostgreSQL connection string
npx prisma migrate dev # creates the tables
npx prisma generate
npx prisma db seed     # reference data, seed accounts, example Tickets
npm run dev            # API on http://localhost:4000
```

`DATABASE_URL` names the database user and the database, for example
`postgresql://USER:PASSWORD@localhost:5432/toktickit_dev?schema=public`.
`npx prisma migrate deploy` applies the same migrations without creating
new ones; CI and the test databases below use it.

To undo the Lab 4 migration, take a `pg_dump` first, because rollback drops
the Action Taken rows, then run this from `server/`:

```bash
npx prisma db execute --file prisma/rollback/lab4_actions_taken.down.sql
```

`npx prisma migrate deploy` then applies the migration again.

### Seed accounts (local development)

`npx prisma db seed` is safe to run repeatedly. Besides the Categories and
Related Systems it provides these accounts, and 31 example Tickets
(`TKT-2026-900001` upward) with Public Comments, Internal Notes, and Actions
Taken:

| Name | Email | Role | Status |
|---|---|---|---|
| Somchai Jaidee | `somchai.jaidee@kmutt.ac.th` | Requester | Active |
| Nalinee Suksawat | `nalinee.suksawat@kmutt.ac.th` | Requester | Active |
| Kittipong Rattanakosin | `kittipong.rattanakosin@kmutt.ac.th` | Requester | Active |
| Ploy Wongsawang | `ploy.wongsawang@kmutt.ac.th` | Requester | Active |
| Anucha Boonmee | `anucha.boonmee@kmutt.ac.th` | Requester | Inactive |
| Wichai Phromma | `wichai.phromma@kmutt.ac.th` | IT Staff | Active |
| Siriporn Kaewmanee | `siriporn.kaewmanee@kmutt.ac.th` | IT Staff | Active |
| Thanakorn Srisuk | `thanakorn.srisuk@kmutt.ac.th` | IT Staff | Active |
| Pranee Chaiyasit | `pranee.chaiyasit@kmutt.ac.th` | IT Staff | Inactive |
| Apinya Thongchai | `apinya.thongchai@kmutt.ac.th` | Administrator | Active |

Every seed account has the initial password `TokTickIT-Lab3!` and must
change it at first login. This password is for local development only. The
seed sets it only on a seed account that has no password yet, so running
the seed again never resets a password that was changed, and it leaves
alone any account or Ticket a person has edited.

A Requester migrated from a Lab 2 database who is not a seed account has no
password and cannot log in until an Administrator sets an initial password.

### Frontend (`client/`)

```bash
cd client
npm install
npm run dev            # client on http://localhost:5173
```

Open http://localhost:5173 and sign in as one of the seed accounts above.
The first sign-in of an account leads to Change Password; the application
opens after the password is changed.

The client calls the API at `http://localhost:4000` unless `VITE_API_URL`
says otherwise (see `client/.env.example`). The API accepts browser
requests from `http://localhost:5173` only, unless `CLIENT_ORIGIN` in
`server/.env` names another origin.

## Running Tests

The test plan, the traceability to the Acceptance Criteria, and the final
results are in [`docs/lab-03/tests.md`](docs/lab-03/tests.md) for Lab 3 and
[`docs/lab-04/tests.md`](docs/lab-04/tests.md) for Lab 4.

### Server: unit, API, security, migration, seed, and earlier-lab regression

```bash
cd server
npm run build          # type check
npm test               # Vitest + Supertest
```

The API tests run against the database named by `DATABASE_URL`, which
must be migrated and seeded first, and they write to it, so point them at
a database kept for tests rather than the development one:

```bash
createdb toktickit_test
export DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/toktickit_test?schema=public"
cd server
npx prisma migrate deploy
npx prisma db seed
npm test
```

The migration and seed tests create and drop their own databases, so the
`DATABASE_URL` role must be allowed to `CREATE DATABASE`.

### Client: UI component tests

```bash
cd client
npm run lint           # oxlint
npm run build          # type check and production build
npm test               # Vitest + Testing Library
```

### Playwright: E2E, visual, and responsive

Run from the repository root. The suites need their own database, never
the development one: they create the users they sign in as (`e2e.`
addresses), and they also change other accounts (one flow deactivates
every other active Administrator, which signs them out and unassigns
their unfinished Tickets). The database name must end in `_e2e`; the run
stops before writing anything when it does not.

```bash
createdb toktickit_e2e
export DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/toktickit_e2e?schema=public"
(cd server && npx prisma migrate deploy && npx prisma db seed)

# With that same DATABASE_URL exported, start the server on :4000
# (`cd server && npm run dev`), start the client on :5173
# (`cd client && npm run dev`), then:
npm install
npx playwright install chromium
npm run typecheck                  # type check of the specs
npx playwright test e2e/lab-04     # Lab 4 E2E, visual, responsive
npx playwright test e2e/lab-03     # Lab 3 E2E, visual, responsive
npx playwright test e2e/lab-02     # Lab 2 regression
npx playwright test                # all of them
```

An exported `DATABASE_URL` takes precedence over the one in `server/.env`,
so the server and the Playwright run must both be started with it. When
the client or the server runs on another port, set `CLIENT_URL` and
`API_URL` for the Playwright run, `VITE_API_URL` for the client, and
`CLIENT_ORIGIN` for the server. The visual specs write their screenshots
under `artifacts/`.

CI (`.github/workflows/ci.yml`) runs the server, client, and Playwright
suites and the type checks on every pull request and on every push to
`main` and to a `labN-staging` branch, and uploads the Playwright report
when a Playwright run fails.

## Demonstration

With the seed loaded, the server and the client running, sign in at
http://localhost:5173 as a seed account. The first sign-in asks for a new
password.

1. **Requester** (`somchai.jaidee@kmutt.ac.th`): the Dashboard opens first.
   Follow a card to the matching My Tickets view, create a Ticket with an
   Attachment, and post a Public Comment.
2. **IT Staff** (`wichai.phromma@kmutt.ac.th`): the Dashboard opens first.
   Open the new Ticket from the Ticket Queue, claim it, and move it to In
   Progress. Its status control lists Resolved (not available), with the
   reason. Add an Action Taken as Done, resolve the Ticket, and close it.
3. **Requester** again: Ticket Detail shows the Action Taken, read-only, and
   the Resolution Summary.
4. **Administrator** (`apinya.thongchai@kmutt.ac.th`): the Dashboard adds the
   Active accounts counts. Follow one to User Management.

## Git Workflow

- `main`: the stable branch. A lab's work reaches it through a release
  pull request from that lab's staging branch.
- `labN-staging` (`lab1-staging` to `lab4-staging`): the integration branch
  of lab N.
- `feature/<issue number>-<short name>`: one branch per GitHub Issue. Its
  pull request targets the staging branch of the lab the Issue belongs
  to, never `main`.

A feature pull request is merged into its `labN-staging` branch only
after a classmate has reviewed and approved it. When every Issue of the
lab is merged, a release pull request takes `labN-staging` into `main`.
Peer review records: [`docs/lab-01/reviewer.md`](docs/lab-01/reviewer.md)
and [`docs/lab-03/reviewer.md`](docs/lab-03/reviewer.md).
