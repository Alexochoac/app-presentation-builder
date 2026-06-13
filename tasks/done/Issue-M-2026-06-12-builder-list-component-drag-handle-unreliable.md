---
title: Builder — List Component — Drag Handle — Fix unreliable drag-and-drop on list items
type: Issue
priority: M
status: done
area: builder
completed_at: 2026-06-13 14:00
---

The drag handle icon on list component items is unreliable: clicking it sometimes starts a drag correctly, but other times moves/drags the icon element itself instead of the list item. The hit target or drag initiation logic on the handle needs to be tightened so the grab always registers on the row, not the icon.

## Implementation Summary

**Problem:** Drag-and-drop via the ⠿ handle was unreliable on both list items and table rows. Clicking the handle sometimes dragged the icon itself, entered edit mode, or did nothing.

**Root causes found (three layered issues):**

1. **Browser picked up the icon as drag source** — the handle element (`<button>` / `<span>`) had no `draggable="false"`, so in some browser/OS combinations it was treated as an independent drag target.

2. **`ev.preventDefault()` in mousedown blocked drag initiation** — an early fix added `preventDefault()` to stop text selection, but Chrome/Safari use the mousedown event to decide whether a drag can start; `preventDefault()` on mousedown suppresses that, making drag intermittently fail.

3. **Toggle timing was too late** — the pattern `mousedown → li.draggable = true` doesn't work because the browser evaluates draggability at mousedown time, before the handler runs. So the first gesture saw `draggable = false` and never initiated a drag.

4. **Click/dblclick bubbling triggered edit mode** — click events on the handle bubbled to the `li` (triggering slide-level onclick handlers) and to the table's `firstTd` (triggering `contentEditable = true` on double-click). No guard existed on either.

**Files changed:**
- `builder/features/slides/components/list.js`
- `builder/features/slides/components/table.js`

**Fixes applied:**

- `draggable = false` on both handle elements to prevent them being picked up as drag sources
- Removed `ev.preventDefault()` from mousedown; replaced with `user-select: none` in CSS (list) — already present in table CSS
- Switched from toggling `draggable` on mousedown/mouseup to a `_handlePressed` flag pattern: row/item is permanently `draggable = true`; `dragstart` checks the flag and sets `effectAllowed = 'none'` if the drag didn't originate from the handle
- Added `click` and `dblclick` `stopPropagation()` on both handle elements
- Added guard in table's `firstTd` dblclick handler: `if (ev.target.closest('.ls-row-drag, .ls-row-hide-btn')) return`
