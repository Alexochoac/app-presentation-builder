---
title: Dashboard — Edit Presentation — Modal — Fix transparent background
priority: normal
status: done
area: dashboard-ui
---

The "Edit Presentation" popup modal has a transparent background, making it hard to read and use. Add a solid or appropriately styled background so the modal is visually distinct from the content behind it.

## Implementation Summary

**Problem:** The Edit Presentation modal appeared transparent, making form fields hard to read against the page content behind it.

**Root cause:** The inner modal `<div>` had an inline style `background:var(--surface)`. The `--surface` CSS variable was either undefined or transparent in this context. A CSS rule already existed at line 139 of `builder/features/dashboard/index.html` that correctly set `#editModal > div` to `background: #1c1c1e` (dark) / `background: #ffffff` (light), but the inline style took precedence over it.

**Fix:** Removed `background:var(--surface)` from the inline style on the inner modal div in [builder/features/dashboard/index.html](builder/features/dashboard/index.html) (line 268), allowing the existing CSS rule to apply its solid background correctly in both dark and light themes.
