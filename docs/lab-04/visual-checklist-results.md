# Lab 4 Visual Checklist Results

The checklist is `ui-spec.md` §13. Screenshots are in
`artifacts/lab-04/screenshots/`, captured by
`e2e/lab-04/visual-dashboards.spec.ts` at desktop (1280px), tablet (900px),
and mobile (390px). That spec also fails on any horizontal page scroll and
checks the card and table layouts of `ui-spec.md` §5.3 and §6.3.

## Requester, IT Staff, and Administrator dashboards

- [x] Design consistency: every screen uses only Zen Green tokens and shared
      components and reads as one application
- [x] Dashboard entry is first, and the active page is clear for each role
- [x] Metric cards show a label, a value, and a working drill-down
- [x] Badges for status and priority match §2.2
- [x] No clipped labels, and no truncated text without an ellipsis and tooltip
      (long Summaries wrap)
- [x] No overlapping controls, messages, or dialogs
- [x] No horizontal page scroll
- [x] Loading, empty, forbidden, and failure states are present and styled

The items about Actions Taken, Resolved (not available), form fields,
validation, dialogs, and conflicts do not apply to these screens. They belong
to the Actions Taken and Ticket status screens.
