# Lab 1 Peer Review Record

## Reviewer Details

- **Reviewer name:** Phuttipong Phankitnirund0rn
- **Student ID:** 67070503430
- **GitHub username:** [projectnewy](https://github.com/projectnewy)

## Reviewed Pull Requests

### Reviews my partner gave me (on `phittayanan/toktickit`)

| PR Link | Issue | Outcome |
|---------|-------|---------|
| [#5](https://github.com/phittayanan/toktickit/pull/5) | #1 Set up the TokTickIT project foundation | Approved ("well done, it okay to merge"), merged into `lab1-staging` |
| [#6](https://github.com/phittayanan/toktickit/pull/6) | docs: record peer review evidence in reviewer.md | Approved ("it look work and nice, can merge"), merged into `lab1-staging` |
| [#7](https://github.com/phittayanan/toktickit/pull/7) | #3 Create and seed IT request categories | Approved ("Looks good, setup works on my machine"), merged into `lab1-staging` |
| [#8](https://github.com/phittayanan/toktickit/pull/8) | #2 Implement the API health check | Approved ("check it look good can merge now."), merged into `lab1-staging` |
| [#9](https://github.com/phittayanan/toktickit/pull/9) | #4 Display the IT request category list | Approved ("UI look good it work."), merged into `lab1-staging` |

### Reviews I gave my partner (on [`projectnewy/tocktickit`](https://github.com/projectnewy/tocktickit))

| PR Link | Issue | Outcome |
|---------|-------|---------|
| [#5](https://github.com/projectnewy/tocktickit/pull/5) | Issue 1: Set up the TokTickIT project foundation | Approved, merged |
| [#6](https://github.com/projectnewy/tocktickit/pull/6) | Issue 2: Implement the API health check | Approved, merged |
| [#7](https://github.com/projectnewy/tocktickit/pull/7) | Issue 3: Create and seed IT request categories | Approved, merged |
| [#8](https://github.com/projectnewy/tocktickit/pull/8) | Issue 4: Display the IT request category list | Approved, merged |
| [#9](https://github.com/projectnewy/tocktickit/pull/9) | Lab 1 release | Approved, merged |

## Review Notes

### PR #5 (my repo) — Set up the TokTickIT project foundation

**Comment my partner gave me:**
> "well done, it okay to merge" — [projectnewy](https://github.com/phittayanan/toktickit/pull/5#issuecomment-5380928400)

**My response:**
> "Thanks for the quick review! Merging now." — [reply](https://github.com/phittayanan/toktickit/pull/5#issuecomment-5380933742)

**Outcome:** Approved by [@projectnewy](https://github.com/projectnewy), merged into `lab1-staging`.

### PR #6 (my repo) — docs: record peer review evidence

**Comment my partner gave me:**
> "it look work and nice, can merge" — [projectnewy](https://github.com/phittayanan/toktickit/pull/6#issuecomment-5380980101)

**My response:**
> "Thanks! Merging now." — [reply](https://github.com/phittayanan/toktickit/pull/6#issuecomment-5380983762)

**Outcome:** Approved by [@projectnewy](https://github.com/projectnewy), merged into `lab1-staging` by [@projectnewy](https://github.com/projectnewy).

### PR #7 (my repo) — Create and seed IT request categories

**Comment my partner gave me:**
> "Looks good, setup works on my machine" — [projectnewy](https://github.com/phittayanan/toktickit/pull/7#issuecomment-5381054758)

**My response:**
> "Thanks! Merging now." — [reply](https://github.com/phittayanan/toktickit/pull/7#issuecomment-5381054758)

**Outcome:** Approved by [@projectnewy](https://github.com/projectnewy), merged into `lab1-staging` by [@projectnewy](https://github.com/projectnewy).

### PR #8 (my repo) — Implement the API health check

**Comment my partner gave me:**
> "check it look good can merge now." — [projectnewy](https://github.com/phittayanan/toktickit/pull/8#issuecomment-5381054857)

**My response:**
> "Thanks! Merging now." — [reply](https://github.com/phittayanan/toktickit/pull/8#issuecomment-5381054857)

**Outcome:** Approved by [@projectnewy](https://github.com/projectnewy), merged into `lab1-staging` by [@projectnewy](https://github.com/projectnewy).

### PR #9 (my repo) — Display the IT request category list

**Comment my partner gave me:**
> "UI look good it work." — [projectnewy](https://github.com/phittayanan/toktickit/pull/9#issuecomment-5381098703)

**My response:**
> "Thanks! This closes out all four Lab 1 Issues. Merging now." — [reply](https://github.com/phittayanan/toktickit/pull/9#issuecomment-5381098703)

**Outcome:** Approved by [@projectnewy](https://github.com/projectnewy), merged into `lab1-staging` by [@projectnewy](https://github.com/projectnewy). This closed out all four Lab 1 Issues.

### Reviews I gave on [`projectnewy/tocktickit`](https://github.com/projectnewy/tocktickit)

I reviewed all four of Phuttipong's feature-issue PRs plus the Lab 1 release
PR, checking against the branch itself rather than just the PR description
(re-ran `tsc`, grepped git history for leaked secrets, tested a claimed merge
conflict directly, etc.). Comments given, by PR:

- **[#5 — Issue 1](https://github.com/projectnewy/tocktickit/pull/5):**
  Approved. Verified every Issue 1 acceptance criterion against the branch.
  Flagged that `npm run build && npm start` was broken (`tsconfig.json`
  `include` made `rootDir` infer as `server/`, so `dist/index.js` never
  existed) — non-blocking, folded into the Issue 2 branch. Also flagged
  `ai_use.md` one row short of the required 6–10, and that `reviewer.md`
  was still the empty template — his side of the two-way review evidence.
  **Phuttipong's response:** fixed the build path issue in PR #6, added the
  missing prompt row, and started filling in `reviewer.md`.

- **[#6 — Issue 2](https://github.com/projectnewy/tocktickit/pull/6):**
  Approved. Verified the `npm start` fix by re-running `tsc` directly.
  Flagged that narrowing `tsconfig.json`'s `include` to `src` silently
  stopped type-checking `prisma/` and `tests/`, that the error message
  thrown in `api.ts` was dead code (never rendered), and that
  "Unable to connect" would mislabel a 500 from a live server as the server
  being down. **Phuttipong's response:** addressed the dead-code message
  and reconfirmed the tsconfig tradeoff would be revisited in Issue 3/4.

- **[#7 — Issue 3](https://github.com/projectnewy/tocktickit/pull/7):**
  Approved. Verified all five Issue 3 criteria. The one real blocker: the
  PR description claimed PR #6 and #7 would "combine naturally" — I tested
  the merge directly and it conflicted in `ai_use.md` and `tests.md`.
  Gave a concrete merge order (merge #6 first, rebase, resolve keeping both
  sides' content) and flagged the seed's idempotency log printing a
  constant instead of an actual before/after count.
  **Phuttipong's response:** merged in the suggested order and resolved
  both doc conflicts by keeping both sides' content.

- **[#8 — Issue 4](https://github.com/projectnewy/tocktickit/pull/8):**
  Approved. Verified all six criteria and the `curl` transcript against a
  live seeded DB. Flagged that both the health-check and categories fetch
  failure paths threw the identical error message, erasing the distinction
  between "API is down" and "API is up but the DB failed" — the case my
  PR #6 review had predicted would become real once Issue 4 shipped a
  route that could fail server-side. **Phuttipong's response:** acknowledged
  and split the two error messages.

- **[#9 — Lab 1 release](https://github.com/projectnewy/tocktickit/pull/9):**
  Approved. Confirmed the four Issues were all in, the merge history kept
  real (non-flattened) merge commits, and `tests.md` showed all five tests
  passing with the `curl` transcript attached. Flagged that `reviewer.md`
  was about to ship on `main` with two literal placeholder names and an
  empty "PRs I reviewed for my partner" section despite four real reviews
  having happened by that point. **Phuttipong's response:** filled in both
  names/student IDs and backfilled the missing review rows before merging.

_Note: the "Reviews I gave on `projectnewy/tocktickit`" section above records
an earlier full pass of this same Lab 1 assignment, completed before this
repository (`phittayanan/toktickit`) was recreated from scratch. All four
Issues in **this** repository (PR #5, #7, #8, #9) have now also gone through
peer review and merge, recorded above under "Reviews my partner gave me"._
