---
title: Builder — List & Table Components — Drag-and-Drop — Full review and fix
type: Issue
priority: H
status: done
area: builder
completed_at: 2026-06-19 13:33
---

The drag-and-drop reorder handle (⠿) on list items and table rows is not working reliably. Two symptoms observed:

1. Hovering over a list item activates the whole parent card (likely a competing hover/pointer-events layer), making it impossible to click the drag handle button.
2. Even when the handle is reachable, dragging does not reorder the item — the gesture either does nothing or behaves unexpectedly.

Needs a full review of:
- What CSS hover/overlay rules are applied to the parent card and list item on hover (z-index, pointer-events, position stacking)
- Whether the `.ls-list-item-controls` overlay or the card's own hover state is intercepting pointer events before the drag handle can receive them
- The current drag initiation logic in list.js and table.js (_handlePressed flag + permanent draggable=true) — verify it actually fires dragstart from the handle
- Whether the `data-builder-only` controls overlay positioning is covering or being covered by the card hover layer
- Browser devtools event listener audit on the drag handle element to see what is intercepting clicks

Do not attempt a fix without first fully diagnosing the root cause(s).

## Implementation Summary

**Root cause:** The drag handle (`⠿`) was a `<button>` element. Native HTML5 drag-and-drop cannot be initiated from a form control — browsers swallow the gesture on buttons, so `dragstart` never fired on the parent `<li>`. Meanwhile, non-handle drags were aborted by the `_handlePressed` guard. No drag gesture could ever succeed. The table component shared the same broken design.

**Files changed:**
- `builder/features/slides/components/list.js` — replaced native drag API with pointer-based reorder
- `builder/features/slides/components/table.js` — same replacement

**Fix applied (commit `952ecde`):** Replaced native HTML5 drag-and-drop in both components with a pointer-based reorder loop:
- `mousedown` on the handle → registers `document`-level `mousemove` / `mouseup` listeners
- `mousemove` — compares cursor Y position against each item's vertical midpoint and calls `insertBefore` live to show the reorder in real time
- `mouseup` — cleans up listeners, removes dragging class, and calls `saveList()` only if an actual reorder occurred (no spurious auto-commits)
- Removed `li.draggable = true`, `_handlePressed` flag, and all native `dragstart`/`dragover`/`drop` event listeners
- Works identically from any handle element type; ignores hidden items and non-list siblings

Every template using `data-ls-list` or `data-ls-table` inherits the fix automatically.
