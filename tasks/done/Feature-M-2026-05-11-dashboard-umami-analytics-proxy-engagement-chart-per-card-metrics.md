---
title: Dashboard — Umami analytics proxy + engagement chart + per-card metrics
type: Feature
priority: M
status: done
area: dashboard-ui
---

Wire the dashboard to real Umami analytics. Server proxies credentials-based auth to umami.wbtm.io. Dashboard shows per-presentation visitor/view/bounce/duration metrics and an engagement line chart inside Publication Activity.

## Implementation Summary

**server.js additions:**
- `const https = require('https')` added to top-level requires
- Umami config vars: `UMAMI_BASE_URL`, `UMAMI_USER`, `UMAMI_PASS` (from `.env`)
- `getUmamiToken(cb)` — logs in via `POST /api/auth/login`, caches JWT for 23h (self-hosted Umami v1 has no API key UI)
- `umamiGet(apiPath, cb)` — cached GET with 15-min TTL, auto-uses cached token
- `GET /api/analytics/batch?startAt=&endAt=` — fetches stats for all presentations in parallel (one Umami call per presentation by URL)
- `GET /api/analytics/presentation/:id?startAt=&endAt=` — single-presentation stats
- `GET /api/analytics/pageviews?startAt=&endAt=&presId=` — time-series pageviews + sessions for the engagement chart

**dashboard/index.html additions:**
- Each FP card gets `.fp-metrics[data-pres-id]` div showing "loading metrics…" initially
- `scheduleBatchFetch()` fires after render (debounced 200ms), calls `/api/analytics/batch`, then `injectMetrics()` populates visitors / views / bounce rate / avg duration per card
- `fmtDuration()` helper converts ms → "Xm Ys" display
- Engagement section added inside `#pubActBody`: two-dataset Chart.js line chart (`#engagementChart`) — Pageviews (amber fill) + Visitors (blue line). Loads lazily when Publication Activity panel is opened; also loads on page load if panel was already open.
- Credentials in `.env`: `UMAMI_USERNAME`, `UMAMI_PASSWORD`, `UMAMI_BASE_URL`
