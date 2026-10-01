# TokTickIT

TokTickIT (ตอกติ๊กกิต) is an IT service desk application for Account and Access,
Hardware, Software, and Network requests. This repository is being built
incrementally across CPE 334 Individual Sprints (Labs 1–4).

## Lab 1 Scope

Lab 1 delivers a minimal full-stack vertical slice that proves the technology
stack works end to end: **React UI → Express REST API → Prisma ORM →
PostgreSQL DB**. It does not implement any product features beyond a
`[Check System]` button that reports backend health and lists the four
supported request categories loaded from the database.

## Tech Stack

| Layer      | Technology                              |
|------------|------------------------------------------|
| Frontend   | React + TypeScript + Vite + Bootstrap    |
| Backend    | Node.js + Express + TypeScript           |
| Database   | PostgreSQL + Prisma                      |
| Testing    | Vitest (frontend), Supertest (backend)   |

## Repository Structure

```
toktickit/
├── client/                 # React + TypeScript + Vite frontend
├── server/
│   ├── prisma/              # Prisma schema and migrations
│   ├── src/                 # Express + TypeScript source
│   └── tests/lab-01/        # Supertest API tests for Lab 1
├── docs/
│   └── lab-01/
│       ├── ai_use.md         # AI prompts used and reflection
│       ├── reviewer.md       # Peer review record
│       └── tests.md          # Lab 1 test inventory
├── .gitignore
└── README.md
```

## Setup

### Prerequisites

- Node.js (LTS)
- PostgreSQL running locally
- npm

### Backend (`server/`)

```bash
cd server
npm install
cp .env.example .env   # then fill in your PostgreSQL connection string
npx prisma migrate dev
npx prisma db seed
npm run dev
```

### Seed accounts (local development)

`npx prisma db seed` is safe to run repeatedly. Besides the Categories and
Related Systems it provides these accounts, and 24 example Tickets
(`TKT-2026-900001` upward) with Public Comments and Internal Notes:

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
npm run dev
```

### Running Tests

```bash
# Backend (Supertest). The migration and seed tests create and drop their
# own databases, so the DATABASE_URL role must be allowed to CREATE DATABASE.
cd server
npm test

# Frontend (Vitest)
cd client
npm test
```

## Git Workflow

- `main` — stable/production branch
- `lab1-staging` — Lab 1 integration branch
- `feature/*` — one feature branch per GitHub Issue, PRs target `lab1-staging`

All work happens on feature branches, merged into `lab1-staging` via
peer-reviewed Pull Requests, then finally into `main`.
