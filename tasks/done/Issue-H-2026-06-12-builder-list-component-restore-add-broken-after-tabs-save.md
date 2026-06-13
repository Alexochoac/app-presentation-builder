---
title: Builder — List Component — Restore + Add — Fix controls lost after tabs blob save
type: Issue
priority: H
status: done
area: builder
completed_at: 2026-06-12 18:00
---

List items could be hidden (× button worked) but restore chips never appeared and the Add item button was gone after any tab rename — making hidden items permanently unrecoverable.

## Implementation Summary

**Root cause 1 — tabs.js strips data-builder-only on every save**

`tabs.js saveTabs()` clones the entire tabs element and strips all `[data-builder-only]` elements before saving the blob. Both `[data-ls-restore]` and `[data-ls-add]` had `data-builder-only` on them, so they were erased from saved state the moment the user renamed or added any tab. On next page load, the server served the slide with the stripped blob — `initOne` found `restoreArea = null` and `addBtn = null`, so hiding created no chip and add was gone.

**Root cause 2 — `li.innerText` returns `""` for hidden items**

`li.innerText` is CSS-aware: for `li.ls-list-hidden` (which has `display:none`), it returns `""`. Restore chips were created with `chip.textContent = '+ '` — technically present in the DOM but showing no label, effectively invisible. Also affected the hide-time path where `replace('⠿×', '')` was fragile (whitespace between button characters in `innerText` meant the replace often didn't match).

**Fixes applied**

`builder/features/slides/components/list.js`:
- Added `itemLabel(li)` helper: clones the `li`, removes `[data-builder-only]` children, reads `textContent` (CSS-independent). Replaces both `li.innerText.replace(...)` calls — at hide-time (line ~112) and at reload-time chip recreation (line ~191).
- Added self-heal block after `restoreArea` / `addBtn` resolution: if either is `null` and `parent` exists, creates and inserts/appends the missing element. Fixes current stale saved blobs immediately without requiring any data clearing.

`builder/features/slides/slide-05-technology-v2.html`:
- Removed `data-builder-only` from both `[data-ls-restore]` and `[data-ls-add]` elements in the Comparison panel (Panel 3), for both the left and right comparison lists (4 changes total). These elements are already hidden in readonly/published output via the scoped CSS rule `.template05-technology-readonly [data-ls-add], .template05-technology-readonly [data-ls-restore] { display:none }` and the server's readonly CSS `[data-ls-add],[data-ls-restore] { display:none !important }` — `data-builder-only` was redundant and harmful here.
