---
title: Dashboard — Finished Presentations — Cards — Show company name, presentation name, and logo in list view
type: Feature
priority: M
status: done
area: dashboard-ui
---

Finished presentation cards should display the company name prominently and the presentation name below it (list view and grid view). In list view, the company logo should also appear but at a smaller size than in grid/card view.

## Implementation Summary

**Problem:** Finished presentation cards only showed the company name. Presentation name was never displayed, and the logo was hidden in list view.

**Root causes found:**
1. `presentationName` field did not exist in the data model — `presentations.json` only stored `customerName`. The field was never saved when creating a presentation.
2. The "Create Presentation" modal in the builder had no input for `presentationName`.
3. The server POST and PUT handlers didn't read or save `presentationName`.
4. In list view, the logo thumbnail was hidden via `display:none` with no small-size alternative.

**Files changed:**

- `builder/features/dashboard/index.html`
  - Changed `pres-thumb` base CSS from `display:none` to a 44×44px rounded square (visible in list view).
  - Grid view CSS overrides thumb to full-width 130px height (unchanged appearance).
  - Changed card body from inline "Company — Presentation" to two separate lines: company name bold on top, presentation name smaller/muted below.
  - Added font-size to initials fallback span for readability at small size.

- `builder/server.js`
  - `POST /api/presentations`: reads `body.presentationName` and includes it in the saved presentation object.
  - `PUT /api/presentations/:id`: reads `body.presentationName` and updates it on the record.

- `builder/features/slides/index.html`
  - Added "Presentation Name" input field (`#cpPresentationName`) to the Create Presentation modal.
  - Wired the field into the submit payload.
  - Added reset of the field in `openCreatePresentationModal()`.
