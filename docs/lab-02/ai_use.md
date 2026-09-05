# AI Use and Reflection — Lab 2

I used Claude Code (Claude Sonnet 5) as my AI coding agent for Lab 2, same
workflow as Lab 1: working directly in the terminal, one feature branch per
GitHub Issue.

> **Note on completeness**: this file was started while implementing Issue
> #19 — Issues #15–18 (engineering contract, reference-data, Development
> Requester context, Create Ticket core) were done in earlier sessions
> before I set up this log, so their prompts aren't captured here. I'm
> keeping this table going for everything from #19 onward.

## Selected Key Prompts

| Prompt Name | Actual Prompt Text | My Reflection |
|-------------|---------------------|-----------------|
| Implement Issue #19 | `/mattpocock-skills:implement 19` | One-shot slash command with just the issue number as the argument. It looked up the issue via `gh issue view 19`, then delegated a background research agent to map out the Prisma schema, ADRs, api-spec, and existing Create Ticket code before writing anything — I didn't have to explain any of the context myself. It built the upload endpoint (multer + a service layer matching the existing `ticket.service.ts` pattern), the client picker + sequential upload UI, and full test coverage on both sides, then ran its own `/code-review` and fixed the 3 findings it surfaced (a swallowed multi-file error message, a dead helper function, and a real concurrency race on the 5-attachment cap) before committing. |
| Open the PR | เปิด PR สำหรับ #19 เลย | Pushed the branch and opened the PR against `lab2-staging` (not `main`) with a structured description including the review findings it had already fixed — matched the repo's documented merge convention without me having to restate it. |
| Wait for review | รอ review | Correctly just acknowledged and waited rather than polling or nagging — didn't try to merge or check status repeatedly. |
| Review complete | review แล้ว | Checked the PR's actual review state via `gh pr view --json reviews`, confirmed an `APPROVED` review existed before squash-merging and deleting the branch — didn't just take my word that it was reviewed. |
| Ask about `/clear` and AI-use logging | clear ก่อนมั้ยแล้วที่ใน lab มี ai use prompt จะหายไปหรือป่าว แล้วที่ผ่านมาได้ทำมั้ย | Explained clearly that `/clear` only wipes conversation context, not repo files, but then proactively checked whether a Lab 2 `ai_use.md` already existed (it didn't) and flagged that clearing now would lose the ability to reconstruct this session's own prompts — recommended drafting the file first instead of just answering the literal question. |

> **Note on completeness (2)**: Issue #22 (Ticket Detail attachments) was
> also implemented and reviewed in an earlier session before this log
> caught up to it — its own prompts aren't captured here either. Logging
> resumes from #23.

| Implement Issue #23 | `/mattpocock-skills:implement` (issue not specified as an argument, invoked mid-conversation) | Since the command carried no ticket number and the current branch's own ticket (#22) was already done, it didn't guess — it checked `gh issue list`/`gh issue view` for the next unblocked Lab 2 issue and asked me which one to do next via a multiple-choice question instead of just picking one. Once on #23, it discovered the app had never actually implemented the Zen Green theme at all (still the unmodified Vite starter CSS) — a real gap the issue's checklist wouldn't have caught by reading code alone, only by actually running the app and looking at it. |
| Implement Issue #24 | `/mattpocock-skills:implement 24` | Writing the two E2E specs (create-and-find, ownership) surfaced a genuine production bug: the Create Ticket attachment picker silently dropped every real file selection in an actual browser, because it captured `event.target.files` (a live `FileList`) and only read it after clearing `event.target.value`, which empties that live list in place. The existing Vitest suite never caught this because Testing Library's `fireEvent` fakes `.files` as a static value disconnected from `.value`. It didn't just patch around the bug in the test — it debugged it in the running app first (console logging inside the real handler, confirming the live-list behavior with a scratch test), then fixed the actual source and re-verified with a real Playwright file-chooser interaction before and after. |
| Open PR, wait, check review (repeated for #23, #24, and the final lab2-staging→main PR) | เปิด PR / รอ review / check review | Same disciplined loop as #19: opened each PR against the correct base (`lab2-staging` for feature PRs, `main` only for the final lab-level PR), never assumed a review had happened just because I said so, and used `gh pr view --json reviewDecision,reviews` to confirm `APPROVED` before treating anything as mergeable. When I said "merge" for #23, it merged directly (squash + delete branch) since I'd asked outright; for #24 and the final PR, when I said "wait for [friend] merge" instead, it just polled and reported rather than merging on its own initiative — it read the difference between "you merge it" and "someone else will merge it" correctly. |
| Reply to review comments | with a thanks / เพื่อน merge แล้ว | When a reviewer left a comment praising the attachment-bug catch, it drafted a specific, non-generic reply (referencing the actual live-FileList mechanism) rather than a bare "thanks". When told a PR was already merged by someone else, it verified via the API before reporting back, rather than taking "merge แล้ว" at face value. |
| Close stale issues | ปิด issue ให้เลย | Before closing anything it had already surfaced which issues were still open on GitHub despite the work being merged, and it closed exactly those seven (#14, #15, #19, #20, #21, #23, #24) with a comment on each — no more, no less — rather than bulk-closing everything in the repo. |

## My Reflection

The pattern that stood out most in this Lab was the agent treating its own
output as something to verify, not just produce: after implementing the
attachment upload feature it ran `/code-review` on itself unprompted (per
the `implement` skill's own instructions) and actually fixed what it found,
including a subtle one — the 5-active-attachment limit was "race-free" in a
comment but only true if every client behaved and called the endpoint
sequentially; it tightened that with a real `SELECT ... FOR UPDATE` row lock
so the guarantee holds even against a non-compliant or retried request, not
just the documented client flow. It also didn't merge its own PR — it
checked for a real `APPROVED` review via the GitHub API before squash-
merging, respecting the repo's peer-review requirement instead of assuming
"review แล้ว" meant it could proceed. The one process gap was on me, not the
agent: I hadn't been asking it to keep this log since #15, so the first
few Issues of Lab 2 have no prompt record — worth doing from the start next
lab.

The same verify-don't-assume habit showed up again at the very end of the
lab, on #23 and #24: rather than trusting that a `ui-spec.md` checklist was
already satisfied because the components existed, it actually ran the app
and looked at rendered screenshots — which is how it caught that Zen Green
had never been wired in at all. And rather than trusting that the Create
Ticket attachment feature worked because its unit tests were green, it drove
a real browser end-to-end for #24 — which is how it caught the live-FileList
bug that no mocked-DOM test could ever have exposed. Both are the same
lesson from a different angle: a green test suite proves the seam you
wrote the test at, not the feature.

The pattern that stood out most in this Lab was the agent treating its own
output as something to verify, not just produce: after implementing the
attachment upload feature it ran `/code-review` on itself unprompted (per
the `implement` skill's own instructions) and actually fixed what it found,
including a subtle one — the 5-active-attachment limit was "race-free" in a
comment but only true if every client behaved and called the endpoint
sequentially; it tightened that with a real `SELECT ... FOR UPDATE` row lock
so the guarantee holds even against a non-compliant or retried request, not
just the documented client flow. It also didn't merge its own PR — it
checked for a real `APPROVED` review via the GitHub API before squash-
merging, respecting the repo's peer-review requirement instead of assuming
"review แล้ว" meant it could proceed. The one process gap was on me, not the
agent: I hadn't been asking it to keep this log since #15, so the first
few Issues of Lab 2 have no prompt record — worth doing from the start next
lab.
