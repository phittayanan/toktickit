# Zen Green Responsive & Visual QA — Results (#23)

Checklist per `ui-spec.md` §13, run against Create Ticket, My Tickets, and
Ticket Detail at desktop (1280px), tablet (900px), and mobile (390px).
Screenshots: `artifacts/lab-02/screenshots/{create-ticket,my-tickets,ticket-detail}/`,
produced by `e2e/lab-02/visual-*.spec.ts` (`npx playwright test`, client on
`:5173` and server on `:4000` already running).

| Checklist item | Result |
|---|---|
| No clipped labels or truncated text without an ellipsis+tooltip | Pass — field labels, badges, and attachment filenames (`.tk-attachment-name`) all fit at every breakpoint |
| No overlapping controls or messages | Pass |
| No unintended horizontal page scroll | Pass — `html,body { overflow-x: hidden }` plus no fixed-width elements below 992px |
| Consistent field styling (editable vs. read-only vs. invalid vs. disabled) across all three screens | Pass — one shared token set (`client/src/theme.css`) drives all three; read-only fields use `--tk-readonly-bg` everywhere |
| All required Screen Flow States (§4) present and visually correct | Pass — Loading/Empty/No-results/Failure states reachable and screenshotted (`my-tickets/mobile-no-results.png`) |
| Desktop table / mobile card behavior correct on My Tickets | Pass — `d-none d-md-block` / `d-md-none` split confirmed in both screenshots |
| Badge color/label consistency for Requested Priority, IT Priority, Current Status | Pass — same `PriorityBadge`/`StatusBadge` components render identically on My Tickets and Ticket Detail |
| Filters, pagination, Attachment controls, and empty/no-results states remain usable at every viewport size | Pass |

## Gap found and fixed

The app previously shipped with the unmodified Vite starter `index.css`
(purple accent, serif-adjacent Lab-1 leftovers) and no Zen Green tokens at
all — every screen was plain Bootstrap blue. Added `client/src/theme.css`
as a token/override layer (imported after Bootstrap in `main.tsx`) covering
color tokens, button hierarchy, field states, badges, and the app shell
header, and trimmed `index.css` to a plain reset. A `btn-outline-secondary`
(Cancel) button was found rendering in a washed-out Bootstrap gray that
read as disabled; folded into the Secondary button override.

## Out of scope here

Keyboard-only accessibility pass (AC-32/E2E-03) and full E2E flows
(E2E-01/02) are tracked separately under issue #24, not re-verified by this
visual pass.
