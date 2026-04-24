---
title: Builder — New Presentation — Customer Logo — Preload logo from preview builder
priority: normal
status: done
area: builder
---

When a user creates a new presentation and has already added a logo in the preview builder, the Customer Logo field in the new presentation form should auto-populate with that logo. If no logo was added, the field should remain empty. Currently the logo is not being carried over into the presentation creation flow.

## Implementation Summary

**Problem:** Opening the "New Presentation" modal always reset the logo field to empty, even if the user had already uploaded a customer logo in the cover slide of the preview builder.

**Root cause:** `openCreatePresentationModal()` unconditionally cleared all fields including the logo preview. The cover slide stores its logo path as `customer-logo-src` in `slide-library.json` under the `lib-cover` slide's `edits`, but the modal never consulted that data.

**Files changed:**

- `builder/features/slides/index.html`
  - Added module-level `_cpPreloadedLogoSrc` variable to track the preloaded path
  - `openCreatePresentationModal()` now fetches `/api/slide-library` after opening, finds the `lib-cover` slide, reads `edits['customer-logo-src']`, and shows it as a logo preview if present
  - The `cpLogo` file-input `change` listener clears `_cpPreloadedLogoSrc` when the user selects a new file (new upload takes priority)
  - `doSubmit()` now sends `existingLogoSrc: _cpPreloadedLogoSrc` in the payload when no new file is chosen but a preloaded path exists

- `builder/server.js`
  - `POST /api/presentations`: added a fallback after the `logoFilename`/`logoData` block — if `body.existingLogoSrc` is provided and no new file was uploaded, uses it directly as `customerLogoSrc`
