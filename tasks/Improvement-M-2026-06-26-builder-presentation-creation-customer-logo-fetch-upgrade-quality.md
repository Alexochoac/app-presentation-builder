---
title: Builder — Presentation Creation — Customer Logo Fetch — Upgrade to real high-quality logos
type: Improvement
priority: M
status: pending
area: builder
---

The "Fetch logo" button (Save/Edit Presentation modal) currently returns only favicon-quality icons via keyless sources (unavatar / homepage scrape), because Clearbit's free logo API was retired. Result is small, blurry images on the cover slide and presentation card.

The endpoint (`/api/fetch-customer-logo` in server.js) already prefers logo.dev when `LOGODEV_TOKEN` is set in `.env` — no code change needed, just the token. To complete this:

- Sign up for a free logo.dev publishable token and add `LOGODEV_TOKEN=...` to `.env` and `.env.example`.
- Verify the Fetch button returns real 512px logos (source reported as `logo.dev`).
- Optionally evaluate Brandfetch as an alternative/fallback source.
- Keep keyless fallback + manual upload override as-is.
