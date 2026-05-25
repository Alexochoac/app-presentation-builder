---
title: "Fix: Timezone date offset — presentations and analytics show one day early"
status: done
priority: H
created_at: 2026-05-24
completed_at: 2026-05-24 18:00
tags: [bug, timezone, analytics, dashboard]
---

## Problem

All presentation dates and Engagement Activity chart data appeared one day behind
the user's local date (e.g., May 24 showing as May 23). This affected:

- `createdAt` stored on new presentations
- The Publications Activity bar chart grouping
- The Engagement Activity pageviews and events charts (Umami DB data)

## Root Causes Found

### 1. `createdAt` stored in UTC (`server.js`)
`new Date().toISOString().slice(0, 10)` always returns the UTC date.
For UTC+ users, local midnight of May 24 is still UTC May 23 → stored as `"2026-05-23"`.

### 2. Publications Activity chart buckets in UTC (`dashboard/index.html`)
`cursor.toISOString().slice(0, 10)` generated UTC day bucket keys.
The presentations' `publishedAt` was also sliced as UTC, creating an off-by-one mismatch.

### 3. Umami SQL grouped by UTC day (`server.js`)
All three analytics functions used `date_trunc('day', created_at AT TIME ZONE 'UTC')`,
returning UTC midnight timestamps. Frontend rendered them with local `toLocaleDateString()`
→ UTC midnight of May 24 displayed as May 23 for UTC+ users.

Additionally, the day-bucket generation used `setUTCHours(0,0,0,0)` and pg's
`TIMESTAMP WITHOUT TIME ZONE` parsing introduced further ambiguity when converting
back to JS Date strings via `.toISOString()`.

## Files Changed

| File | Change |
|------|--------|
| `builder/server.js` | Added `localDate(d)`, `localTzString()` helpers; fixed `localDateString()` to delegate; changed 3 analytics SQL queries from UTC to local TZ; switched bucket generation to `setHours` + `localDate()`; used `TO_CHAR(..., 'YYYY-MM-DD')` to return plain strings from Postgres |
| `builder/features/dashboard/index.html` | Added `localDate()` / `isoToLocalDate()` helpers; fixed Publications Activity bucket keys and presentation date extraction; fixed Engagement chart label rendering to use `T00:00:00` (local) instead of `T00:00:00Z` (UTC) |
| `builder/features/builder-ui/index.html` | Fixed `new Date(p.createdAt)` → `new Date(p.createdAt + 'T00:00:00')` to prevent date-only strings from being parsed as UTC midnight |

## Specific Fixes

- **`createdAt` on publish/duplicate** — replaced `new Date().toISOString().slice(0,10)` with `localDateString()` (uses `getFullYear/Month/Date` local getters).
- **Publications chart buckets** — `cursor.toISOString().slice(0,10)` → `localDate(cursor)`; presentation lookup uses `isoToLocalDate()` which handles date-only vs full ISO strings.
- **Engagement SQL** — `date_trunc('day', created_at AT TIME ZONE 'UTC')` → `TO_CHAR(created_at AT TIME ZONE localTzString(), 'YYYY-MM-DD')` in all 3 functions (`dbPresTimeSeries`, `dbSlideEventTimeSeries`, `dbPresTimeSeriesWithBreakdown`). Returns a plain string — no JS Date parsing ambiguity.
- **Day bucket generation in analytics** — `setUTCHours(0,0,0,0)` → `setHours(0,0,0,0)`; `days.push(utcTimestamp)` → `days.push(localDate(cur))`.
- **`byDay`/`byEvent` lookup keys** — changed from UTC midnight timestamps to plain date strings matching the `TO_CHAR` output (`r.day` used directly).

## Implementation Summary

The core insight was that this app is single-user and local, so **all date boundaries should use the server's local timezone**, not UTC. Umami stores events in UTC, which is correct, but grouping and display must be done in local time. Using `TO_CHAR` with the server's POSIX offset string (built by `localTzString()`) is the cleanest solution: Postgres converts to local time and returns a plain `YYYY-MM-DD` string, eliminating all JS timezone conversion on the way back.
