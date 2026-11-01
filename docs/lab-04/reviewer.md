# Lab 4 Peer Review Record

## Reviewer

- **Reviewer name:** Phuttipong Phankitnirundorn
- **Student ID:** 67070503430
- **GitHub username:** [projectnewy](https://github.com/projectnewy)

Every Lab 4 pull request into `lab4-staging` was opened by
[phittayanan](https://github.com/phittayanan) and reviewed and merged by
this one classmate. No pull request was merged by its author.

## Kanban Board

https://github.com/users/phittayanan/projects/9?layout=board

## How This Record Was Built

From the pull requests on GitHub, read on 2026-11-01: the reviews, the
conversation comments, the commits, and the merge of every pull request whose
base is `lab4-staging`. All times are UTC. Each summary links what it
summarises. The reviewer left no inline comments and requested no changes on
these seven pull requests.

## Reviewed Pull Requests

| PR | Issue | Review by the reviewer | Merged |
|----|-------|------------------------|--------|
| [#76](https://github.com/phittayanan/toktickit/pull/76) Ticket Change module | #74 | Comment, approved | 2026-10-30 |
| [#77](https://github.com/phittayanan/toktickit/pull/77) Sprint 4 engineering contract | #75 | Comment, approved | 2026-10-30 |
| [#83](https://github.com/phittayanan/toktickit/pull/83) Actions Taken API, migration, and seed | #78 | Comment, approved | 2026-10-30 |
| [#84](https://github.com/phittayanan/toktickit/pull/84) Requester, IT Staff, and Administrator dashboards | #81 | Comment, approved | 2026-10-31 |
| [#86](https://github.com/phittayanan/toktickit/pull/86) Actions Taken card on Ticket Detail | #79 | Comment, approved | 2026-10-31 |
| [#85](https://github.com/phittayanan/toktickit/pull/85) Resolution Gate and final Ticket status controls | #80 | Comment, approved | 2026-10-31 |
| [#87](https://github.com/phittayanan/toktickit/pull/87) Final hardening and regression | #82 | Comment, approved | 2026-11-01 |

Totals: 7 pull requests, all merged by the reviewer, with 7 approvals
and no requests for changes.

The pull request that adds this file, and the release pull request from
`lab4-staging` to `main`, come after it and are not listed.

## Review Notes

### PR #76 — Ticket Change module (Issue #74)

- **Comment** (2026-10-30,
  [link](https://github.com/phittayanan/toktickit/pull/76#issuecomment-6529141362)):
  "I read the it full and its acceptance criteria."
- **Response:** none was needed; the comment asked for no change.
- **Approved** 2026-10-30
  ([review](https://github.com/phittayanan/toktickit/pull/76#pullrequestreview-5716168884))
  at `9553096`, the head at merge.
- **Merged** 2026-10-30 by projectnewy (`5575ef7`).

### PR #77 — Sprint 4 engineering contract (Issue #75)

- **Comment** (2026-10-30,
  [link](https://github.com/phittayanan/toktickit/pull/77#issuecomment-6529204902)):
  "It look good for the start continue your work."
- **Response:** none was needed; the comment asked for no change.
- **Approved** 2026-10-30
  ([review](https://github.com/phittayanan/toktickit/pull/77#pullrequestreview-5716198358))
  at `1e2a857`, the head at merge.
- **Merged** 2026-10-30 by projectnewy (`8bc6180`).

### PR #83 — Actions Taken API, migration, and seed (Issue #78)

- **Comment** (2026-10-30,
  [link](https://github.com/phittayanan/toktickit/pull/83#issuecomment-6530780765)):
  CI passes on the latest head, and the diff was read against the API
  specification from #77: check order, edit permissions, versioning,
  idempotent create, migration and rollback, and seed all match.
- **Response:** none was needed; the comment asked for no change.
- **Approved** 2026-10-30
  ([review](https://github.com/phittayanan/toktickit/pull/83#pullrequestreview-5717108429))
  at `b22c215`, the head at merge.
- **Merged** 2026-10-30 by projectnewy (`00f7cba`).

### PR #84 — Role dashboards (Issue #81)

- **Comment** (2026-10-31,
  [link](https://github.com/phittayanan/toktickit/pull/84#issuecomment-6542749462)):
  CI passes, and the dashboard queries and routes were checked against BR-27
  to BR-32 and the API specification: metrics are computed on the server.
- **Response:** none was needed; the comment asked for no change.
- **Approved** 2026-10-31
  ([review](https://github.com/phittayanan/toktickit/pull/84#pullrequestreview-5722518401))
  at `9915450`, the head at merge.
- **Merged** 2026-10-31 by projectnewy (`793a5b3`).

### PR #86 — Actions Taken card (Issue #79)

- **Comment** (2026-10-31,
  [link](https://github.com/phittayanan/toktickit/pull/86#issuecomment-6542783910)):
  the card follows the #83 API: one `clientRequestId` per body so a retry
  makes one record, `expectedVersion` on edit with the Reload path, and Edit
  and Cancel shown by `canEdit`.
- **Response:** none was needed; the comment asked for no change.
- **Approved** 2026-10-31
  ([review](https://github.com/phittayanan/toktickit/pull/86#pullrequestreview-5722526008))
  at `1ec1c04`. Two validation commits came after it (`ccb56ea`, `0651e73`),
  and the reviewer merged at `0651e73` with no second review on record.
- **Merged** 2026-10-31 by projectnewy (`63bd1b3`).

### PR #85 — Resolution Gate and status controls (Issue #80)

- **Comment** (2026-10-31,
  [link](https://github.com/phittayanan/toktickit/pull/85#issuecomment-6542766570)):
  the Resolution Gate matches BR-19 to BR-22 and API specification §3.1: it
  runs inside the Ticket Change, in the documented order, and only for moves
  into Resolved.
- **Response:** none was needed; the comment asked for no change.
- **Approved** 2026-10-31
  ([review](https://github.com/phittayanan/toktickit/pull/85#pullrequestreview-5722521323))
  at `d3f333a`. The branch was then rebased and took three more commits
  (`af7fd0b`, `0d50bb4`, `30c9190`), and the reviewer merged at `30c9190` with
  no second review on record.
- **Merged** 2026-10-31 by projectnewy (`3789e1f`).

### PR #87 — Final hardening and regression (Issue #82)

- **Comment** (2026-11-01,
  [link](https://github.com/phittayanan/toktickit/pull/87#issuecomment-6556763288)):
  "good work man."
- **Response:** none was needed; the comment asked for no change.
- **Approved** 2026-11-01
  ([review](https://github.com/phittayanan/toktickit/pull/87#pullrequestreview-5727607543))
  at `48140fe`, the head at merge.
- **Merged** 2026-11-01 by projectnewy (`0f317b8`).
