---
title: Analytics — Persistent visitor id to enable New vs Returning
type: Feature
priority: M
status: pending
area: other
---

Make the dashboard able to tell New vs Returning visitors, then restore the tile.

**Problem**
Umami stores no stable per-person id in this setup:
- `distinct_id` is NULL on all events (never set by the tracker),
- `session_id` rotates each visit (Umami is cookie-less by default), so one person
  shows up as several single-day "visitors".
Result: returning visitors are indistinguishable from new ones. The New/Returning KPI
tile was therefore **hidden** (kept in code, not rendered). Verified 2026-07-02: on the
TEST site, 167 `/public/` pageviews → 8 distinct `session_id`, 0 distinct `distinct_id`.

**Fix**
1. Add a persistent visitor id to the published-presentation tracking: generate a random
   uuid, store it in `localStorage`, and call `umami.identify(id)` on load. This lives in
   the `server.js` published-output injection (around the deck-nav script, ~line 2825).
   Privacy: random id only, no PII.
2. Note this only affects data collected **after** the change — no backfill.
3. Once identity is flowing, un-hide the New/Returning tile in the dashboard KPI strip
   (`kpiSplitTile` + the `repeatVisitors` field are already built), and consider keying
   Unique Visitors / Returning off `distinct_id` instead of `session_id`.

See project memory `project_analytics_event_taxonomy`.
