# Lab 2 UI Specification — Zen Green Theme

Applies to all four Lab 2 screens: Development Requester Selection, Create
Ticket, My Tickets, Requester Ticket Detail. Later labs must reuse these
tokens/rules rather than inventing a new visual system per screen (labsheet
§7).

## 1. Color Tokens

| Token | Value | Intended use |
|---|---|---|
| Primary green | `#006B3C` | App header background, primary action buttons, strong emphasis text |
| Secondary green | `#0B7A46` | Active nav tab indicator, focus accents, links, hover states |
| Pale green | `#EAF6EF` | Selected-row background, success surfaces, subtle section emphasis |
| Page background | `#F5F7F6` | Page canvas behind cards |
| Surface / card | `#FFFFFF` + 1px `#E1E7E4` border, restrained shadow | Form cards, table container, detail panels |
| Text | `#1A2E27` (dark charcoal-green) | Body text — never pure black |
| Editable field | white background, `#C9D3CF` neutral border | Text/select/textarea inputs |
| Read-only field | `#F1F3F1` soft gray-green background | System-generated/read-only values (e.g. Ticket Number, Requester on Ticket Detail) |
| Error | `#B3261E` text/border | Field-level validation messages |
| Warning | amber (`#B8860B` text on `#FFF6E0` badge) | Reserved for genuine warnings — never decorative |
| Success | `#0B7A46` text on `#EAF6EF` | Confirmation banners, Resolved-style badges |

## 2. Typography & Spacing

- Base font stack: system UI sans-serif (`-apple-system, "Segoe UI",
  Roboto, sans-serif`) for legibility across platforms without a network
  font dependency.
- Scale: page title 24px/700, section heading 18px/600, field label
  14px/600, body/input text 15px/400, helper/error text 13px/400.
- Spacing unit: 8px base grid — field vertical rhythm 16px, section gaps
  24px, card padding 24px (16px on mobile).

## 3. Component States

- **Editable field**: white background, neutral border; on focus, border
  becomes Secondary green + a visible 2px outline (keyboard and mouse
  alike — never `outline: none` without a replacement).
- **Read-only field**: soft gray-green background, same border radius as
  editable fields, no focus ring (not interactive), a small "read-only"
  visual cue is unnecessary once the background differs — background
  contrast alone must stay distinct enough not to be mistaken for
  editable.
- **Invalid field**: Error-red border + an error message rendered
  immediately below that specific field (never a single top-of-form
  banner as the only feedback) (labsheet §8.3).
- **Disabled control**: reduced opacity (~50%), no hover/focus affordance,
  `disabled` attribute set (not just visually styled) so it cannot be
  activated by keyboard or click.
- **Required-field marker**: a red asterisk directly after the label text;
  the asterisk is a visual hint only and never replaces the field-level
  validation message once the form is submitted invalid.
- **Button hierarchy**:
  - *Primary* (e.g. Submit, Continue): solid Primary green background,
    white text.
  - *Secondary* (e.g. Cancel, Change Requester): white background,
    Primary green border and text.
  - *Tertiary* (e.g. Clear Filters): text-only, Secondary green text, no
    border/background until hover.
  - *Destructive* (e.g. Remove Attachment): white background, Error-red
    border and text; on hover, Error-red background with white text.
  - *Busy*: the button that triggered a pending request shows an inline
    spinner + its label stays visible (never label-only replaced by a
    spinner with no text), and is `disabled` for the duration.
- **Attachment states**: *selected-pending-upload* (gray-green chip with
  filename + a spinner), *uploaded/active* (chip with filename, size, a
  download icon-button, and a Remove icon-button, both with accessible
  labels/tooltips), *upload-failed* (chip in Error-red styling with the
  filename, an inline error message, and a Retry button), *removed*
  (shown only in Ticket Detail's metadata, muted/struck-through styling,
  no download control — the file itself is never fetchable).

## 4. Screen Flow States

Every screen below must implement, and every state must be covered by a
test per `tests.md`:

- **Initial** — first render before any request resolves.
- **Loading** — a request is in flight (spinner or skeleton, never a
  blank screen).
- **Validation** — client-side field errors shown, no request sent.
- **Submitting** — request in flight after validation passed; primary
  button busy/disabled.
- **Success** — request succeeded; confirmation content or navigation.
- **Failure** — request failed (4xx/5xx/network); safe message shown,
  entered data preserved where applicable (Create Ticket, AC-12).
- **Empty** — the resource legitimately has zero items (e.g. no active
  Requesters, no Tickets yet) — distinct copy from...
- **No results** — a search/filter narrowed a non-empty set to zero
  matches; must read differently from Empty (AC-21/AC-24) and offer a
  "Clear Filters" action.

## 5. Application Shell & Navigation

- Header: TokTickIT wordmark/icon (left) on Primary green, "My Tickets"
  and "Create Ticket" nav links (center/left-of-profile), the selected
  Requester's name + a "Change Requester" affordance (right, via a
  Profile-style menu).
- The active nav item is visually distinct (Secondary-green underline or
  filled indicator) so the current page is always unambiguous.
- On mobile (< 768px), nav collapses to a hamburger/menu affordance; the
  Requester name + Change Requester action remains reachable, not hidden
  entirely.

## 6. Development Requester Selection Screen

Per labsheet §8.1 (see the reference screenshot there). Required elements:
TokTickIT title; one line of explanatory text stating this is a Lab 2
testing mechanism, not login; a labeled Development Requester dropdown
(required, red asterisk); a Continue button (Primary, disabled until a
selection is made); Loading/Empty/Failure states as in §4 above; every
control keyboard-reachable with visible focus. After selection: shell
displays the Requester's name; a Change Requester action becomes
available; any already-loaded Requester-specific data (My Tickets, Ticket
Detail) reloads for the newly selected identity.

Suggested explanatory copy: "Select a Development Requester to test
requester-specific ticket behavior. This is not a login screen.
Authentication and role-based access will be introduced in Lab 3."

## 7. Create Ticket (Create Mode) Layout

Top-to-bottom on desktop: system-generated/read-only context (none shown
pre-submission — Ticket Number only appears post-success); classification
fields grouped in a row/grid (Category, Related System, Requested
Priority); Summary (single-line, full width); Description (multi-line,
resizable vertically only, generous default height, full width);
Attachments section below the main fields (drag/click-to-select area +
the Attachment-state chips from §3); primary action (Submit) + secondary
action (Cancel/reset) at the bottom, Submit on the right per the
Primary/Secondary hierarchy. On success, the form is replaced by a
confirmation panel showing the Ticket Number prominently, the attachment
upload results (including any partial-failure/retry state per BR-17), and
a "View in My Tickets" / "Create Another" pair of actions.

## 8. My Tickets Screen Layout

Header row: page title + description, "Clear Filters" (tertiary) and
"Create Ticket" (primary) actions top-right. Controls row: search input
(placeholder "Search by ticket number or summary…"), then Category /
Requested Priority / IT Priority / Current Status filter dropdowns.
**Desktop (≥ 992px)**: a table — columns Ticket No. (sortable), Created
Date (sortable), Summary, Category, Requested Priority (badge), IT
Priority (badge), Current Status (badge), Last Updated (sortable);
row click opens Ticket Detail. **Tablet (768–991px)**: the same table with
lower-priority columns (e.g. Category) collapsing into an expandable
row/secondary line rather than being cut off. **Mobile (< 768px)**: one
card per Ticket — Ticket No. + Current Status badge on the top line,
Summary below, Category/Priority/Last-Updated as a compact meta row — no
horizontal scrolling of a cramped table. Pagination control at the
bottom: Previous/Next + page numbers + a "Showing X to Y of Z tickets"
caption, present in both desktop and mobile representations.

## 9. Requester Ticket Detail (View Mode) Layout

A read-only field grid at the top — Ticket Number, Ticket Date (created),
Category, Related System, Requester (read-only styling throughout, per
§3), Requested Priority (badge), IT Priority (badge, shows "Not yet set"
when null), Current Status (badge) — followed by Summary and Description
as read-only text blocks with adequate width. Below that, a clearly
separated Attachments section (a visual divider or card boundary makes
the shift from "Ticket information" to "Attachment actions" obvious, per
labsheet §8.5): the same Attachment-state chips as Create Ticket, an "Add
Attachment" control (same rules as creation-time upload), each active
Attachment's Download action, and each active Attachment's Remove action
(opens a small reason-required confirmation, not a native `confirm()`
dialog, and is styled per §3's Destructive button). Removed Attachments,
if shown at all, appear in a visually muted sub-list distinct from active
ones, with no download control. This screen must not implement Public
Comments, Internal Notes, Actions Taken, or any status-change control
(out of scope, §3 of `specification.md`).

## 10. Priority & Status Badge Rules

- Requested Priority / IT Priority: `LOW` → Pale-green badge, `MEDIUM` →
  amber-tinted badge, `HIGH` → red-tinted badge — color is reinforced by
  the text label itself (never color alone, for accessibility).
- Current Status: `NEW` → Secondary-green badge with white text (the only
  status value in scope for Lab 2 — see `specification.md` §3 Excluded).
- Badges never resize row height inconsistently — fixed vertical padding
  regardless of label length.

## 11. Responsive Rules

| Viewport | Required behavior |
|---|---|
| Desktop ≥ 992px | Multi-column layout as specified per screen; content centered with a max-width (~1200px) so lines don't over-stretch. |
| Tablet 768–991px | Two-column layout where practical; Summary/Description keep generous width; My Tickets table degrades gracefully (§8). |
| Mobile < 768px | Fields stack vertically; buttons remain touch-friendly (min 44px tap target); no horizontal page scrolling anywhere. |
| All sizes | No clipped labels, overlapping messages, hidden buttons, or unreadable Attachment filenames (truncate with ellipsis + full name in a tooltip/title attribute instead). |

## 12. Accessibility

- Every icon-only control (Download, Remove, Change Requester if
  icon-based) has an `aria-label` and a visible tooltip on hover/focus.
- Labels are associated to their control (`<label for>` / wrapping) —
  never placeholder-text-as-label.
- Focus order follows visual/reading order; focus indicators (2px
  Secondary-green outline) are never suppressed.
- Color is never the only signal — badges/errors/success states pair
  color with text or an icon+text.
- Non-native confirmation UI (e.g. the Remove-Attachment reason prompt)
  is keyboard-operable and traps focus appropriately while open.

## 13. Visual Inspection Checklist

Used at desktop/tablet/mobile for Create Ticket, My Tickets, and Ticket
Detail (labsheet §8.8) — tracked to completion in `tests.md` §4:

- [ ] No clipped labels or truncated text without an ellipsis+tooltip
- [ ] No overlapping controls or messages
- [ ] No unintended horizontal page scroll
- [ ] Consistent field styling (editable vs. read-only vs. invalid vs.
      disabled) across all three screens
- [ ] All required Screen Flow States (§4) present and visually correct
- [ ] Desktop table / mobile card (or responsive-table) behavior correct
      on My Tickets
- [ ] Badge color/label consistency for Requested Priority, IT Priority,
      Current Status
- [ ] Filters, pagination, Attachment controls, and empty/no-results
      states remain usable at every viewport size

## 14. Screenshot Paths

Playwright visual-check screenshots are stored under
`artifacts/lab-02/screenshots/`:

```
artifacts/lab-02/screenshots/
├── create-ticket/   (desktop.png, tablet.png, mobile.png, plus state variants)
├── my-tickets/      (desktop.png, tablet.png, mobile.png, plus state variants)
└── ticket-detail/   (desktop.png, tablet.png, mobile.png, plus state variants)
```
