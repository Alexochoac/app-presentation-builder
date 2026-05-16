---
title: Builder — Save Screen — Form Fields — Fix text visibility and establish field conventions
type: Issue
priority: H
status: done
area: builder
---

The DEFAULT LANGUAGE dropdown on the Save Presentation screen is unreadable — white text on a white background. Audit all form fields on the Save screen and establish a consistent styling convention (text color, background, border, focus state) so no field has invisible text. Apply the convention to all existing fields to prevent the same issue recurring.

## Implementation Summary

**Root cause:** The `<select>` element used `background: var(--input-bg)` (a semi-transparent rgba) and `color: var(--text)` (#fff in dark mode). When the browser renders the native `<option>` dropdown popup, it applies a white background to option elements regardless of the inherited `color`, producing white-on-white invisible text.

**Fix applied in `builder/features/builder-ui/index.html`:**

- `.modal-select` changed to use solid background `#181818` + explicit `color: #fff` + `color-scheme: dark`
- Added `.modal-select option { background: #181818; color: #fff; }` to style native option elements in Chromium/Firefox
- Added `[data-theme="light"] .modal-select` override: `background: #f5f5f7; color: #1d1d1f; color-scheme: light;`
- Added `[data-theme="light"] .modal-select option` counterpart

**Convention established:**
- Text inputs (`.modal-input`): use `background: var(--input-bg)` + `color: var(--text)` — fine because CSS controls all rendering
- Select dropdowns (`.modal-select`): must use **solid opaque background**, explicit `color`, and `color-scheme` — because native dropdown popups ignore semi-transparent backgrounds

**Files changed:**
- `builder/features/builder-ui/index.html` — `.modal-select` block updated (lines 152-164)
