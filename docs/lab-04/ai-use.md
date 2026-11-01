# AI Use and Reflection — Lab 4

## LLM Used

Claude Opus 5.5, in Claude Code.

## How I Worked: Agentic-Workflow Engineering

Lab 4 was done with agentic-workflow engineering. I talked to one
orchestrating agent, Firstmate, and to no other. That agent read the Lab 4
handout, collected my decisions through the grilling skill one question at a
time, and wrote the instructions for isolated worker agents: first a
specification agent, which wrote the contract under `docs/lab-04/`, then one
coding agent per GitHub Issue, working test-first. Every pull request went to
a classmate, [projectnewy](https://github.com/projectnewy), who reviewed and
merged it. No pull request was merged by an agent. The review record is in
[`reviewer.md`](reviewer.md).

What is mine and what is AI-written in this file:

- Every prompt under **Actual prompt** is my own words, exactly as I typed
  them, in Thai, with the original spelling.
- **My Reflection** below was drafted by AI and reviewed by me. It is not my
  own typed words. That was my choice (prompt 9).
- Every English rendering is a translation and is labelled as one.
- The **What it led to** notes, this section, and the layout of the file are
  AI-written, from the log of my prompts kept during the lab.

## Selected Key Prompts

Nine prompts, all given to the orchestrating agent. One-word approvals, and
prompts about managing the session itself, are left out.

| # | Actual prompt (my words, verbatim) | Translation | What it led to (AI-written) |
|---|---|---|---|
| 1 | https://app.leb2.org/class/1582970/activity ทำ lab4 ต่อ | [course activity page] Continue Lab 4. | Started Sprint 4. The agent read the deadline and the 60-point handout and asked how to order the work. |
| 2 | ตามลำดับของ software engineering ควรทำแบบไหน | What order does software engineering call for? | Changed the plan. The agent had recommended starting Issue #74 and the contract together; after it explained requirements before design and code, I chose the contract first, with only the part of #74 that does not depend on it running alongside. |
| 3 | แบบไหนดีกว่ากันลอง compare ข้อดี ข้อเสีย trade-off หน่อย | Which is better? Compare the pros, cons, and trade-offs. | Instead of picking from the list, I asked for a comparison of the status matrix options. I then kept the Lab 3 matrix and added only the Resolution Gate, so Closed and Cancelled stay final (BR-19, BR-26). |
| 4 | โอเคล่ะ แต่ถ้าอยากปรับเรื่อง UI ควรทำใน spec นี้เลยมั้ย | OK, but if I want to adjust the UI, should that go in this spec? | The UI decisions moved into the contract before any code: eight more questions, recorded as `ui-spec.md` (Actions Taken card, form inside the card, Dashboard as the first page, read-only card for the Requester). |
| 5 | ต้องให้เพื่อน merge หรือป่าว / แบบนี้ถ้าผมลืมแล้วเผอ merge ไปหละ | Does a friend have to merge it? / Then what if I forget and accidentally merge it? | Found that nothing stopped me merging my own pull request. New rule: the repository ruleset `classmate-review-required` needs one approval on `main` and `lab*-staging`. |
| 6 | ไม่เปิดหน้าเว็บจริงให้ผมเห็นบ้างหรอ | Aren't you going to open the real web page for me to see? | New expectation: test reports were not enough for me. A coding agent started the real app, and I looked at it myself. |
| 7 | เผลอ merge 86 ไปเองหรือป่าว | Did you accidentally merge #86 yourselves? | I checked the agent's work instead of assuming. It read the GitHub event log: the classmate merged #86, from a different account. |
| 8 | ก่อนที่จะส่งมีอะไรที่ควรทำก่อนส่งมั้ย | Is there anything we should do before submitting? | Produced the list of what was left before submission: merging #82, the release to `main`, and the records in `reviewer.md` and `ai-use.md`. |
| 9 | ใน sheet ของ LAB บอกให้เราเขียนเองหรอ / AI ร่าง / บันทึกตามการทำในของ CIO | Does the lab sheet say we must write it ourselves? / AI drafts. / Record it according to what the CIO actually did. | The agent admitted it had overstated: the handout does not say the Reflection must be self-written. I chose an AI draft, labelled as one, and had the draft corrected because it claimed I had checked everything myself, which was more than I did. |

Notes on the table:

- A `/` inside a prompt separates messages I sent one after another on the
  same point.
- Prompts 2 and 3 were typed into the "Other" box of a question from the
  agent. The others were sent as chat messages.
- "CIO" in prompt 9 is the title the orchestrating agent used for me.

Decisions (AI-written note): most of my design decisions were answers to the
agent's questions, one at a time. The 23 answers (D1 to D15 and U1 to U8) are
recorded in `specification.md` §11 and `ui-spec.md`. Each one ended on the
option the agent recommended; on D8 and D15 I first asked what the question
meant or for a comparison.

## My Reflection

**Drafted by AI and reviewed by me.** This passage is not my own typed words.
I chose this on 2026-11-01 (prompt 9). The English is a translation.

### 1. Specification agent

ใน Lab 4 specification agent ถามผมทีละเรื่อง แล้วผมเป็นคนตัดสินใจเอง เช่น Action Taken มีสถานะ Planned, Done และ Cancelled และห้ามลบ ให้ยกเลิกแทน ข้อดีคือเจอคำถามที่ผมนึกไม่ถึงตั้งแต่ก่อนเขียนโค้ด และทุกคำตอบกลายเป็นกฎที่มีเลขกำกับและทดสอบได้ ข้อเสียคือคำถามมีจำนวนมาก และถ้าผมตอบโดยกดตัวเลือกอย่างเดียวก็อาจไม่ได้คิดเหตุผลลึกพอ ผมจึงเห็นว่า spec ที่ดีไม่ได้ทำให้ผมคิดน้อยลง แต่ย้ายการคิดมาไว้ก่อนเริ่มงาน

*Translation:* In Lab 4 the specification agent asked me about one point at a
time and I made each decision myself. For example, an Action Taken has the
statuses Planned, Done, and Cancelled and cannot be deleted, only cancelled.
This surfaced questions I had not thought of before any code was written, and
every answer became a numbered, testable rule. The downside is the number of
questions, and if I only click options I may not think through the reasons. I
learned that a good specification does not make me think less; it moves the
thinking to before the work starts.

### 2. Coding agents

ผมไม่ได้เขียนโค้ดเอง ผมสั่งงานผ่าน agent ตัวหลัก (Firstmate) ซึ่งแบ่ง ticket ให้ coding agent หลายตัวทำพร้อมกัน งานจึงไปเร็วมาก แต่ PR แตะไฟล์เดียวกันจึงต้อง rebase หลายรอบ pipeline ตรวจเจอปัญหาจริง เช่น ข้อความ Resolution Summary หายตอนระบบปฏิเสธการเปลี่ยนสถานะ ส่วนหน้าที่ของผมคือตัดสินใจ ถามให้แน่ใจ และตรวจผล เช่น ขอเปิดหน้าเว็บจริงมาดูเอง และถามว่า PR ไหนถูก merge โดยใคร เพราะรายงานจาก agent อย่างเดียวยังไม่พอ สิ่งที่ได้เรียนรู้คือ agent ทำงานได้เร็ว แต่คนยังต้องรับผิดชอบการตัดสินใจและหลักฐานว่างานผ่านจริง ครั้งหน้าผมจะแบ่ง ticket ไม่ให้แตะไฟล์เดียวกัน และจะให้รัน test ครบทุก Lab ใน CI ตั้งแต่ต้น

*Translation:* I did not write the code myself. I directed the work through a
main agent (Firstmate), which split tickets among several coding agents
working in parallel, so the work went very fast, but PRs touched the same
files and needed several rebases. The pipeline found real problems, such as
the Resolution Summary being lost when a status change was refused. My part
was to decide, to question, and to check results: I asked to open the real web
page and see it myself, and I asked who had merged a PR, because an agent's
report alone is not enough. I learned that agents work fast, but a person
remains responsible for the decisions and for the evidence that the work
really passes. Next time I will split tickets so they do not touch the same
files and run every lab's tests in CI from the start.
