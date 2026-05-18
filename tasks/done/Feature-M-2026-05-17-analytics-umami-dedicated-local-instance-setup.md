---
title: Analytics — Umami — Set up dedicated local instance
type: Feature
priority: M
status: done
area: other
---

Set up a dedicated Umami analytics instance (localhost:3003) with its own Postgres container for the App Presentation Builder, replacing reliance on a shared Umami instance.

## What was done

- Added `umami` and `umami-db` services to `docker-compose.yml` (Umami on port 3003, Postgres internal only)
- Updated `builder/.env` to point `UMAMI_BASE_URL` to `http://localhost:3003`
- Updated `builder/data/settings.json` with new `umamiWebsiteId` from the dedicated instance
- Fixed `server.js` — tracking script injected into published presentations now uses `UMAMI_BASE_URL` instead of a hardcoded URL
- Exposed `umamiBaseUrl` from `/api/settings` endpoint so the client can read it dynamically
- Added dynamic Umami script loader to `preview.html` — fetches settings on load and inserts the script tag so the builder UI itself is tracked
- Prod (`.env.prod`) still points to the live shared Umami — no prod impact

## Future

When sharing presentations externally, Umami will need to be deployed to a VPS and `UMAMI_BASE_URL` updated in `.env.prod`.

## Implementation Summary

**Problem:** The app was sharing a Umami instance (`umami.wbtm.io`) with unrelated services, limiting analytics isolation, API access, and data ownership. Additionally, the builder UI (`preview.html`) had `umami.track()` calls that never fired because the Umami script was never loaded.

**Files changed:**
- `docker-compose.yml` — added `umami` (port 3003) and `umami-db` (postgres:15-alpine, internal only) services with a named volume `umami-db-data`
- `builder/.env` — changed `UMAMI_BASE_URL` from `https://umami.wbtm.io` to `http://localhost:3003`; password updated to match new instance
- `builder/data/settings.json` — updated `umamiWebsiteId` from the old shared instance ID to `48fb959a-0f0f-4d0e-b89c-4a29b61db99e`
- `builder/server.js` — fixed hardcoded `https://umami.wbtm.io/script.js` in the publish function to use `UMAMI_BASE_URL` variable; exposed `umamiBaseUrl` field in `GET /api/settings` response
- `builder/features/builder-ui/preview.html` — added inline script that fetches `/api/settings` and dynamically inserts the Umami `<script>` tag, making the builder UI itself tracked
