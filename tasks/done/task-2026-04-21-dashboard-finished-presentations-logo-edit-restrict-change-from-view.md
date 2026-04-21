---
title: Dashboard — Finished Presentations — Logo — Restrict change to edit flow only
priority: normal
status: done
area: dashboard-ui
---

Finished presentations should allow the logo to be changed, but only through the card's edit button or during the presentation setup flow — not from the viewer. The "change logo" option in the view/presentation mode should be disabled or hidden. Logo changes are only permitted before a presentation is finalized or via the edit action on the dashboard card.

## Implementation Summary

**Root cause discovered mid-session:** Every time a finished presentation was saved or edited, the code wrote the customer's logo and subheadline directly into the shared `library.json`. Since the builder reads that same file for the cover slide, the last-saved customer logo would bleed into the builder's working state — and into other presentations rebuilt afterward.

**Fixes made in `builder/server.js`:**

1. **Frozen HTML — no logo interactivity:** In `buildFrozenPresentation`, added Cheerio cleanup to remove `onclick` and `title` from `[data-edit="customer-logo"]` and delete all `<input type="file">` elements. Added CSS override `[data-edit="customer-logo"] { cursor: default !important; pointer-events: none !important; }` so hover styles from the slide CSS are also suppressed.

2. **Library isolation fix:** Removed all writes to `library.json` from the POST, PUT, and duplicate presentation endpoints. Customer-specific data (logo src, subheadline) is now stored only in `presentations.json` on the presentation record. `buildFrozenPresentation` applies these as in-memory overrides at build time using `Object.assign({}, libSlide.edits, coverEdits)` — the library is never touched.

3. **PUT endpoint extended:** Updated `PUT /api/presentations/:id` to accept `logoFilename` and `logoData` fields, save the logo file to uploads, update `pres.customerLogoSrc`, and call `buildFrozenPresentation` to regenerate the frozen HTML immediately.

**Fixes made in `builder/features/dashboard/index.html`:**

- Added a logo file input field to the Edit Presentation modal.
- Updated `openEditModal` to clear the file input on open.
- Rewrote the `editSave` handler to read the selected file via `FileReader`, send `logoFilename` and `logoData` to the PUT endpoint, and update the card thumbnail in the UI if a new logo was returned.

**Added utility endpoint:** `POST /api/presentations/rebuild-all` — regenerates all frozen HTML files from current presentation records. Used to apply fixes to existing presentations without re-saving each one manually.
