---
title: Builder — List & Table Components — Drag-and-Drop — Full review and fix
type: Issue
priority: H
status: pending
area: builder
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
