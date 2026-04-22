---
title: Dashboard — Presentations — Duplicate — Generate own published link
priority: normal
status: done
area: dashboard-ui
---

When a presentation is duplicated, the duplicate does not show a published link. A duplicated presentation should behave like a new independent presentation and generate its own unique published link once published. Investigate whether the duplicate publish flow is missing, skipped, or the link is just not surfaced in the UI after duplication.

## Implementation Summary

**Problem:** Two separate bugs in `builder/features/dashboard/index.html`.

**Bug 1 — Published link missing from duplicate card.**
The initial list render (line ~245) builds a `trackingHtml` block containing the published URL and injects it into each card. The duplicate success handler built its `li.innerHTML` without that block, so the link never appeared — until refresh re-rendered from the server data.
- Fixed by adding `dupPresUrl` and `dupTrackingHtml` variables in the duplicate success handler, mirroring the same logic, and injecting `dupTrackingHtml` into the card's `.pres-body`.

**Bug 2 — "Duplicate failed." error (root cause of card not appearing at all).**
`umamiId` was declared with `var` inside the `.then()` callback of the `Promise.all` block, making it inaccessible to the duplicate handler which lives in the same IIFE but outside that `.then()`. Referencing `umamiId` in `dupTrackingHtml` threw a `ReferenceError`, which the `.catch()` caught and surfaced as "Duplicate failed." — preventing the card from being inserted into the DOM entirely.
- Fixed by hoisting `var umamiId = '';` to the outer IIFE scope and assigning it inside `.then()`, making it accessible to the duplicate handler.

**Files changed:** `builder/features/dashboard/index.html`
