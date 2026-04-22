---
title: Dashboard — Finished Presentations — Add filters by name and date
priority: normal
status: done
area: dashboard-ui
---

Add filter controls to the finished presentations section of the dashboard. Users should be able to filter by: company name, contact name, presentation name (all as text search), and date (e.g. newest/oldest sort or date range). Filters should update the visible list in real time without a page reload.

## Implementation Summary

**Files changed:** `builder/features/dashboard/index.html`

### What was built

Added a modern pill-style filter bar above the finished presentations list with three controls:

1. **Search pill** — real-time text search across company name and contact name, with a search icon.

2. **Date range pill** — powered by Flatpickr (loaded via CDN). Opens a dark-themed calendar popup anchored below the pill. Supports single-date or range selection. The pill label updates to show the selected range (e.g. `Apr 22, 2026` or `Apr 1 → Apr 22, 2026`). An `×` clears the filter. Calendar uses explicit solid dark colors (`#111` background) because the app's `--surface` CSS variable is `rgba(255,255,255,0.05)` (nearly transparent), which made the calendar invisible.

3. **Sort dropdown (custom)** — replaced the native `<select>` (which uses OS/system colors and couldn't be styled) with a fully custom div-based dropdown. Dark `#111` popup, white text, orange accent for selected option. Closes on outside click.

### Root causes fixed during iteration

- **Transparent calendar**: `--surface` = `rgba(255,255,255,0.05)` is near-invisible. Fixed by using explicit hex colors in all Flatpickr CSS overrides.
- **Calendar rendered inline (too big)**: The hidden `<input>` was inside the button element and `appendTo` pointed to the parent, causing Flatpickr to render inline. Fixed by moving the input outside the button into a relative wrapper (1×1px invisible anchor) and removing `appendTo`.
- **Date range not matching today's presentations**: `toISOString()` converts to UTC before formatting. For timezones ahead of UTC, today's local date became yesterday's UTC date, so no matches. Fixed by using `getFullYear()` / `getMonth()` / `getDate()` (local time) to build the `YYYY-MM-DD` string.
- **Oldest/Newest sort unreliable**: Lacked a stable tiebreaker for same-day items. Fixed by using `id` as a secondary sort key.

### Architecture

All items are stored in an `allItems` array after the initial API fetch. Every mutation (edit, duplicate, delete) updates `allItems` and calls `applyFilters()`, which re-renders the list from scratch through `buildItem()`. This keeps the filter/sort state consistent across all interactions without a page reload.
