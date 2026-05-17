---
title: Dashboard — Engagement Activity — Split from Publication Activity and add independent card with filters and per-presentation chart
type: Feature
priority: M
status: done
area: dashboard-ui
---

Removed the inline Engagement (Umami) chart from inside the Publication Activity card and created a new standalone "Engagement Activity" card at the top of the dashboard (above Finished Presentations).

The new card includes:
- Collapsible panel with localStorage persistence (starts collapsed)
- Date filter in the header: 24h / 7d / 30d / Custom (flatpickr range picker)
- Bar chart showing Pageviews (orange) and Visitors (blue) as grouped bars per day
- Presentation filter (single-select dropdown) below the chart — filters the chart to one specific presentation
- "All presentations" button to reset the filter

To make the presentation filter actually work, a new server endpoint `/api/analytics/pageviews-by-pres` was added. Umami's `/pageviews` endpoint ignores URL filtering on this version, so the new endpoint reconstructs a day-by-day time series by making one parallel `/stats` call per day (which does support URL filtering via `&url=/finished/{presId}/`). Results are returned in the same shape as `/pageviews` so the chart requires no changes.

`loadEngagement()` in the dashboard now routes to the new endpoint when a presentation is selected, and falls back to the standard `/api/analytics/pageviews` for the aggregate view.
