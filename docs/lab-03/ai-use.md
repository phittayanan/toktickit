# AI Use and Reflection — Lab 3

## LLM Used

Claude Opus 5.5, in Claude Code.

## How I Worked: Agentic-Workflow Engineering

Lab 3 was done with agentic-workflow engineering. I talked to one
orchestrating agent and to no other. That agent read the Lab 3 handout,
collected my design decisions through the grilling skill, and then wrote
the instructions for isolated worker agents: first a specification agent,
which wrote the contract under `docs/lab-03/`, then one coding agent per
GitHub Issue, each working test-first with the mattpocock tdd skill. The
orchestrating agent supervised those workers and routed every pull request
to a classmate, [@HolyThiccDaddy](https://github.com/HolyThiccDaddy), who
reviewed and merged it. No pull request was merged by an agent. The review
record is in [`reviewer.md`](reviewer.md).

What is mine and what is AI-written in this file:

- Every prompt under **Actual prompt** and both passages under **My
  Reflection** are my own words, exactly as I typed them, in Thai, with
  the original spelling.
- Every English rendering is a translation and is labelled as one.
- The **What it led to** notes, this section, and the layout of the file
  are AI-written, from the log of my prompts kept during the lab.
- Anything the AI wrote that is quoted here (its questions, a worker
  instruction) is labelled AI-written.

## Selected Key Prompts

Eight prompts, all given to the orchestrating agent. One-word approvals
and prompts about managing the session itself are left out.

| # | Actual prompt (my words, verbatim) | Translation | What it led to (AI-written) |
|---|---|---|---|
| 1 | เร่ิมทำ toktickit โดยเริ่มจากการอ่าน`[local folder]`/Lab_3_sheet.pdf ว่า lab3 ให้ทำอะไรบ้าง ต้องส่งอะไร เกณฑ์การให้คะแนนเป็นอย่างไร | Start working on toktickit, beginning by reading Lab_3_sheet.pdf: what Lab 3 asks for, what has to be submitted, and what the grading criteria are. | The agent read the whole handout and summarised the scope, the required files, and the grading rubric before any work started. |
| 2 | มีข้อไหนที่ต้องตัดสินใจจริงๆบ้าง | Which points really need a decision? | The agent separated the decisions the handout leaves open (session approach, password and failed-login rules, Administrator rights on Tickets, the status transition matrix, what Problem Appears Resolved does, ownership rules, initial passwords) from the details it could settle with a default. |
| 3 | ใช้ /mattpocock-skills:grill-me<br>then one letter per question: `A`, `A`, `A`, `A`, `A`, `B`, `A`, `A`, `A`, `A`, `A` | Use /mattpocock-skills:grill-me | The agent interviewed me: eleven questions, one at a time, each with options and a recommendation. Three of them are shown below the table; all eleven are in [`ai-use-decisions.md`](ai-use-decisions.md). The confirmed answers became the acceptance criteria given to the specification agent. |
| 4 | ทำไมแนะนำสร้างทั้งที่ยังไม่มี review and merge มาเลย | Why do you recommend creating them when there has not been any review and merge yet? | I challenged the agent's recommendation to create the Sprint 3 Issues before the contract pull request had been reviewed. The agent withdrew it, and the Issues were created only after the classmate merged the contract. |
| 5 | ต้องสร้าง CI มั้ย / ควรทำมั้ยเพราะอะไร | Do we need to create CI? / Should we do it, and why? | Asked after the classmate declined to approve a pull request that had no status checks. The agent recommended a small CI workflow as its own Issue and pull request and gave the reasons and the costs; I approved it. |
| 6 | ทำ แล้วพวก UI ใช้ playwrite | Do it, and for the UI things use Playwright. | Approved adding the client unit tests to CI, and told the agent that UI work is to be verified with Playwright. The agent passed that on to the coding agents for the UI Issues. |
| 7 | ทำไมแต่ล่ะ session context window มันสูงจัง / ไม่เรื่องโควต้าแต่ถ้า context window เหลือน้อย มันจะมีโอกาศหลอนได้มากกว่า / ปรับ | Why is the context window of each session so high? / It is not about quota, but when little context window is left there is more chance of hallucinating. / Adjust it. | The agent measured how much context a coding agent was using, and I approved three changes for the later Issues: Playwright assertions instead of reading screenshots, subagents for broad reading and for UI verification, and a fresh coding agent for each round of review fixes. |
| 8 | ทำไมรู้สึกใน kanban board มันไม่ update ตาม / ทำ | Why does it feel like the Kanban board is not updating along with the work? / Do it. | The agent found that Issues merged into the staging branch are never closed automatically and that nobody was moving the cards. I approved the agent keeping the board current from then on. |

Notes on the table:

- In prompt 1 the folder part of a file path on my computer is replaced
  by `[local folder]`. Nothing else in any prompt is changed.
- A `/` inside a prompt separates messages I sent one after another on
  the same point.

### Prompt 3 in Detail: Three of the Eleven Decisions

The questions are AI-written. The answers are mine.

| # | What the AI asked (AI-written) | My answer | What it led to (AI-written summary) |
|---|---|---|---|
| Q1 | How the login is remembered. A: a server-side session stored in PostgreSQL with an httpOnly cookie. B: a signed token (JWT) held by the browser. | `A` | Server-side sessions, so that logout and account deactivation end access at once. |
| Q6 | What happens when a Ticket Owner is deactivated or loses a staff role. A: block the change until their Tickets are reassigned. B: return their unfinished Tickets to the queue automatically. C: leave ownership as it is. | `B` | The one answer that departed from the AI's recommendation. The owner's unfinished Tickets return to the queue as unassigned in the same operation, so the rule that an owner is an active staff user always holds. |
| Q10 | Initial passwords for the Requesters migrated from Lab 2. A: migrate them with no usable password. B: the migration embeds one shared initial password. | `A` | Migrated accounts have no password until an Administrator sets an initial one, and no password or hash is written into a migration. |

Full table: [`ai-use-decisions.md`](ai-use-decisions.md).

## Example of an AI-Written Worker Instruction

I directed the coding agents through the orchestrating agent and did not
write prompts to them directly. The instruction each worker agent received
was written by the orchestrating agent from my prompts and decisions. The
test-first method was applied through the mattpocock tdd skill named in
those AI-written instructions.

A short excerpt of the instruction the orchestrating agent wrote for the
specification agent. **This text is AI-written, not mine:**

> - `docs/lab-03/tests.md`: the test plan in the labsheet section 10 table
>   format (Test ID, Type, Requirement / AC, What It Tests, Expected
>   Result, Automated Test File, Final). Every AC maps to at least one
>   planned test; cover unit, API or integration, UI component, UI style,
>   responsive, security and authorization, migration and regression, and
>   end-to-end. […] Final status is "Planned" for every row, since nothing
>   is implemented yet.
>
> […]
>
> Out of scope: any product or test code, Prisma schema or migration
> files, `docs/lab-03/ai-use.md`, `docs/lab-03/reviewer.md`, creating
> GitHub issues, and anything the labsheet section 4.2 excludes.
>
> If a decision above conflicts with the labsheet or with another decision
> in a way you cannot reconcile, report `needs-decision` with the conflict
> rather than choosing silently. A classmate reviews and merges this PR on
> GitHub; never merge it.

## My Reflection

My own words, exactly as written. The English under each passage is a
translation.

### 1. Specification agent

ใช้ skill grill me ของ mattpock เพื่อที่จะให้ agents interview เราเพื่อให้เข้าใจ context ที่ตรงกับเราอย่างมากที่สุด

*Translation:* I used the grill me skill of mattpock so that the agents
would interview me, in order to understand the context in the way that
matches mine as closely as possible.

### 2. Coding agents

ทำให้งานนี้แทบไม่ต้องทำอะไรเลยแต่ได้งานที่มีคุณภาพ โดยเพียงแค่ทำการ grill me เพื่อที่จะทำ spec แล้ว AI ก็แต่เป็น issuse แล้วไป ทำเขียน test ดู review แก้

*Translation:* It meant I hardly had to do anything on this work and
still got work of quality, just by doing the grill me in order to make
the spec; then the AI turned it into issues and went on to write the
tests, look at the reviews, and fix.
