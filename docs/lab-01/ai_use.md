# AI Use and Reflection — Lab 1

I used Claude Code (Claude Sonnet 5) as my AI coding agent for Lab 1, working
directly in the terminal rather than an IDE-integrated agent.

## Selected Key Prompts

| Prompt Name | Actual Prompt Text | My Reflection |
|-------------|---------------------|-----------------|
| Summarize Lab 1 requirements | อ่าน lab 1 แล้วสรุปให้หน่อยต้องทำอะไรบ้าง | Worked in one shot — it read the labsheet PDF directly and gave a structured breakdown of the 4 issues, tech stack, and grading rubric. This is what I used to plan the rest of the work. |
| Scaffold repo structure | สร้าง GitHub repo ชื่อ toktickit ให้ฉัน (git init, สร้าง remote บน GitHub, push โครงสร้าง directory ตาม README...) แล้วสร้าง branch main และ lab1-staging | It found `gh` CLI wasn't installed, installed it via Homebrew, and asked me to run `gh auth login` myself since device-flow auth needs a human. It also caught that a repo with the same name already existed — instead of overwriting it silently, it stopped and showed me the commit history first, which turned out to be a fully completed old Lab 1 submission. Good instinct not to just proceed. |
| (my confirmation) | rename ไปล่ะ | It didn't just trust my claim — it re-verified via the GitHub API that the rename actually took effect before creating the new repo. Caught that my first "rename" attempt hadn't actually gone through. |
| Create GitHub Project + Issues | สร้าง GitHub Project + 4 Issues เลย | Needed an extra OAuth scope refresh (`project`, `read:project`) that I had to run interactively. It also found an old Project with the same name already existed and created a second one instead of colliding with it, then configured the 6-status Status field via raw GraphQL since the `gh` CLI has no command to edit existing single-select field options. |
| Invite peer reviewer | username คือ projectnewy | Straightforward — one `gh api` call to send a collaborator invite with write access. |
| Ask about review timing | เพื่อน review ตอนไหน | Good clarifying answer — explained the review happens at the `PR Review` Kanban state per issue, not upfront, and that it's a two-way review (both partners review each other), tied back to `docs/lab-01/reviewer.md`. |

## My Reflection

Using an agentic CLI tool instead of manual git/GitHub commands sped up the
repetitive setup work a lot (repo scaffolding, branch creation, Project/Issue
creation via `gh` and raw GraphQL). The main place I had to intervene was
anything requiring live human auth (`gh auth login`, `gh auth refresh`) —
correctly, the agent asked me to run those myself rather than trying to work
around them. It was also careful about destructive actions: before renaming
or reusing the `toktickit` name, it stopped to show me what was actually in
the existing repo/Project rather than assuming my first description was
accurate. I'll keep adding rows to this table as I implement Issues 1–4.
