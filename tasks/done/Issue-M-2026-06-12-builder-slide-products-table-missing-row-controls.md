---
title: Builder — Slide — Products (template04) — Add row-level add / delete / hide controls to table
type: Issue
priority: M
status: done
area: slides
completed_at: 2026-06-13 14:00
---

The products table (template04-products / lib-products / deck-products) has no row management controls in the builder. Users cannot add new rows, delete existing rows, or hide rows from the published output. These controls exist on other list/table components and are expected here too.

Expected controls (matching list component conventions):
- **Add row** — append a new blank row to the table
- **Delete row** — permanently remove a row
- **Hide row** — toggle visibility in the published deck without deleting the data

## Implementation Summary

**Problem:** The `+ Add row` button was missing from the products table in the builder. Delete row (×) and hide row controls were also absent.

**Root cause:** The `[data-ls-add-row]` button in `slide-04-products.html` has `data-builder-only` on it. When any table action (hide row, hide column, add row) triggers a save, `saveTable()` detects the table is inside a `.ls-tabs[data-edit]` container and saves the entire tabs blob — stripping all `data-builder-only` elements in the process. On the next page load, the button is gone from the saved HTML, and `table.js` had no mechanism to recreate it.

`list.js` already had a self-heal block for exactly this scenario (`[data-ls-restore]` and `[data-ls-add]` are recreated if missing at init time). `table.js` was missing the equivalent.

**File changed:** `builder/features/slides/components/table.js`

**Fix:** Added a self-heal block in `initOne()` immediately after the `addRowBtn` lookup. If `addRowBtn` is `null` (stripped by a previous save) and the builder is not in readonly mode, a fresh `<button data-ls-add-row data-builder-only>+ Add row</button>` is created and inserted after `[data-ls-row-restore]` (or appended to wrap if the restore div is absent). The existing `addRowBtn` onclick wiring at the bottom of `initOne()` then picks it up normally.

Delete and hide row controls were already functional — they are injected per-row by `initRow()` which runs every time the table initialises, so they were never lost.
