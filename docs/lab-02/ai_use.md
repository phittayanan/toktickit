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
