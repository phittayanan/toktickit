# Lab 3 UI Specification — Zen Green, continued

Covers every Lab 3 screen: Login, Change Password, the application shell,
Requester Ticket Detail additions, IT Staff Ticket Queue, IT Staff Ticket
Detail, and User Management. Rule and criterion numbers refer to
`specification.md`; endpoints to `api-spec.md`. "Staff" means IT Staff or
Administrator; a "finished" Ticket is Closed or Cancelled.

## 1. Reuse of Lab 2

`docs/lab-02/ui-spec.md` stays in force and is not repeated here: colour
tokens (§1), typography and the 8px grid (§2), component states and the
button hierarchy (§3), screen flow states (§4), the priority badge rules
(§10), responsive breakpoints (§11), and accessibility rules (§12). The
tokens live in `client/src/theme.css`. Create Ticket and My Tickets keep
their Lab 2 layouts.

New screens are built from the existing pieces: the card surface, the
editable, read-only, invalid, and disabled field states, the Primary,
Secondary, Tertiary, Destructive, and Busy buttons, `PriorityBadge`,
`StatusBadge`, the My Tickets table-and-card pattern and its pagination
control, and the reason-required confirmation pattern from Remove
Attachment. A new screen may not introduce a colour, font, radius, or
shadow that is not a token.

## 2. Additions to the design language

### 2.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--tk-info-text` / `--tk-info-bg` | `#1F5E99` on `#E7F0FA` | Open status, IT Staff role badge, informational banners |
| `--tk-neutral-text` / `--tk-neutral-bg` | `#4F5F59` on `#F1F3F1` | Closed and Cancelled status, Requester role badge, Inactive |

The Internal Notes surface reuses the existing Warning pair
(`--tk-warning-text` on `--tk-warning-bg`): private content is a genuine
"take care" signal, which is what that token is reserved for.

### 2.2 Badges

Every badge pairs its colour with a text label, has fixed vertical
padding, and is rendered by one shared component per kind so it looks the
same on every screen.

| Kind | Value | Label | Style |
|---|---|---|---|
| Status | `NEW` | New | Solid Secondary green, white text (as Lab 2) |
| Status | `OPEN` | Open | Info |
| Status | `IN_PROGRESS` | In Progress | Pale green, Primary green text |
| Status | `WAITING_FOR_REQUESTER` | Waiting for Requester | Warning |
| Status | `RESOLVED` | Resolved | Success, with a check icon |
| Status | `REOPENED` | Reopened | Error-red text on a red tint |
| Status | `CLOSED` | Closed | Neutral |
| Status | `CANCELLED` | Cancelled | Neutral, outlined |
| Priority | `LOW`, `MEDIUM`, `HIGH` | Low, Medium, High | As Lab 2, for both Requested and IT Priority |
| Role | `REQUESTER` | Requester | Neutral |
| Role | `IT_STAFF` | IT Staff | Info |
| Role | `ADMINISTRATOR` | Administrator | Primary green outline |
| Account | active / inactive | Active / Inactive | Success / Neutral |
| Flag | indication set | Requester: appears resolved | Success outline, with a flag icon |
| Owner | none | Unassigned | Muted italic text, not a badge |

IT Priority is always set in Lab 3, so the Lab 2 "Not yet set" text no
longer appears.

### 2.3 Shared feedback components

- **Confirmation dialog**: a modal card with a title, one or two sentences
  stating exactly what will happen, a Cancel (Secondary) and a confirm
  button (Primary, or Destructive for Cancelled and Deactivate). Never a
  native `confirm()`. Dismissing it by Cancel, Escape, or the backdrop
  sends no request.
- **Inline alert**: a full-width message at the top of the card it
  concerns, `role="alert"`, in Error, Warning, Info, or Success colours.
  Used for failures that are not tied to one field.
- **Success notice**: a Success inline alert that confirms a completed
  action ("Owner updated", "Comment posted") and does not block the page.
- **Conflict notice**: for a `409` caused by someone else's change
  (`OWNER_CHANGED`, `STATUS_CHANGED`, `TICKET_FINISHED`): a Warning alert
  "This ticket was changed by someone else. The latest details are shown
  below.", after which the screen reloads the Ticket and keeps any typed
  text.
- **Forbidden page**: inside the shell, title "You don't have access to
  this page", one line of explanation, and a button to the role's landing
  screen. Shown for a path of another role or a `403` `FORBIDDEN`.
- **Not Found page**: "We couldn't find that page" or "Ticket not found",
  with a link back to the list. Shown for an unknown path or a `404`.
- **Safe failure**: for a `500` or a lost connection, "Something went
  wrong. Please try again." with a Retry action where a retry makes sense.
  Entered data stays in the form. No status code, stack, or server text
  other than the API's `error` string is shown.

## 3. Screen states

The Lab 2 states (Initial, Loading, Validation, Submitting, Success,
Failure, Empty, No results) apply to each screen below. Lab 3 adds
Forbidden, Not found, and Conflict as defined in §2.3. Which states each
screen has is listed in its section; every listed state has a test in
`tests.md`.

## 4. Application shell, navigation, and guards

### 4.1 Header

Primary green bar, as Lab 2. Left: the TokTickIT wordmark, linking to the
role's landing screen. Centre-left: role navigation with the active item
underlined. Right: a user menu button showing the signed-in user's name
and their role badge.

The user menu contains **Change Password** and **Logout**. The Lab 2
Development Requester display and Change Requester action are gone.

| Role | Navigation entries | Landing screen |
|---|---|---|
| Requester | My Tickets, Create Ticket | `/tickets` |
| IT Staff | Ticket Queue | `/staff/queue` |
| Administrator | Ticket Queue, User Management | `/admin/users` |

A destination a role cannot use is not rendered at all, neither disabled
nor hidden by CSS.

### 4.2 Guards

| Situation | Result |
|---|---|
| App starts | Full-page loading state while the current user is fetched; no protected content flashes |
| Not signed in, any protected path | Login. After signing in the user goes to their landing screen |
| Signed in, opens `/login` | Redirected to the landing screen |
| Must change password, any other path | Change Password in mandatory mode |
| Signed in, path of another role | Forbidden page |
| A request answers `401` `UNAUTHENTICATED` while the user was signed in | Client state is cleared and Login is shown with the Info alert "Your session has ended. Please sign in again." |
| Unknown path | Not Found page |

### 4.3 Logout

Logout is one click, without confirmation. While the request is in flight
the menu item is busy. Afterwards Login is shown and the browser Back
button does not reveal a protected screen: the guard runs again and no
cached Ticket data is rendered.

### 4.4 Layouts

- **Desktop and tablet**: one header row as above.
- **Mobile**: the navigation collapses behind a menu button; the user's
  name, role badge, Change Password, and Logout are in the same menu and
  stay reachable. Tap targets are at least 44px.

## 5. Login (`/login`)

A single card, at most 420px wide, centred on the page background, with
the TokTickIT wordmark above it. No shell header.

- **Controls**: title "Sign in to your account"; Email address (type
  email, autocomplete `username`); Password (autocomplete
  `current-password`) with a show/hide icon button; Sign In (Primary, full
  width). Below it, plain helper text: "Forgot your password? Contact an
  administrator." It is text, not a link; there is no reset flow.
- **Modes**: one.

| State | Behaviour |
|---|---|
| Initial | Empty fields, focus on Email |
| Validation | Empty email, malformed email, or empty password: message under that field, no request sent |
| Submitting | Sign In busy and disabled; fields disabled |
| Invalid credentials (`401`) | Error alert above the button: "Invalid email or password." Focus returns to Password |
| Inactive account (`403`) | Error alert: "This account is inactive. Contact an administrator." |
| Throttled (`429`) | Warning alert: "Too many failed sign-in attempts. Try again later." |
| Session ended | Info alert from §4.2 above the form |
| Failure | Safe failure alert; fields keep their values |
| Success | Landing screen, or Change Password if the password must be changed |

After any refused attempt (`401`, `403`, `429`) the password is cleared
and the email kept. The alert never says whether the email exists.

- **Layouts**: the card is centred at every width; on mobile it spans the
  width with 16px page padding.

## 6. Change Password (`/change-password`)

- **Controls**: Current password, New password, Confirm new password, each
  with a show/hide icon button (autocomplete `current-password`,
  `new-password`, `new-password`); a checklist panel on Pale green titled
  "Password must:"; Continue (Primary).
- **Checklist**, updated on every keystroke in New password. Each line
  shows a neutral dot when unmet and a green check when met, and the state
  is also exposed as text for screen readers:
  1. Be at least 8 characters
  2. Include upper and lower case letters
  3. Include a number
  4. Include a special character

| Mode | When | Differences |
|---|---|---|
| Mandatory | The user must change their password | No shell navigation; the header shows only the wordmark and Logout. Subtitle "You must change your password to continue." Current password is labelled "Current (temporary) password". No Cancel |
| Voluntary | Opened from the user menu | Inside the shell. Has a Cancel (Secondary) returning to the previous screen. Button reads "Change Password" |

| State | Behaviour |
|---|---|
| Validation | On submit: a missing field, an unmet checklist rule, a new password over 72 characters, a new password equal to the current one, or a confirmation that differs shows a message under that field and focuses the first invalid field. No request is sent |
| Submitting | Button busy and disabled |
| Wrong current password (`400`) | "Current password is incorrect." under Current password; the other fields keep their values |
| Server validation (`400`) | The API's message under the field it names |
| Failure | Safe failure alert; fields keep their values |
| Success, mandatory | Landing screen with the Success notice "Password changed." |
| Success, voluntary | Previous screen with the same notice |

- **Layouts**: one card, at most 480px wide, fields stacked at every
  width.

## 7. Requester Ticket Detail additions (`/tickets/:id`)

The Lab 2 read-only field grid and Attachments section are kept. Role:
Requester, own Tickets only; another Requester's Ticket shows the Not
Found page.

### 7.1 Field grid changes

- **Current Status** shows the badge for any of the eight statuses.
- **Ticket Owner** (new, read-only): the owner's name, or "Unassigned".
- **Resolution Summary** (new): a read-only text block in a Success-tinted
  panel with "Resolved on" and the date, shown only when a summary exists.

Nothing here is editable and no status control is rendered (BR-32).

### 7.2 Problem Appears Resolved

A card between the field grid and Public Comments.

| Ticket state | Card content |
|---|---|
| New, Open, In Progress, Waiting for Requester, or Reopened; not indicated | "Is the problem fixed? Let IT know. IT Staff decide when the ticket is resolved." and a **Problem Appears Resolved** button (Secondary) |
| Same statuses; indicated | Success-tinted: "You told IT on (date) that the problem appears resolved. IT Staff will review it." and a **Withdraw** button (Tertiary) |
| Resolved | Info text: "IT has marked this ticket resolved. If the problem has returned, say so in a comment below." No button |
| Closed or Cancelled | The card is not shown |

States: busy on the pressed button; Success notice after either action;
Conflict notice if the Ticket was resolved or finished meanwhile; safe
failure.

### 7.3 Public Comments

A card titled "Public Comments (n)" with the caption "Visible to you and
IT Staff."

- **Composer**: a labelled textarea "Add a comment", a character counter
  "n / 2000", and **Post Comment** (Primary). Hidden on a finished Ticket
  and replaced by Neutral text: "This ticket is closed (or cancelled).
  Create a new ticket if you need more help."
- **List**: newest first. Each entry shows an initials avatar, the
  author's name, their role badge, the date and time, and the body as
  plain text with line breaks kept and long words wrapped.

| State | Behaviour |
|---|---|
| Loading | Skeleton rows |
| Empty | "No comments yet." |
| Validation | Empty or whitespace-only, or over 2000 characters: message under the textarea, no request |
| Submitting | Post Comment busy; textarea read-only |
| Success | The new entry appears at the top, the composer clears, the count increases |
| Failure | Safe failure alert in the card; the typed text is kept |
| Conflict | Conflict notice; the composer is replaced as for a finished Ticket |

### 7.4 Attachments

Unchanged, except that on a finished Ticket the Add Attachment control and
each Remove action are not rendered; Download remains.

### 7.5 Layouts

- **Desktop**: field grid in three columns; the cards below at full width.
- **Tablet**: field grid in two columns.
- **Mobile**: everything stacked; Post Comment is full width.

## 8. IT Staff Ticket Queue (`/staff/queue`)

Roles: IT Staff and Administrator. One mode: list.

### 8.1 Columns

The handout suggests nine fields. The queue shows seven on desktop:

| Column | Content | Sortable |
|---|---|---|
| Ticket No. | Ticket Number, a link that opens Ticket Detail | Yes |
| Summary | Summary on the first line; Requester name, muted, on the second; the "appears resolved" flag badge when set | No |
| Category | Name | No |
| IT Priority | Badge | Yes |
| Status | Badge | No |
| Owner | Name or "Unassigned" | No |
| Last Updated | Date and time | Yes |

Why this set: a queue is for deciding what to work on next, so it leads
with what the work is, who it is for, how urgent IT considers it, where it
stands, and who has it. **Requested Priority** is left out because IT
Priority starts as a copy of it and is the value staff act on; the
original is on Ticket Detail. **Created Date** is left out because Last
Updated is the default order and the more useful recency signal; sorting
by created date is still offered in the sort control. The Requester name
shares the Summary cell instead of taking a column. Seven columns fit at
992px without horizontal scrolling.

### 8.2 Controls

- **Search** input: placeholder "Search by ticket number, summary, or
  requester…"; applied 300ms after typing stops or on Enter.
- **Status** select: "Unfinished" (default; every status except Closed
  and Cancelled), "All statuses", then each of the eight statuses.
- **Owner** select: "Any owner" (default), "Unassigned", "Assigned to me",
  then each eligible owner by name.
- **IT Priority** select: Any, Low, Medium, High.
- **Category** select: Any, then the active Categories.
- **Appears resolved** checkbox: "Requester says resolved".
- **Sort** select with a direction toggle: Last Updated (default,
  descending), Created Date, Ticket No., IT Priority. On desktop the
  sortable column headers do the same and show the direction.
- **Clear Filters** (Tertiary): returns every control to its default.
- **Result caption**: "Showing X to Y of Z tickets".
- **Pagination**: Previous, Next, and page numbers below the Ticket Queue,
  with a page-size select of 10, 25, 50. It is the shared pagination
  component named in §1.

Changing the search, a filter, the sort, or the page size returns to
page 1. The current search, filters, sort, and page are kept in the URL
query, so Back from Ticket Detail returns to the same view.

The whole row is clickable and the Ticket Number is a real link, so the
open-detail action is reachable by keyboard.

### 8.3 States

| State | Behaviour |
|---|---|
| Loading | Skeleton rows; the controls stay usable |
| Loaded | Rows and the result caption |
| Empty | Nothing is returned while every control is at its default: "There are no unfinished tickets in the queue." No Clear Filters |
| No results | Nothing is returned while any control differs from its default: "No tickets match your search or filters." with Clear Filters |
| Failure | Safe failure with Retry; the controls keep their values |
| Forbidden | A Requester opening the path sees the Forbidden page (§2.3) |

### 8.4 Layouts

- **Desktop (992px and above)**: the search and filters in one wrapping
  row above a seven-column table.
- **Tablet (768 to 991px)**: the same table with Category and Last
  Updated moved to a muted second line under Summary, leaving five
  columns. The filters wrap to two rows.
- **Mobile (below 768px)**: one card per Ticket. Top line: Ticket Number
  and Status badge. Then Summary, then Requester name, then a meta row
  with the IT Priority badge, Owner, and Last Updated, and the flag badge
  when set. The filters sit behind a "Filters" button that opens a panel
  and shows the number of active filters; Search stays visible. Sorting
  uses the Sort select. No horizontal scrolling.

## 9. IT Staff Ticket Detail (`/staff/tickets/:id`)

Roles: IT Staff and Administrator, with identical controls. Modes: **view
with operational edits** for an unfinished Ticket, **read-only** for a
finished one.

### 9.1 Structure, top to bottom

1. **Header row**: breadcrumb "Ticket Queue > (Ticket Number)", a "Back
   to Queue" button (Secondary) that restores the queue view, the Status
   badge, and the "appears resolved" flag badge with its date when set.
2. **Ticket information** card, all read-only styling: Ticket Number,
   Created, Last Updated, Requester (name and email, with an Inactive
   badge if the account is inactive), Category, Related System, Requested
   Priority (badge), Summary, Description.
3. **Operations** card, visually separated from the information card and
   titled "Manage this ticket": the three editable controls of §9.2. On a
   finished Ticket the card shows the same values read-only under the
   Neutral text "This ticket is closed (or cancelled) and can no longer be
   changed."
4. **Resolution Summary** panel, read-only, when one exists.
5. **Tabs**: Public Comments (n), Internal Notes (n), Attachments (n).

There is no Service Actions tab; Actions Taken is not in Lab 3.

### 9.2 Operational controls

Each control saves on its own and reports its own busy, success, and
failure state. There is no page-wide Save.

**Ticket Owner**

- Shows the current owner, or "Unassigned".
- **Claim** (Primary), shown when the Ticket is unassigned: assigns it to
  the signed-in user.
- **Owner select** listing "Unassigned" and each eligible owner, with an
  **Update Owner** button (Secondary), enabled once the selection differs
  from the current owner.
- If the current owner is someone other than the signed-in user, pressing
  Update Owner opens a confirmation: "(Ticket Number) is owned by
  (Current Owner). Reassign it to (New Owner)?" or "…Return it to the
  queue as unassigned?"
- Claiming or assigning a New Ticket also moves it to Open; the Success
  notice says so: "Owner updated. Status changed to Open."

**IT Priority**

- A select of Low, Medium, High and an **Update Priority** button
  (Secondary), enabled once the selection differs. Requested Priority is
  shown beside it as a read-only badge for comparison.

**Current Status**

- A select listing only the Ticket's `allowedTransitions`, with a "Choose
  a new status…" placeholder, and an **Update Status** button (Secondary).
- In Progress, Waiting for Requester, Open, and Reopened apply directly.
- **Resolved** opens a dialog with a required Resolution Summary textarea
  (10 to 2000 characters, counter, the caption "Visible to the
  Requester") and a Primary "Mark as Resolved" button. If the Ticket has
  no owner, the option is still listed but the dialog instead explains "A
  ticket needs an owner before it can be resolved." and offers Claim.
- **Closed** opens a confirmation: "Close (Ticket Number)? A closed ticket
  cannot be reopened or changed."
- **Cancelled** opens a Destructive confirmation: "Cancel (Ticket
  Number)? A cancelled ticket cannot be changed."

| State | Behaviour |
|---|---|
| Saving | The pressed button is busy; that control is disabled; the others stay usable |
| Success | Success notice; the card shows the returned values, including new `allowedTransitions` |
| Validation | Resolution Summary missing, too short, or too long: message under the textarea, dialog stays open |
| Conflict | Conflict notice (§2.3); the Ticket is reloaded |
| Failure | Safe failure alert in the Operations card; the selection is kept |

### 9.3 Public Comments tab

As §7.3, with the caption "Visible to the Requester and IT Staff." in an
Info-tinted strip above the composer, and the button **Post Public
Comment**.

### 9.4 Internal Notes tab

Made deliberately different so a private note is not posted publicly by
mistake:

- The tab label carries a lock icon.
- The whole panel sits on the Warning surface with a strip reading
  "Internal — never shown to the Requester."
- The composer is labelled "Add an internal note", has a counter
  "n / 4000", and its button reads **Add Internal Note**. It is Secondary,
  not Primary, so it does not look like Post Public Comment.
- Entries are listed newest first with the same avatar, name, role badge,
  and time layout, on the Warning surface.

The two composers are never visible at once: each lives in its own tab,
and switching tabs keeps any text typed in the other. States are those of
§7.3, with "No internal notes yet." as the empty text.

### 9.5 Attachments tab

The Lab 2 Attachment list, read-only: each active Attachment with its
name, size, and a Download action. Soft-removed Attachments appear in the
muted sub-list with their removal reason and no download. Staff have no
Add or Remove control. Empty text: "No attachments."

### 9.6 Page states

| State | Behaviour |
|---|---|
| Loading | Skeleton of the cards |
| Not found | Not Found page with a link to the queue |
| Forbidden | A Requester opening the path sees the Forbidden page |
| Failure | Safe failure with Retry |

### 9.7 Layouts

- **Desktop**: information card and Operations card side by side, about
  two thirds and one third; Summary and Description at full width of the
  information card; tabs below at full width.
- **Tablet**: Operations card below the information card, its three
  controls in a row.
- **Mobile**: everything stacked, the three controls stacked with
  full-width buttons, the tab bar scrolling within itself if needed
  without scrolling the page. Dialogs are full width with 16px margins.

## 10. User Management (`/admin/users`)

Role: Administrator. Modes: **list**, **create**, **edit**. One screen;
create and edit open a panel beside or over the list.

### 10.1 List

- Header: title "Users", **Create User** (Primary).
- Controls: Search ("Search by name or email…", applied 300ms after typing
  stops), a Role select (All roles, Requester, IT Staff, Administrator),
  and Clear Filters. Search and the role filter can be combined.
- Table columns: Name, Email, Role (badge), Status (badge), and an
  **Edit** action. A user with no password shows a muted "No password
  set" note under the name. The signed-in Administrator's own row is
  marked "(you)".
- The list is not paginated; all matching users are shown, ordered by
  name.

| State | Behaviour |
|---|---|
| Loading | Skeleton rows |
| No results | "No users match your search or filter." with Clear Filters |
| Failure | Safe failure with Retry |
| Forbidden | IT Staff or a Requester opening the path sees the Forbidden page |

An Empty state cannot occur: the signed-in Administrator is always listed.

### 10.2 Create and edit panel

- **Fields**: Full Name (required), Email Address (required), Role
  (required select of the three roles), Active (a labelled switch showing
  "Yes" or "No"). Required fields carry the red asterisk.
- **Create mode**: title "Create New User". An Info panel titled "Initial
  Password" reads "A temporary password is generated when you save and
  shown once. The user must change it at first login." There is no
  password field and no email option. Buttons: **Save User** (Primary),
  Cancel (Secondary).
- **Edit mode**: title "Edit User", fields prefilled. An extra section
  "Password" with **Set New Initial Password** (Secondary); for the
  signed-in Administrator's own account it is replaced by the text "Use
  Change Password in the menu for your own account." Buttons: **Save
  Changes** (Primary), Cancel.
- **Own account**: the Active switch is disabled with the helper text "You
  cannot deactivate your own account."

**Confirmations before saving**

- Turning Active off, or changing an IT Staff or Administrator to
  Requester: "(Name) will be signed out. N unfinished tickets they own
  will return to the queue as unassigned." N is the user's
  `ownedUnfinishedTicketCount`; when it is 0 the second sentence is
  omitted. The confirm button is Destructive for a deactivation.
- Any other role change: "(Name) will be signed out and will see the
  (Role) navigation at next sign-in."
- Set New Initial Password: "(Name)'s current password will stop working
  and they will be signed out."

**One-time password dialog**, shown after a create or a new initial
password:

- Title "Temporary password for (Name)".
- The password in a read-only monospace field with a **Copy** button that
  confirms "Copied".
- A Warning strip: "This password is shown only once. Give it to the user
  securely. They must change it when they sign in."
- A single **Done** button. Escape and the backdrop do not close it, so it
  is not dismissed by accident. After Done the password is discarded from
  client state and cannot be shown again.

| State | Behaviour |
|---|---|
| Validation | Missing or too-short name, malformed email, missing role: message under the field, no request |
| Submitting | Save busy and disabled |
| Duplicate email (`409`) | "A user with this email already exists." under Email |
| Self-deactivation (`409`) | Error alert in the panel: "You cannot deactivate your own account." |
| Last Administrator (`409`) | Error alert: "This is the last active administrator. Make another user an administrator first." |
| Not found (`404`) | The panel closes; Error alert above the list; the list reloads |
| Failure | Safe failure alert in the panel; fields keep their values |
| Success | The panel closes (after the one-time password dialog, if any); Success notice "User created." or "Changes saved.", naming any Tickets returned to the queue; the list reloads |

### 10.3 Layouts

- **Desktop**: the list takes about three fifths of the width and the
  panel opens beside it on the right, as in the handout mockup. With no
  panel open the list is full width.
- **Tablet**: the panel opens as a dialog over the list; the table keeps
  all five columns.
- **Mobile**: one card per user (Name with the Status badge; Email; Role
  badge; an Edit button). The panel is a full-screen dialog with stacked
  fields and full-width buttons.

## 11. Responsive rules

As Lab 2 (§11 there): desktop 992px and above, tablet 768 to 991px, mobile
below 768px, a content max-width of about 1200px, 44px minimum tap
targets on mobile, and at every width no clipped labels, no overlapping
controls or messages, no hidden actions, and no horizontal page scroll.
Long values (emails, names, Summaries, comment text) wrap or truncate
with an ellipsis and a full-text tooltip; they never widen the page.

## 12. Accessibility

As Lab 2 (§12 there), plus:

- Show/hide password buttons are real buttons with an accessible name that
  reflects their state.
- Alerts use `role="alert"`; Success notices use `role="status"`.
- Dialogs are labelled by their title, trap focus while open, close on
  Escape (except the one-time password dialog), and return focus to the
  control that opened them.
- Tabs follow the tab pattern: arrow keys move between tabs, the panel is
  labelled by its tab.
- Badges, the checklist, and the public-versus-internal distinction never
  rely on colour alone: each has text, and Internal Notes also has an icon
  and a different button label.
- Sortable column headers are buttons that announce the sort direction.

## 13. Visual inspection checklist

Completed for Login, Change Password, Requester Ticket Detail, Ticket
Queue, Staff Ticket Detail, and User Management at desktop (1280px),
tablet (900px), and mobile (390px). It is left unticked here; the results
are recorded in `docs/lab-03/visual-checklist-results.md` when the
screens exist (`tests.md` VIS rows).

- [ ] Design consistency: every screen uses only Zen Green tokens, the
      shared card, field, and button styles, and reads as the same
      application as the Lab 2 screens
- [ ] Role navigation: each role sees only its entries; the user's name
      and role badge are visible; Logout and Change Password are reachable
      at every width
- [ ] Badges: Status, Requested Priority, IT Priority, Role, and Account
      badges match §2.2 on every screen where they appear
- [ ] Editable versus read-only fields are visibly different, and the
      Operations card is clearly the only editable part of Staff Ticket
      Detail
- [ ] Public Comments and Internal Notes are unmistakably different
- [ ] Validation messages sit directly under the field they concern
- [ ] Focus: every control shows a visible focus indicator, and dialogs
      keep focus inside
- [ ] No clipped labels, and no truncated text without an ellipsis and
      tooltip
- [ ] No overlapping controls, messages, or dialogs
- [ ] No horizontal page scroll
- [ ] Table-to-card behaviour is correct on the Ticket Queue and User
      Management
- [ ] Loading, empty, no-results, forbidden, not-found, conflict, and
      failure states are present and styled

## 14. Screenshot paths

Playwright screenshots are stored under `artifacts/lab-03/screenshots/`:

```
artifacts/lab-03/screenshots/
├── authentication/           (login and change-password: desktop, tablet, mobile, plus state variants)
├── requester-ticket-detail/  (desktop, tablet, mobile)
├── staff-queue/              (desktop, tablet, mobile, plus no-results)
├── staff-ticket-detail/      (desktop, tablet, mobile, plus internal-notes and resolve dialog)
└── user-management/          (desktop, tablet, mobile, plus create panel and one-time password)
```
