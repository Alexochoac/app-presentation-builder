---
title: App — Navigation — Merge Builder + Decks into one section, restructure all nav sections
type: Feature
priority: H
status: done
area: app-nav
order: 1
---

## Goal

Collapse the current Builder and Decks sections into a single unified section. Restructure the top-level navigation so every section has a clear, non-overlapping purpose.

## New Navigation Structure

| Route | Section | Purpose |
|---|---|---|
| `/builder` | Builder | Build presentations — deck list sidebar, full-screen preview, slide panel |
| `/slides` | Slides | Slide workshop — My Library, Templates, Slide Builder |
| `/settings` | Settings | Global app settings only |
| `/dashboard` | Dashboard | Analytics / views (existing, repurposed) |

Sections removed or absorbed:
- Separate "Decks" page — merged into Builder
- "Your Presentations" active-deck preview panel (builder-ui) — stays in Builder but redesigned (see Task 2)
- "Finished Presentations" list — moves from Dashboard into Builder (per-deck, see Task 2)
- Layouts/Templates page (`/layouts`) — absorbed into Slides section (see Task 3)

## Changes Required

### Nav bar / shell
- Update nav links: Builder, Slides, Settings, Dashboard
- Remove any standalone Decks or Layouts nav entries
- Active state highlights correctly per route

### `builder-ui/index.html` — new layout
Replace the current two-card layout (My Decks card + Your Presentations card) with:
- **Left sidebar** — deck list (search, create, set active, rename, delete, duplicate)
- **Main area** — full-screen deck builder canvas (see Task 2)

The deck list sidebar IS the old "My Decks" card — same data, new layout.

### `dashboard/index.html`
- Remove the "Finished Presentations" panel from dashboard
- Move finished presentations list into Builder section (per-deck context, see Task 2)
- Dashboard becomes analytics-only (Views Overview — currently placeholder with mock data)

### `layouts/index.html`
- This page is absorbed into the Slides section as the Slide Builder tab (see Task 3)
- The `/layouts` route can redirect to `/slides` with the Slide Builder tab pre-selected
- Or: keep the page but remove from nav, only accessible from Slides section

## What NOT to change in this task
- No new UI built here — this task is routing, nav, and page shells only
- The Builder canvas is Task 2
- The Slides tabs are Task 3
- Settings split is Task 4

## Acceptance Criteria
- [x] Nav has 4 links: Builder, Slides, Settings, Dashboard
- [x] `/builder` loads the merged Builder+Decks page with sidebar + main area placeholders
- [x] `/layouts` no longer appears in nav (redirect to `/slides`)
- [x] "Finished Presentations" list is removed from Dashboard
- [x] Dashboard shows analytics panel only (even if still placeholder)
