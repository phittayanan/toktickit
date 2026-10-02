# Lab 3 Peer Review Record

## Reviewer

- **Reviewer name:** Thira Rungruangkaset
- **Student ID:** 67070503419
- **GitHub username:** [HolyThiccDaddy](https://github.com/HolyThiccDaddy)

Every Lab 3 pull request into `lab3-staging` was opened by
[phittayanan](https://github.com/phittayanan) and reviewed and merged by
this one classmate. No pull request was merged by its author.

## Kanban Board

https://github.com/users/phittayanan/projects/9

## How This Record Was Built

From the pull requests on GitHub, read on 2026-10-03: the reviews, the
inline and conversation comments, the commits, and the merge of every pull
request whose base is `lab3-staging`. All times are UTC. Each summary
links the comment it summarises.

It covers the 14 pull requests merged before Issue #56 (release
integration). The pull request that adds this file, and the release pull
request from `lab3-staging` to `main`, come after it and are not listed.

## Reviewed Pull Requests

| PR | Issue | Review rounds by the reviewer | Merged |
|----|-------|-------------------------------|--------|
| [#44](https://github.com/phittayanan/toktickit/pull/44) Sprint 3 engineering contract | #43 | Approved, approved again at the final commit | 2026-10-01 |
| [#57](https://github.com/phittayanan/toktickit/pull/57) Test foundation | #45 | Changes requested, later dismissed by the reviewer | 2026-10-01 |
| [#59](https://github.com/phittayanan/toktickit/pull/59) CI: server tests, type checks, lint | #58 | Approved | 2026-10-01 |
| [#60](https://github.com/phittayanan/toktickit/pull/60) User migration and seed | #46 | Approved | 2026-10-01 |
| [#61](https://github.com/phittayanan/toktickit/pull/61) Authentication foundation | #47 | Changes requested, then approved | 2026-10-01 |
| [#62](https://github.com/phittayanan/toktickit/pull/62) Authorization and Requester regression (API) | #48 | Approved | 2026-10-01 |
| [#64](https://github.com/phittayanan/toktickit/pull/64) CI: client unit tests | #63 | Approved | 2026-10-01 |
| [#65](https://github.com/phittayanan/toktickit/pull/65) Login, Change Password, shell, and guards (UI) | #49 | Changes requested, then approved | 2026-10-01 |
| [#66](https://github.com/phittayanan/toktickit/pull/66) Public Comments and Requester Ticket Detail additions | #50 | Changes requested, then approved | 2026-10-01 |
| [#67](https://github.com/phittayanan/toktickit/pull/67) IT Staff Ticket Queue | #51 | Changes requested, then approved | 2026-10-02 |
| [#68](https://github.com/phittayanan/toktickit/pull/68) Administrator User Management | #53 | Approved | 2026-10-01 |
| [#69](https://github.com/phittayanan/toktickit/pull/69) IT Staff ticket operations | #52 | Approved | 2026-10-02 |
| [#70](https://github.com/phittayanan/toktickit/pull/70) End-to-end flows | #54 | Approved | 2026-10-02 |
| [#71](https://github.com/phittayanan/toktickit/pull/71) Visual inspection and responsive evidence | #55 | Changes requested, then approved | 2026-10-02 |

Totals: 14 pull requests, all merged by the reviewer. The reviewer
submitted 20 reviews: 14 approvals and 6 requests for changes (on #57,
#61, #65, #66, #67, and #71).

## Review Notes

### PR #44 — Sprint 3 engineering contract (Issue #43)

- **Comment** (2026-10-01): a
  [first pass](https://github.com/phittayanan/toktickit/pull/44#issuecomment-5926050703),
  headed as an automated review, found the scope matched the Issue but
  could not check the contract against the course handout, which is not in
  the repository. It noted, as non-blocking, that `ui-spec.md` called the
  Ticket Queue pagination control "the My Tickets control". A
  [second comment](https://github.com/phittayanan/toktickit/pull/44#issuecomment-5926129181)
  said the contract had since been checked against the handout with no
  blocking mismatch.
- **Response:** the label was
  [fixed in `21b4cbd`](https://github.com/phittayanan/toktickit/pull/44#issuecomment-5926165190),
  and a
  [reply](https://github.com/phittayanan/toktickit/pull/44#issuecomment-5926182605)
  explained that the handout is not committed and mapped each section of
  `specification.md` to the handout section it follows.
- **Approved** [at the first commit](https://github.com/phittayanan/toktickit/pull/44#pullrequestreview-5375818333)
  and [again at `21b4cbd`](https://github.com/phittayanan/toktickit/pull/44#pullrequestreview-5375821335),
  where the reviewer confirmed the note was fixed.
- **Merged** 2026-10-01 by @HolyThiccDaddy (`f89e0db`).

### PR #57 — Test foundation (Issue #45)

- **Changes requested** (2026-10-01,
  [review](https://github.com/phittayanan/toktickit/pull/57#pullrequestreview-5377528900)):
  one password-policy edge case had to be corrected, and the reviewer
  would not approve or merge a pull request with no status checks. The
  [inline comment](https://github.com/phittayanan/toktickit/pull/57#discussion_r4153943676)
  showed that a character such as `²` counted as neither a digit nor a
  special character, so `Abcdef1²` was rejected.
- **Response** ([reply](https://github.com/phittayanan/toktickit/pull/57#discussion_r4154092919)):
  the special-character check now uses the same digit set as the digit
  rule, so `Abcdef1²` is accepted, with a unit test written first. The fix
  is commit `d1602e9` on the pull request (the reply names it by its SHA
  before a later force-push, `3288190`).
- **Outcome:** the reviewer dismissed the changes-requested review, saying
  the fix and its test were in place and that the dismissal was not an
  approval because the head still had no CI checks. CI was added in
  [#59](https://github.com/phittayanan/toktickit/pull/59), the branch was
  updated onto it, and its three checks passed on `d1602e9`. This pull
  request has no approving review: the reviewer then wrote
  ["Okay I will merge it now."](https://github.com/phittayanan/toktickit/pull/57#issuecomment-5929861952)
  and merged it.
- **Merged** 2026-10-01 by @HolyThiccDaddy (`40e2026`).

### PR #59 — CI: server tests, type checks and lint (Issue #58)

- **Approved** (2026-10-01,
  [review](https://github.com/phittayanan/toktickit/pull/59#pullrequestreview-5378117514)):
  the workflow is limited to pull requests and pushes to `main` and the
  staging branches, grants read-only permission, and its three checks
  passed.
- **Merged** 2026-10-01 by @HolyThiccDaddy (`46ae09d`).

### PR #60 — User migration and seed (Issue #46)

- **Approved** (2026-10-01,
  [review](https://github.com/phittayanan/toktickit/pull/60#pullrequestreview-5378819295)):
  the migration keeps the existing Requester data, the seed is idempotent
  and gives the documented role and Ticket coverage, and CI passed. The
  reviewer noted that two tests which need login were skipped and deferred
  to the Issues that add those endpoints.
- **Merged** 2026-10-01 by @HolyThiccDaddy (`b3acfc1`).

### PR #61 — Authentication foundation (Issue #47)

- **Changes requested** (2026-10-01,
  [review](https://github.com/phittayanan/toktickit/pull/61#pullrequestreview-5379395594)):
  one response-contract gap. The
  [inline comment](https://github.com/phittayanan/toktickit/pull/61#discussion_r4155494278)
  showed that body-parser failures kept statuses such as 413 and 415 while
  being labelled `VALIDATION_ERROR`, which `api-spec.md` defines only for
  400.
- **Response** ([reply](https://github.com/phittayanan/toktickit/pull/61#discussion_r4155648512)):
  those failures now answer with the documented 400 `VALIDATION_ERROR`,
  with the tests updated, in `7a0c324`.
- **Approved** 2026-10-01
  ([review](https://github.com/phittayanan/toktickit/pull/61#pullrequestreview-5379726525),
  no comment).
- **Merged** 2026-10-01 by @HolyThiccDaddy (`0642de9`).

### PR #62 — Authorization and Requester regression, API (Issue #48)

- **Approved** 2026-10-01
  ([review](https://github.com/phittayanan/toktickit/pull/62#pullrequestreview-5380541589),
  no comment).
- **Merged** 2026-10-01 by @HolyThiccDaddy (`008af1c`).

### PR #64 — CI: client unit tests (Issue #63)

- **Approved** 2026-10-01
  ([review](https://github.com/phittayanan/toktickit/pull/64#pullrequestreview-5380923401),
  no comment).
- **Merged** 2026-10-01 by @HolyThiccDaddy (`1ea2e6c`).

### PR #65 — Login, Change Password, shell, and guards, UI (Issue #49)

- **Changes requested** (2026-10-01,
  [review](https://github.com/phittayanan/toktickit/pull/65#pullrequestreview-5381369288)):
  the pull request description contradicted itself. Its risk assessment
  said a Change Password self-return case and a success notice that
  reappears after reload still existed, while its verification section
  marked both as passing. The reviewer asked for any remaining case to be
  fixed and for the description and tests to agree.
- **Response:** there is no reply comment on this pull request. The commit
  that fixes both behaviours, `01555e6`, was already in the reviewed head;
  after the review the description was edited and two more fix commits
  were pushed (`4e60a0a`, `f03a763`).
- **Approved** 2026-10-01
  ([review](https://github.com/phittayanan/toktickit/pull/65#pullrequestreview-5381789757),
  no comment).
- **Merged** 2026-10-01 by @HolyThiccDaddy (`bdb87bd`).

### PR #66 — Public Comments and Requester Ticket Detail additions (Issue #50)

- **Changes requested** (2026-10-01,
  [review](https://github.com/phittayanan/toktickit/pull/66#pullrequestreview-5382542836)):
  the description's risk assessment named two remaining defects (a
  missing-body 400 without `field`, and a client comment-list state case),
  so the reviewer could not approve. The reviewer asked for the first to
  be reconciled with the tests, which claimed the opposite, and for the
  second to be described and fixed or the assessment corrected.
- **Response** ([reply](https://github.com/phittayanan/toktickit/pull/66#issuecomment-5936302908)):
  the 400 does carry `field: "body"`, proved by test API-39; the list
  state case was described and had been fixed in `e33a459` with two UI-11
  tests; the sentence naming two defects was a stale note, and the
  description was corrected. No new commit was needed.
- **Approved** 2026-10-01
  ([review](https://github.com/phittayanan/toktickit/pull/66#pullrequestreview-5382723625),
  no comment).
- **Merged** 2026-10-01 by @HolyThiccDaddy (`89a7d08`).

### PR #67 — IT Staff Ticket Queue (Issue #51)

- **Changes requested** (2026-10-01,
  [review](https://github.com/phittayanan/toktickit/pull/67#pullrequestreview-5382732370)):
  one contract mismatch. `ui-spec.md` §8.2 requires "Previous, Next, and
  page numbers", but the shared pagination control offered only Previous
  and Next with a "Page N of M" label
  ([inline comment](https://github.com/phittayanan/toktickit/pull/67#discussion_r4158183845)).
- **Response** ([reply](https://github.com/phittayanan/toktickit/pull/67#discussion_r4159023086)):
  the control now has numbered page buttons between Previous and Next,
  with the current page marked and the first and last always reachable, in
  `8ecd288`.
- **Approved** 2026-10-02
  ([review](https://github.com/phittayanan/toktickit/pull/67#pullrequestreview-5391448919),
  no comment).
- **Merged** 2026-10-02 by @HolyThiccDaddy (`c7dfa65`).

### PR #68 — Administrator User Management (Issue #53)

- **Approved** 2026-10-01
  ([review](https://github.com/phittayanan/toktickit/pull/68#pullrequestreview-5383191769),
  no comment).
- **Merged** 2026-10-01 by @HolyThiccDaddy (`22500b8`).

### PR #69 — IT Staff ticket operations (Issue #52)

- **Approved** 2026-10-02
  ([review](https://github.com/phittayanan/toktickit/pull/69#pullrequestreview-5392312634),
  no comment).
- **Merged** 2026-10-02 by @HolyThiccDaddy (`c1b795a`).

### PR #70 — End-to-end flows (Issue #54)

- **Approved** 2026-10-02
  ([review](https://github.com/phittayanan/toktickit/pull/70#pullrequestreview-5392960216),
  no comment).
- **Merged** 2026-10-02 by @HolyThiccDaddy (`02941a7`).

### PR #71 — Visual inspection and responsive evidence (Issue #55)

- **Changes requested** (2026-10-02,
  [review](https://github.com/phittayanan/toktickit/pull/71#pullrequestreview-5393768012)):
  Requester Ticket Detail still showed the connection error text with no
  Retry when the Ticket could not load, although `ui-spec.md` §2.3 calls
  for the safe failure message with Retry
  ([inline comment](https://github.com/phittayanan/toktickit/pull/71#discussion_r4167309009)).
  The reviewer asked for it to be fixed or for the checklist not to claim
  that state as complete.
- **Response** ([reply](https://github.com/phittayanan/toktickit/pull/71#discussion_r4167646058)):
  fixed in `0dd2dfa`; the state now shows "Something went wrong. Please
  try again." with a Retry that loads the Ticket again. `af5d6fa` gives
  that Retry a 44px tap target on mobile, and the screenshot and
  `visual-checklist-results.md` were updated to match.
- **Approved** 2026-10-02
  ([review](https://github.com/phittayanan/toktickit/pull/71#pullrequestreview-5394201682),
  no comment).
- **Merged** 2026-10-02 by @HolyThiccDaddy (`1608cc2`).
