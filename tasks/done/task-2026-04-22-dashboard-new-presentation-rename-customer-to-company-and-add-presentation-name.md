---
title: Dashboard — New Presentation — Rename "Customer Name" to "Company Name" and add "Presentation Name" field
priority: normal
status: done
area: dashboard-ui
---

In the new presentation creation form, rename the "Customer Name" field to "Company Name". Add a second field for "Presentation Name" so each presentation has its own distinct name separate from the company it belongs to. Update any downstream references (config, build scripts, display labels) to reflect this change.

## Implementation Summary

**Problem:** The dashboard Edit and Duplicate modals only had a "Customer Name" field. The task required renaming it to "Company Name" and adding a separate "Presentation Name" field. The finished presentations list also needed to display both fields together.

**Secondary issue found:** The modal inner box was nearly transparent in dark mode because `--surface` resolves to `rgba(255,255,255,0.05)` — fine for cards but not for dialogs.

**Files changed:**

- `builder/features/dashboard/index.html`
  - Added "Presentation Name" input (`editPresentationName`, `dupPresentationName`) to both Edit and Duplicate modals, above the Company Name field
  - Renamed all "Customer Name" labels to "Company Name" in both modals
  - Fixed modal transparency: added CSS overrides giving modals a solid `#1c1c1e` (dark) / `#ffffff` (light) background
  - Updated `openEditModal` and `openDupModal` JS to populate the new `presentationName` input
  - Updated `editSave` and `dupSave` to include `presentationName` in the API request body
  - Updated `buildItem` to display **Company Name** (bold) — Presentation Name (muted) in the list row
  - Updated search filter to include `presentationName` in the query match
  - Updated A→Z / Z→A sort to use the display name (presentationName || customerName)

- `builder/server.js`
  - POST `/api/presentations`: reads and stores `presentationName` in the new presentation record
  - PUT `/api/presentations/:id`: updates `presentationName` on edit
  - POST `/api/presentations/:id/duplicate`: reads and stores `presentationName` on duplicate
