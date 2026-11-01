# Lab 4 Visual Checklist Results

The checklist is `ui-spec.md` §13. Screenshots are in
`artifacts/lab-04/screenshots/`, captured by
`e2e/lab-04/visual-dashboards.spec.ts` and
`e2e/lab-04/visual-actions-taken.spec.ts` at desktop (1280px), tablet (900px),
and mobile (390px). A state's plain name, such as `empty.png`, is its desktop
picture. Both specs also fail on any horizontal page scroll, and the dashboards
spec checks the card and table layouts of `ui-spec.md` §5.3 and §6.3;
`e2e/lab-04/responsive.spec.ts` does the same for the Actions Taken card.

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

## Staff and Requester Ticket Detail with Actions Taken

- [x] Design consistency: the card uses only Zen Green tokens and shared
      components and reads as one application
- [x] Badges for Action status and Follow-up match §2.2
- [x] Editable and read-only fields are visibly different, in the form and in
      view mode
- [x] Shared Actions Taken and private Internal Notes are unmistakably
      different: the card has the blue "visible to" strip, and Internal Notes
      keep their locked tab
- [x] Validation messages sit directly under the field they concern
- [x] No clipped labels, and no truncated text without an ellipsis and tooltip
      (a long description ends in an ellipsis, with the full text as its
      title, and opens in full)
- [x] No overlapping controls, messages, or dialogs
- [x] No horizontal page scroll
- [x] Actions Taken is a table on desktop and tablet and cards on mobile
- [x] Loading, empty, forbidden, not-found, conflict, and failure states are
      present and styled (conflict and the Cancel action confirmation are in
      the screenshots at each width; the others are covered by UI-06, UI-10,
      and E2E-12, without a screenshot)
- [x] Focus: every control shows a visible focus indicator, and dialogs keep
      focus inside (E2E-11)
- [x] Resolved (not available) and its reason are clear: the option is greyed
      and disabled, and the reason gives the Done and Planned counts and the
      link to the card, on a Ticket with one of each. A native select's popup
      is not in a page screenshot, so `resolved-not-available-*.png` show the
      select's options as a list.
