---
title: Dashboard — Publication Activity collapsible + Recent Activity as subsection
type: Feature
priority: M
status: done
area: dashboard-ui
---

Move Publication Activity panel below Finished Presentations and make it collapsible (starts collapsed by default). Move Recent Activity inside it as a collapsible subsection (starts open).

## Implementation Summary

- Publication Activity panel moved below Finished Presentations in the DOM
- Panel header (`#pubActHeader`) is now clickable; content wrapped in `#pubActBody` (hidden by default)
- Chevron rotates -90deg when collapsed, 0deg when open; state saved to `pb-pubact-collapsed` (default `'1'` = collapsed)
- Clicking the date dropdown (`#viewsDateDropdown`) inside the header does not trigger collapse (guarded with `e.target.closest`)
- Recent Activity `<ul id="recentActivity">` moved inside `#pubActBody` as a collapsible subsection (`#recentActHeader` / `#recentActBody`), defaults open, state saved to `pb-recentact-collapsed`
