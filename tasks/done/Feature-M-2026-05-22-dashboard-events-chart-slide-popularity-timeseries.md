---
title: Dashboard — Events Chart — Slide popularity + time-series, drill-down, per-slide colors
type: Feature
priority: M
status: pending
area: dashboard-ui
---

Add a second chart mode to the Engagement Activity panel: a Slide Events chart that shows how many times each slide was visited (popularity) or how engagement evolved over time (time-series). Uses Umami's custom event data. Respects the same presentation filter as the pageviews chart (see task Feature-M-2026-05-22-dashboard-engagement-chart-filter-live-checkbox-card-click.md — complete that first).

## Context

When a viewer navigates between slides in a published presentation, `Track.event()` fires a custom Umami event:
- **Event name**: `slide-ls1`, `slide-ls2`, … (the `data-slide` attribute of that slide)
- **Property `label`**: `"Cover SoftSolution Logo-view"` (human slide name + "-view")

This task surfaces those events in the dashboard chart.

## Behaviour spec

### Chart mode toggle
Inside the Publication Activity panel, above the existing chart, add a pill toggle:

```
[ Pageviews ]  [ Events ]
```

Switching to **Events** replaces the bar/line chart with the events chart. Switching back to Pageviews restores the original chart.

### Events chart — Popularity view (default)

- Horizontal or vertical bar chart (vertical preferred for consistency)
- One bar per slide type encountered in the selected presentations + date range
- X-axis: slide IDs (e.g. `ls1`, `ls2`, `ls5`...) — labelled with human name when available
- Y-axis: total event count
- Each slide gets a distinct color from a fixed palette (cycle through 12 colors)
- Bars sorted by count descending (most-viewed slide first)
- **Click a bar** → drill-down: replaces chart with a sub-events breakdown for that slide (see Drill-down section below)

### Events chart — Time-series view

Secondary toggle within Events mode:

```
[ Popularity ]  [ Over time ]
```

- Line chart (one line per slide type) showing events per day over the date range
- Same color palette as Popularity (ls1 always gets the same color within a session)
- Legend below the chart (slide ID + name)
- This will make N×D Umami API calls (N slides × D days) — acceptable but should show a loading spinner

### Drill-down (click on a slide bar)

When the user clicks a bar in Popularity view:
- Shows a second bar chart: sub-events for that slide (e.g. `carousel-Belt Detail-next`, `tab-Archive-click`, `image-Camera Detail-open`)
- Sub-event labels come from the Umami event property `label`
- A "← Back" button returns to the full popularity chart
- Drill-down respects the active presentation filter and date range

### Human slide name resolution

The event name is `slide-ls1`. The human name comes from the event property `label` (stripped of the `-view` suffix). When multiple presentations are selected, the same slide ID (e.g. `ls1`) may have different names — in that case use the most frequent label or just the slide ID.

## Server changes

### New endpoint: `GET /api/analytics/events`

Returns event counts per slide for the selected presentations and date range.

Query params:
- `startAt`, `endAt` (ms)
- `presIds` (comma-separated, optional — omit = all Live)

Logic:
1. Resolve presIds to Live presentation IDs (same as `pageviews-multi`)
2. For each presId, call Umami:
   `GET /api/websites/:id/metrics?startAt=&endAt=&type=event&url=/finished/:presId/`
   This returns `[{ x: "slide-ls1", y: 5 }, { x: "slide-ls2", y: 3 }, ...]`
3. Merge results across presentations: group by event name, sum `y` values
4. Return `{ success: true, data: [{ event: "slide-ls1", label: "Cover Logo", count: 5 }, ...] }`

Note: Umami may not return the `label` property from the metrics endpoint — in that case return `label: null` and the dashboard will fall back to the event name stripped of `slide-` prefix.

### New endpoint: `GET /api/analytics/event-series`

Returns day-by-day event counts for time-series view.

Query params:
- `startAt`, `endAt` (ms)
- `presIds` (comma-separated, optional)
- `eventNames` (comma-separated slide event names to include, e.g. `slide-ls1,slide-ls2`)

Logic:
1. For each day in the range, for each presId, for each eventName:
   Call `/api/websites/:id/stats?startAt=&endAt=&url=&event=:eventName`
   (if Umami supports `event` filter on `/stats` — if not, fall back to `/metrics` per day)
2. Sum across presentations per day per event
3. Return:
   ```json
   {
     "success": true,
     "data": {
       "days": ["2026-05-01", ...],
       "series": [
         { "event": "slide-ls1", "label": "Cover Logo", "values": [2, 0, 1, ...] },
         { "event": "slide-ls2", "label": "Company Intro", "values": [1, 1, 0, ...] }
       ]
     }
   }
   ```

### New endpoint: `GET /api/analytics/slide-events` (drill-down)

Returns sub-event counts for a single slide.

Query params:
- `startAt`, `endAt` (ms)
- `presIds` (comma-separated, optional)
- `slideId` (e.g. `ls1`)

Logic:
1. For each presId, call `/api/websites/:id/metrics?type=event&url=/finished/:presId/`
2. Filter returned events to those that contain the slideId (event name starts with `slide-ls1` OR label contains the slide name)
3. For each matching event, also fetch its property breakdown (if Umami supports it)
4. Return `{ success: true, data: [{ label: "carousel-Belt Detail-next", count: 3 }, ...] }`

## Dashboard changes (`builder/features/dashboard/index.html`)

### State additions
```js
var engMode = 'pageviews'; // 'pageviews' | 'events'
var engEventsMode = 'popularity'; // 'popularity' | 'timeseries'
var engDrillSlide = null;  // null | 'ls1'
var eventsChart = null;    // Chart.js instance for events
var SLIDE_COLORS = [       // fixed 12-color palette
  '#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#a855f7',
  '#14b8a6','#f97316','#84cc16','#ec4899','#06b6d4','#8b5cf6'
];
```

### Mode toggle HTML
```html
<div id="engModeToggle">
  <button class="eng-mode-btn active" data-mode="pageviews">Pageviews</button>
  <button class="eng-mode-btn" data-mode="events">Events</button>
</div>
```

### Events sub-toggle HTML (shown only in events mode)
```html
<div id="engEventsToggle" style="display:none">
  <button class="eng-sub-btn active" data-emode="popularity">Popularity</button>
  <button class="eng-sub-btn" data-emode="timeseries">Over time</button>
</div>
```

### Chart rendering

`loadEngagement()` checks `engMode`:
- `'pageviews'` → existing chart path (unchanged)
- `'events'` → call `loadEventsChart()`

`loadEventsChart()`:
- If `engDrillSlide` is set → call `/api/analytics/slide-events` and render drill-down chart
- Else if `engEventsMode === 'popularity'` → call `/api/analytics/events` and `buildPopularityChart()`
- Else → call `/api/analytics/event-series` and `buildTimeSeriesChart()`

`buildPopularityChart(data)`:
- Sorted bar chart, one bar per slide event
- Assign color from `SLIDE_COLORS` by index (consistent within a page load)
- Click handler on bars → set `engDrillSlide = slideId`, re-render

`buildTimeSeriesChart(data)`:
- Line chart, one dataset per slide
- Same color mapping
- Show spinner while fetching (time-series is slow)

Drill-down header:
```html
<div id="engDrillHeader" style="display:none">
  <button id="engDrillBack">← Back</button>
  <span id="engDrillTitle">Slide ls1 — Cover Logo</span>
</div>
```

## Color assignment rule

Colors are assigned at chart build time by array index (sorted by count desc for popularity, alphabetical for time-series). Same slide ID keeps the same color within a session because the sort order is stable. Good enough for Phase 1 — no need for persistent color mapping.

## Files to change
- `builder/server.js` — three new endpoints: `/api/analytics/events`, `/api/analytics/event-series`, `/api/analytics/slide-events`
- `builder/features/dashboard/index.html` — mode toggle, events chart, time-series, drill-down

## Dependencies
- Complete **Feature-M-2026-05-22-dashboard-engagement-chart-filter-live-checkbox-card-click** first (shared filter state)
- Confirm Umami v2 API supports `type=event` on `/metrics` — test with a live curl before building the endpoint

## Umami API notes to verify before building

```bash
# Test metrics with event type
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3003/api/websites/<id>/metrics?type=event&startAt=<ms>&endAt=<ms>"

# Test with URL filter
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3003/api/websites/<id>/metrics?type=event&startAt=<ms>&endAt=<ms>&url=%2Ffinished%2F00000001%2F"
```

If `url` filter is not supported on `/metrics`, fall back to fetching all events and filtering client-side on the server.
