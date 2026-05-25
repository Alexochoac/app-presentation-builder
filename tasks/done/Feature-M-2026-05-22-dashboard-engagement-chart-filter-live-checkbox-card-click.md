---
title: Dashboard — Engagement Chart — Live-only filter, checkbox dropdown, card image shortcut
type: Feature
priority: M
status: pending
area: dashboard-ui
---

Refine the Engagement Activity chart so it only shows data for Live presentations, adds a multi-select checkbox dropdown to filter by presentation name, and lets the user click a presentation card image to jump straight to that filter.

## Context

The current engagement chart has a single "All / By presentation" toggle. It does not distinguish between Draft/Archived/Live, and does not support multi-selection. The analytics proxy fix (https → http) is already in place — this task builds the UX layer on top of that.

**"Live"** is defined as: `publishedAt` is set AND `archivedAt` is NOT set (matches the green "Live" badge in the dashboard).

## Behaviour spec

### Checkbox dropdown
- Sits where the current presentation-selector control is inside the Publication Activity panel
- Label: `Presentations ▾`
- Opens a dropdown with one row per Live presentation (name + id)
- First row: `☑ All` — when checked, all others are deselected and the chart shows aggregate data across all Live presentations
- Clicking any individual presentation unchecks "All" automatically
- Multiple can be checked simultaneously → chart aggregates (sums) them
- When the dropdown closes the chart reloads automatically

### Card image shortcut
- Clicking the thumbnail/image area of a Finished Presentation card opens the Publication Activity panel (if closed) and sets the filter to that single presentation (deselects All, checks only that card's presentation)
- Should feel instant — no full page reload

### Chart data behaviour
- **All selected (or no filter)**: aggregate all Live presentations
- **One or more selected**: aggregate only those
- Date range dropdown (existing) continues to work with the new filter
- Chart title / subtitle should show which presentations are active, e.g. "All Live (4)" or "Customer A, Customer B"

## Server changes

### New endpoint: `GET /api/analytics/pageviews-multi`

Replaces direct use of `/api/analytics/pageviews` for the chart.

Query params:
- `startAt` (ms)
- `endAt` (ms)
- `presIds` (comma-separated IDs, e.g. `00000001,00000003`) — optional; if omitted → use all Live presentations

Logic:
1. Read `presentations.json`, filter to Live presentations (`publishedAt` set, `archivedAt` not set)
2. If `presIds` param is present, intersect with the Live set (never return data for non-Live)
3. For each qualifying presId, run the same day-by-day stats loop as `pageviews-by-pres` (one `/api/websites/:id/stats` call per day per presentation)
4. Sum the `pageviews` and `sessions` values across all presentations for each day
5. Return `{ success: true, data: { pageviews: [{x, y}], sessions: [{x, y}] } }`

Note: calls are made in parallel per presentation per day — use a pending-counter pattern (no external async library).

## Dashboard changes (`builder/features/dashboard/index.html`)

### State
```js
var engPresIds = [];   // [] = All; ['00000001', '00000003'] = specific ones
```

### Dropdown HTML (inside Publication Activity panel header)
```html
<div id="engFilterWrap">
  <button id="engFilterBtn">Presentations <span class="chevron">▾</span></button>
  <div id="engFilterMenu">
    <label><input type="checkbox" id="engAllCheck" checked> All</label>
    <!-- one <label> per Live presentation, populated by JS -->
  </div>
</div>
```

### Dropdown JS behaviour
- Populate on panel open (or page load) from `/api/presentations` (already available)
- Filter to `p.publishedAt && !p.archivedAt`
- Checkbox change → update `engPresIds` → call `loadEngagement()`
- "All" checkbox → clears `engPresIds`, rechecks "All", unchecks others

### `loadEngagement()` change
```js
function loadEngagement() {
  var dates = getEngDates();
  var url = '/api/analytics/pageviews-multi?startAt=' + dates.startAt + '&endAt=' + dates.endAt;
  if (engPresIds.length) url += '&presIds=' + engPresIds.join(',');
  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (r) {
      if (!r.success || !r.data) return;
      buildEngBarChart(r.data.pageviews || [], r.data.sessions || []);
    })
    .catch(function () {});
}
```

### Card image click
- Find the card image element in `renderCard()` and add a click listener
- On click: set `engPresIds = [p.id]`, uncheck All, check that presentation in dropdown, open Publication Activity panel, call `loadEngagement()`

### Chart subtitle
Below the chart title, show a small muted line: `"All Live (N)"` or `"Customer A · Customer B"`.

## Files to change
- `builder/server.js` — add `/api/analytics/pageviews-multi` endpoint
- `builder/features/dashboard/index.html` — dropdown UI, state, loadEngagement, card click

## Out of scope
- Archived or Draft presentations are never shown in the dropdown or included in aggregates
- No backend pagination — if there are 50+ presentations this will make many Umami calls; acceptable for Phase 1
