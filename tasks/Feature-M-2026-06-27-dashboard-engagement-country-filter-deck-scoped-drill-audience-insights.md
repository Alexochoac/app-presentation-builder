---
title: Dashboard — Engagement — Country filter, deck-scoped drill, audience insights
type: Feature
priority: M
status: in-progress
area: dashboard-ui
---

Improve the Engagement Activity chart: add a dashboard-wide **country filter** (is / is not,
searchable, checkboxes) to exclude our own visits; fix the slide-popularity drill so it shows
**one deck at a time** (decks are no longer merged) and **clicking a slide reveals its in-slide
events**; and surface four insights we already track but never show (CTA conversions, traffic
source, geo breakdown, device).

## Context — what exists today

The engagement drill (`builder/features/dashboard/index.html:1564–1751`) is:
Pageviews-by-day → click → **slide popularity (all decks MERGED)** → click slide → per-presentation
breakdown.

Two facts shape the whole task:
1. **Country/device/referrer require a `session` JOIN.** The proxy queries only `website_event`
   (`server.js` db* functions `:1053–1209`, `:3038`). Country/city/device/browser live on Umami's
   `session` table; referrer lives on `website_event.referrer_domain`. None are surfaced today.
2. **We collect rich labels and discard them.** Every interaction sends
   `{ label: 'button-whatsapp-click' | 'tab-X-click' | 'carousel-Y-next' | 'image-Z-open' }` into
   Umami's `event_data` table, but the proxy only reads `event_name` (the slide). The "click slide →
   events" view finally surfaces `event_data`.

Tracking shapes (`builder/features/slides/components/tracker.js`): event name = `slide-<id>`,
property `{ label: '<component>-<label>-<action>' }`.

## Decisions (2026-06-27)
- Country filter applies to the **whole dashboard** (cards + all charts), not just engagement.
- Build **all four** extra insights: CTA conversions, traffic source (referrer), geo breakdown, device.
- Sequence: Phase 0 → 1 → 2 → 3. Start with **Phase 0 + 1**.
- "is not" keeps NULL/unknown-country visitors (so excluding our own country never hides real prospects).

## Phase 0 — Shared session-JOIN plumbing (`server.js`)
Invisible alone; unblocks everything. Add a helper that appends an optional
`JOIN session s ON s.session_id = we.session_id` + country clause, and thread a `country` /
`countryOp` param through every db* function and its endpoint:
`dbPresStats` `:1053`, `dbPresTimeSeries` `:1080`, `dbSlideEvents` `:1118`, `dbSlideEventSeries`
`:1147`, `dbSlideEventByPres` `:1186`, `dbPresTimeSeriesWithBreakdown` `:3038`. Alias `website_event`
as `we` where joined.
- `is` → `AND s.country = ANY($n)`
- `is not` → `AND (s.country != ALL($n) OR s.country IS NULL)`

## Phase 1 — Country filter (dashboard-wide)
- **New endpoint** `GET /api/analytics/countries` → `[{ country, count }]` (distinct, JOIN session).
  Powers both the filter list and the Phase-3 geo breakdown.
- **UI** filter row (`index.html:601–622`): searchable multi-select with **is / is not** toggle, a
  search box, and checkboxes per country (with counts). Model on `buildEngDeckMenu` (`:1993`).
- Country state at dashboard level; appended to engagement charts AND per-card metrics
  (`/api/analytics/batch`, `server.js:2954`) so the whole dashboard respects it.

## Phase 2 — Deck-scoped drill
- **Popularity = one deck only.** Entering the popularity view without exactly one deck selected
  shows a "Pick a deck" prompt instead of merged bars. Order bars by the deck's slide order
  (from `/api/decks`).
- **Click slide → in-slide events.** New endpoint `GET /api/analytics/slide-interactions?eventName=`
  joins `event_data` (`data_key='label'`), returns a bar per interaction label for that one slide.

## Phase 3 — Audience insights (all already tracked)
- **CTA conversions** — count `button-whatsapp-click` / `button-email-click` from `event_data`;
  headline metric per presentation/deck.
- **Traffic source** — `GET /api/analytics/referrers`, grouped by `referrer_domain`.
- **Geo breakdown** — top countries/cities (reuses Phase-1 JOIN).
- **Device** — mobile vs desktop from `session.device`.

## Files to change
- `builder/server.js` — session-JOIN helper, country threading, new endpoints (`/countries`,
  `/slide-interactions`, `/referrers`, devices/geo), `event_data` join.
- `builder/features/dashboard/index.html` — country filter UI + state, deck-scoped popularity,
  slide-interactions drill, insight panels.

## Out of scope (for now)
- Filtering by city/region (country only for v1 of the filter).
- Per-user / multi-tenant analytics (Phase 2 of the product).

## Decision log
- 2026-06-27 — Plan agreed with user. Country filter = whole dashboard; all four insights in scope;
  start Phase 0 + 1. Branch `feature-dashboard-engagement-chart`.
