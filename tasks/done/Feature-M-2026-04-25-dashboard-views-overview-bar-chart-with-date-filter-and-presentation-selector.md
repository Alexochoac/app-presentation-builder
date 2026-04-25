---
title: Dashboard — Views Overview — Bar Chart — Add views chart with date filter and presentation selector
type: Feature
priority: M
status: done
area: dashboard-ui
---

Add a Views Overview section to the dashboard with a bar chart showing views (y-axis) by date (x-axis). Upper-right corner has a dropdown defaulting to "Last 7 days" with options: Last 24 hours, Last 30 days, Custom (opens a date range calendar picker matching the finished presentations UI). Below the chart is a tab row for selecting presentations: "Overview" tab (default, shows all) and individual presentation links that can be selected one or many at a time to filter the chart. Build the UI/screen first — no live data wiring yet.

## Implementation Summary

### What was built
A full Views Overview section added to `builder/features/dashboard/index.html`, inserted above the Finished Presentations panel.

### Files changed
- `builder/features/dashboard/index.html` — all changes

### Components added

**"Coming Soon" badge** — amber pill inline next to the section title, clearly signals the feature is not yet live.

**Bar chart** — Chart.js 4 (CDN) renders a bar chart with views on Y-axis and dates on X-axis. Uses accent orange bars, respects dark/light theme for grid lines and tick colors, responsive and destroys/rebuilds on filter changes. Data is mock/generated deterministically from presentation IDs.

**Date range dropdown** (upper right of panel header) — "Last 7 days" default, with "Last 24 hours", "Last 30 days", "Custom…". Custom opens Flatpickr (already loaded on the page) in range mode; a pill showing the selected range appears below the chart with a clear (×) button.

**Presentations dropdown** (below the chart, next to Overview tab) — populated from the real `/api/presentations` API response via a `viewsPresentationsLoaded` CustomEvent dispatched by the existing presentations loading IIFE. Shows all presentations checked by default, with a search input that filters the list. Label updates dynamically ("All presentations", "2 presentations", single name). Checkboxes update the chart filter on change.

**Overview tab** — resets all checkboxes to checked and shows aggregated data.

**Logo click to filter** — `.pres-thumb` in the finished presentations list gets a `viewsFilterByPres` event dispatch on click. The chart script listens for this, sets `checkedIds` to that single presentation, re-renders the dropdown rows, updates the label, and smoothly scrolls to the chart.

### Bugs fixed during build
- **Dropdown not showing**: `.panel` in `app-style.css` has `overflow: hidden` which clipped all absolutely-positioned children. Fixed with `style="overflow:visible;"` on the Views Overview section.
- **Dropdown behind next card**: Added `position:relative; z-index:10;` to the Views Overview section so it stacks above the Finished Presentations panel.
- **Checkbox state stale after external filter**: `renderRows` is exposed as `window._viewsRenderRows` so the Overview tab reset and logo-click handler can re-render rows with current `checkedIds`.
