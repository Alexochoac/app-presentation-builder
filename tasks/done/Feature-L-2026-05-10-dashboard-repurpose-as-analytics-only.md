---
title: Dashboard — Repurpose as analytics-only, remove finished presentations list
type: Feature
priority: L
status: pending
area: dashboard
order: 7
depends-on: Feature-H-2026-05-10-builder-full-screen-deck-preview-slide-panel-reorder.md
---

## Goal

Once the "Finished Presentations" list moves to the Builder section (Task 2), the Dashboard becomes a pure analytics view. This task cleans up the dashboard and makes the analytics panel real (currently mock data).

## Current State

Dashboard has two panels:
1. **Views Overview** — Chart.js bar chart with hardcoded mock data, date range dropdown, presentation selector
2. **Finished Presentations** — Full CRUD list of published presentations (search, filter, sort, archive, delete, publish)

## After Task 2 Is Done

Panel 2 (Finished Presentations) will have moved to the Builder section. This task:
- Removes the Finished Presentations panel from `dashboard/index.html`
- Expands the Views Overview panel to fill the page
- Connects the chart to real data from the presentations API

## Analytics Panel — Real Data

Replace mock data with real data from `GET /api/presentations`:

- **Total views** — placeholder (no view tracking yet — show "Coming Soon" or use presentation count as proxy)
- **Presentations published** — count from API, by date range
- **By deck** — bar chart grouped by deck name
- **Recent activity** — list: "Published X for Company Y — 3 days ago"

If view tracking (Umami or similar) is not yet wired, the chart shows publication activity instead of view counts. The chart is still useful and real.

## New Dashboard Layout

```
┌─────────────────────────────────────────────────────────┐
│  Views Overview                    [7d] [30d] [Custom]  │
│  ─────────────────────────────────────────────────────  │
│  [Bar chart — publications per day / deck]              │
│                                                         │
│  Summary cards:                                         │
│  [12 Presentations] [3 Decks] [Last: Company X, 2d ago] │
│                                                         │
│  Recent Activity                                        │
│  · Published "Q2 Demo" for LiteSentry — 2 days ago     │
│  · Published "Proposal" for Benteler — 5 days ago      │
└─────────────────────────────────────────────────────────┘
```

## Acceptance Criteria
- [ ] Finished Presentations panel removed from Dashboard (only after Task 2 is complete)
- [ ] Analytics panel expands to full page width
- [ ] Chart data comes from `GET /api/presentations` (real, not mock)
- [ ] Summary cards show real counts
- [ ] Recent activity list shows last 10 published presentations
- [ ] Date range filter works against real data
