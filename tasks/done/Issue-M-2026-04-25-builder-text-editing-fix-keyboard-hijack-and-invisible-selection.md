---
title: Builder — Text Editing — Fix keyboard keys hijacked and selected text invisible
type: Issue
priority: M
status: pending
area: builder
---

Two bugs in `builder/features/builder-ui/preview.html` that break inline text editing:

**Bug 1 — Keyboard keys hijacked while editing (line 326)**
`e.target.getAttribute('contenteditable')` returns `""` (empty string) which is falsy in JS, so the guard never fires. Arrow keys, Backspace, Delete, and Space always trigger slide navigation even when the cursor is inside a contenteditable field.
Fix: replace with `e.target.isContentEditable`.

**Bug 2 — Selected text turns invisible**
No `::selection` CSS rule exists anywhere in the project. White slide text + browser default blue selection highlight = selected text becomes invisible when highlighted.
Fix: add a `::selection` rule (dark text + visible background color) to the builder CSS (`builder/shared/app-style.css` or equivalent).
