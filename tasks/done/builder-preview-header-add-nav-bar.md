---
title: Builder — Preview — Add Header Nav Bar
priority: medium
status: done
area: builder-ui
---

The builder preview (`/builder/preview.html`) had a minimal floating "← Dashboard" link instead of a proper header bar.

## What was done

- Replaced the floating back link and `#previewBadge` badge with a `#header` bar matching the presentation viewer style (`/features/presentation-view/index.html`)
- Header contains: **← Back** button (left), **"Builder Preview"** title (center), orange **"Preview"** badge, and **slide counter** (right, e.g. `1 / 14`)
- Back button uses `history.back()` so it returns to whatever page opened the builder (dashboard or slides section)
- Slide counter is wired to the existing `updateNav()` function
- Added `body { padding-top: 48px }` to prevent slides from being hidden under the fixed header

## Files changed

- `builder/features/builder-ui/preview.html`
