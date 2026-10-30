# Lab 4 UI Specification — Zen Green, final

Covers every Lab 4 screen change: the dashboards, the shell, the Actions
Taken card on Staff and Requester Ticket Detail, the Ticket status control,
and the drill-down additions to My Tickets and User Management. Rule and
criterion numbers refer to `specification.md`; endpoints to `api-spec.md`.
"Staff" means IT Staff or Administrator; a "Finished" Ticket is Closed or
Cancelled. "L3 UI §n" means a section of `docs/lab-03/ui-spec.md`.

## 1. Reuse of Labs 2 and 3

`docs/lab-02/ui-spec.md` and `docs/lab-03/ui-spec.md` stay in force and are
not repeated here. New screens use the existing tokens in
`client/src/theme.css`, the card surface, the field states, the button
hierarchy, `StatusBadge` and `PriorityBadge`, the table-and-card pattern, and
the feedback components of L3 UI §2.3. A new screen may not introduce a
colour, font, radius, or shadow that is not a token. There are no charts.

## 2. Additions to the design language

### 2.1 Tokens

None. Lab 4 reuses the Success, Info, Neutral, and Warning pairs.

### 2.2 Badges

| Kind | Value | Label | Style |
|---|---|---|---|
| Action status | `PLANNED` | Planned | Info |
| Action status | `DONE` | Done | Success, with a check icon |
| Action status | `CANCELLED` | Cancelled | Neutral, outlined |
| Flag | Follow-Up Required? is yes | Follow-up | Warning outline, with a flag icon |

They follow L3 UI §2.2: one shared component per kind, text with every
colour.

### 2.3 Shared components

- **Metric card**: a card that is one link, holding a label, a large value,
  and an optional caption. It keeps the hover and focus states of a link and
  shows `0` when the count is zero.
- **Link table**: a two-column table of a label (a badge where one exists)
  and a count, each row one link.
- **Dashboard list**: a titled card of at most five rows. Each row is a link
  to the item, showing the Ticket Number, Summary, and a Status badge, with
  extra fields as each screen states.
- **Action conflict notice**: for `ACTION_TAKEN_CHANGED`, a Warning alert at
  the top of the form, "This action was changed by someone else. Reload to
  see the latest version.", with a **Reload** button (Secondary).

## 3. Screen states

The states of L3 UI §3 apply to each screen below. Every listed state has a
test in `tests.md`.

## 4. Application shell

### 4.1 Navigation and landing

Dashboard is the first entry for every role and the landing screen after
sign-in. The active entry is underlined as in Lab 3.

| Role | Navigation entries | Landing screen |
|---|---|---|
| Requester | Dashboard, My Tickets, Create Ticket | `/dashboard` |
| IT Staff | Dashboard, Ticket Queue | `/staff/dashboard` |
| Administrator | Dashboard, Ticket Queue, User Management | `/staff/dashboard` |

The wordmark, the Forbidden page button, and every guard of L3 UI §4.2 that
names the landing screen use this table.

### 4.2 Guards

| Situation | Result |
|---|---|
| Staff opens `/dashboard` | Forbidden page |
| Requester opens `/staff/dashboard` | Forbidden page |

All other guards are as L3 UI §4.2.

## 5. Requester Dashboard (`/dashboard`)

Role: Requester. One mode: view. Own Tickets only (BR-30), from
`GET /api/requester/dashboard`.

### 5.1 Structure

1. Title "Dashboard".
2. **Metric cards**:
   - "Open Tickets", caption "Not yet resolved", opens
     `/tickets?currentStatus=open`.
   - "Waiting for Requester", caption "Needs your reply", opens
     `/tickets?currentStatus=WAITING_FOR_REQUESTER`.
3. **Dashboard lists**, captioned "Last 7 days":
   - "Recently updated": Ticket Number, Summary, Status badge, Last Updated.
   - "Recently resolved": Ticket Number, Summary, Status badge, Resolved on.

   Each row opens `/tickets/:id`.

### 5.2 States

| State | Behaviour |
|---|---|
| Loading | Skeleton cards and rows |
| Loaded | As §5.1 |
| Empty | Cards show `0`. Lists read "No tickets updated in the last 7 days." and "No tickets resolved in the last 7 days." |
| Forbidden | Staff opening the path see the Forbidden page |
| Failure | Safe failure with Retry in place of the content |

### 5.3 Layouts

- **Desktop and tablet**: the two metric cards in one row; the two lists side
  by side on desktop, stacked on tablet.
- **Mobile**: one column.

## 6. IT Staff Dashboard (`/staff/dashboard`)

Roles: IT Staff and Administrator. One mode: view. From
`GET /api/staff/dashboard`.

### 6.1 Structure

1. Title "Dashboard".
2. **Metric cards**:
   - "Unassigned" opens `/staff/queue?owner=unassigned`.
   - "Owned by me" opens `/staff/queue?owner=me`.
   - "My Planned Actions Taken" moves focus to the list of the same name,
     since its items may be on several Tickets.

   With no `status` in the URL the queue uses its default Unfinished view
   (L3 UI §8.2), which matches the counts.
3. **Link tables**:
   - "By status": the six Unfinished statuses with Status badges; each row
     opens `/staff/queue?status=<value>`.
   - "By IT Priority": High, Medium, Low with Priority badges; each row opens
     `/staff/queue?itPriority=<value>`.
4. **Dashboard lists**:
   - "My Planned Actions Taken": Ticket Number, Action Description, Action
     Date/Time. Each row opens `/staff/tickets/:id#actions-taken`.
   - "Urgent": Ticket Number, Summary, Status and IT Priority badges, Owner
     or "Unassigned".
   - "Recently updated", captioned "Last 7 days": as Urgent, plus Last
     Updated.

   Urgent and Recently updated rows open `/staff/tickets/:id`.

### 6.2 States

| State | Behaviour |
|---|---|
| Loading | Skeleton cards, tables, and rows |
| Loaded | As §6.1 |
| Empty | Cards and tables show `0`. Lists read "No planned actions assigned to you.", "No urgent tickets.", and "No tickets updated in the last 7 days." |
| Forbidden | A Requester opening the path sees the Forbidden page |
| Failure | Safe failure with Retry in place of the content |

### 6.3 Layouts

- **Desktop**: three metric cards in a row; the two link tables side by side;
  the lists at full width in the order above.
- **Tablet**: as desktop, with the lists stacked.
- **Mobile**: one column, with no horizontal scroll. List rows wrap.

## 7. Administrator Dashboard

Same path and content as §6 for an Administrator, with one more section
directly under the metric cards, from `GET /api/admin/dashboard`:

- Title "Active accounts", caption "User Management also lists inactive
  accounts."
- Metric cards "Requesters", "IT Staff", and "Administrators", opening
  `/admin/users?role=<role>`.

The section loads on its own. If its request fails, it shows a safe failure
with Retry and the rest of the dashboard stays usable. IT Staff never see the
section and never make the request.

## 8. Actions Taken card

One component, used on Staff Ticket Detail and Requester Ticket Detail.

### 8.1 Placement

- **Staff Ticket Detail** (`/staff/tickets/:id`): its own card below "Manage
  this ticket" and above the tabs, at full width, with the anchor
  `#actions-taken`. It is added to the structure of L3 UI §9.1, between the
  Operations card and the Resolution Summary panel.
- **Requester Ticket Detail** (`/tickets/:id`): the same card directly above
  Public Comments.

Title "Actions Taken (n)", where n counts every status. Caption in an
Info-tinted strip: "Visible to the Requester and IT Staff." for staff,
"Visible to you and IT Staff." for a Requester. Anything private belongs in
an Internal Note (BR-18).

### 8.2 List

Newest created first, with Cancelled ones included (BR-11, BR-17).

| Column | Content |
|---|---|
| Date | Action Date/Time |
| Description | Action Description on one line, with an ellipsis |
| Status | Action status badge, plus the Follow-up badge when set |
| Actions | Staff only, §8.5 |

The Description is a disclosure button that opens view mode in place.

### 8.3 Modes

| Mode | Who | Content |
|---|---|---|
| View | Everyone | The row expands to show every field read-only: Action Date/Time, Action Description, Result, Performed by, Status, Follow-Up Required?, Follow-up Note, Attachment Notes, Created by, Created at |
| Create | Staff, Unfinished Ticket | **Add** (Primary, in the card header) opens the form at the top of the card |
| Edit | `canEdit` rows | **Edit** opens the form in place of the row |
| Mark Done | `canEdit` rows | **Mark Done** opens the same form for completion |
| Cancel action | `canEdit` rows | **Cancel action** opens a confirmation |

Only one form is open at a time. While it is open, Add and the row buttons
are disabled.

### 8.4 Form

Opens inside the card; there is no modal dialog. Required fields carry the
red asterisk.

| Field | Control | Behaviour |
|---|---|---|
| Date/Time | Date and time input | Defaults to now on create |
| Description | Textarea, counter "n / 2000" | Required |
| Result | Textarea, counter "n / 2000" | Required when Status is Done |
| Status | Select: Planned, Done | Defaults to Planned on create. Cancelled is reached only by Cancel action |
| Performed by | Select of eligible users | Defaults to the signed-in user on create. A current assignee who is no longer eligible stays listed, marked "(no longer eligible)" |
| Follow-up required | Checkbox | Reveals Follow-up note |
| Follow-up note | Textarea, counter "n / 2000" | Required when checked |
| Attachment notes | Text input, counter "n / 500", helper "Which file or image to look at" | Optional |

Buttons: **Save** (Primary) and **Cancel** (Secondary), which closes the form
and sends nothing.

- **Mark Done** opens the form with Status fixed at Done and read-only, Result
  required and focused, and the button reading **Mark Done**. A future
  Date/Time is replaced by now.
- **Create** keeps one `clientRequestId` until the form saves or closes, so a
  retry after a failure cannot create a second record (BR-15).

### 8.5 Row buttons

Shown only when `canEdit` is true, so only to users permitted by BR-16: **Edit**
(Tertiary), **Mark Done** (Secondary), and **Cancel action** (Destructive
text). Done and Cancelled rows have none.

**Cancel action** opens a Destructive confirmation (L3 UI §2.3): "Cancel this
action? It stays on the ticket as Cancelled and can no longer be changed."
Its confirm button reads **Cancel action** and its dismiss button **Keep
action**. Confirming sends the record unchanged with status `CANCELLED`.

### 8.6 Requester view

The same card, read-only: no Add, no form, and no row buttons. Rows still
open view mode, so a Requester can read every field (BR-17).

### 8.7 Finished Ticket

No Add and no row buttons, for anyone. Staff see the Neutral text "This ticket
is closed (or cancelled). Its actions can no longer be changed." A Planned
row stays listed as Planned. View mode still works.

### 8.8 States

| State | Behaviour |
|---|---|
| Loading | Skeleton rows; the rest of the page stays usable |
| Empty | Staff: "No actions recorded yet." Requester: "IT Staff have not recorded any actions yet." |
| Validation | Message under the field; focus moves to the first invalid field; no request |
| Server validation (`400`) | The API's message under the field it names |
| Submitting | Save or Mark Done busy and disabled, fields read-only (BR-37) |
| Success | The form closes, the Success notice reads "Action added.", "Action updated.", "Action marked Done.", or "Action cancelled.", and the list and Ticket reload, which updates Last Updated, the count, and §9 |
| Stale edit (`ACTION_TAKEN_CHANGED`) | Action conflict notice; the form stays open with the typed data. Reload replaces it with the latest version, or closes it if the action is no longer Planned |
| Final (`ACTION_TAKEN_FINAL`) or Finished (`TICKET_FINISHED`) | Conflict notice (L3 UI §2.3) in the form; typed data is kept and Save is disabled, so it can be copied |
| No edit right (`403`) | Error alert with the API's message; typed data is kept |
| Not found (`404`) | Error alert; typed data is kept |
| Failure | Safe failure alert in the form or card; typed data is kept; the list offers Retry |

### 8.9 Layouts

- **Desktop and tablet**: a table. The form uses two columns on desktop and
  one on tablet.
- **Mobile**: each Action Taken is a stacked card: date and status badge on
  top, then the description, then full-width buttons. The form is one column
  with full-width buttons. No horizontal scroll.

## 9. Ticket status control

Changes L3 UI §9.2 Current Status; everything else there stands.

The select lists `allowedTransitions`. The Resolution Gate is unmet when
`actionTakenCounts.done` is 0 or `actionTakenCounts.planned` is above 0. Then,
if Resolved is in `allowedTransitions`:

- The option stays listed, disabled, as **Resolved (not available)**.
- A text reason sits directly under the select, tied to it by
  `aria-describedby`: "Resolved needs at least one Done action and no Planned
  actions. Done: (n). Planned: (n)."
- A link **Go to Actions Taken** moves focus to the card.

When the gate is met, Resolved is a normal option and opens the Lab 3 dialog,
including its no-owner branch. The reason disappears as soon as the card's
reload shows the gate is met. The backend enforces the rule regardless.

| State | Behaviour |
|---|---|
| Gate refused (`DONE_ACTION_REQUIRED`, `PLANNED_ACTION_REMAINS`) | A stale screen sent the request: Conflict notice in the Operations card, and the Ticket and card reload |
| Other states | As L3 UI §9.2; success refreshes the Ticket summary status |

## 10. Drill-down additions

- **My Tickets** (`/tickets`) reads `currentStatus` from the URL when it opens.
  Its Current Status select gains an "Open Tickets" option, meaning the five
  statuses of BR-30, shown in the URL as `currentStatus=open`. "All Statuses"
  stays the default and every other Lab 2 behaviour is unchanged.
- **Ticket Queue** needs no change: its URL view already holds these filters.
- **User Management** (`/admin/users`) reads `role` from the URL when it opens
  and starts with that role filter applied.

## 11. Responsive rules

As Lab 2 and Lab 3 (L3 UI §11): desktop 992px and above, tablet 768 to 991px,
mobile below 768px, 44px minimum tap targets on mobile, and at every width no
clipped labels, no overlapping controls, no hidden actions, and no horizontal
page scroll. Long descriptions, names, and Summaries wrap or truncate with an
ellipsis and a full-text tooltip.

## 12. Accessibility

As Lab 2 and Lab 3 (L3 UI §12), plus:

- A metric card and a link-table row are real links whose accessible name
  holds the label and the value, for example "Unassigned: 4".
- Dashboard sections are headed regions, in heading order.
- An Action Taken disclosure button exposes `aria-expanded`.
- Opening a form moves focus to its first field or, for Mark Done, to Result.
  Closing it returns focus to the button that opened it.
- The Resolved reason is always visible text, because a disabled option cannot
  take focus.
- Action status and Follow-up never rely on colour alone: each has text, and
  the shared Actions Taken card has a written visibility caption.

## 13. Visual and accessibility checklist

Completed for the Requester Dashboard, IT Staff Dashboard, Administrator
Dashboard, Staff Ticket Detail with Actions Taken, and Requester Ticket Detail
with Actions Taken at desktop (1280px), tablet (900px), and mobile (390px). It
is left unticked here; the results are recorded in
`docs/lab-04/visual-checklist-results.md` when the screens exist (`tests.md`
VIS rows).

- [ ] Design consistency: every screen uses only Zen Green tokens and shared
      components and reads as one application
- [ ] Dashboard entry is first, and the active page is clear for each role
- [ ] Metric cards show a label, a value, and a working drill-down
- [ ] Badges for status, priority, Action status, and Follow-up match §2.2
- [ ] Editable and read-only fields are visibly different, in the form and in
      view mode
- [ ] Shared Actions Taken and private Internal Notes are unmistakably
      different
- [ ] Resolved (not available) and its reason are clear
- [ ] Validation messages sit directly under the field they concern
- [ ] Focus: every control shows a visible focus indicator, and dialogs keep
      focus inside
- [ ] No clipped labels, and no truncated text without an ellipsis and tooltip
- [ ] No overlapping controls, messages, or dialogs
- [ ] No horizontal page scroll
- [ ] Actions Taken is a table on desktop and tablet and cards on mobile
- [ ] Loading, empty, forbidden, not-found, conflict, and failure states are
      present and styled

## 14. Screenshot paths

Playwright screenshots are stored under `artifacts/lab-04/screenshots/`:

```
artifacts/lab-04/screenshots/
├── staff-dashboard/      (IT Staff and Administrator: desktop, tablet, mobile, plus empty and failure)
├── requester-dashboard/  (desktop, tablet, mobile, plus empty and failure)
└── actions-taken/        (staff and Requester: desktop, tablet, mobile, plus form, conflict, and Resolved not available)
```
