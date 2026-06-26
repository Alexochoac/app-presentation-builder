---
title: Builder — Presentation Creation — Customer Logo — Fetch from company website
type: Feature
priority: M
status: done
completed_at: 2026-06-26 17:46
area: builder
---

Add a "Fetch logo" capability so a customer's logo can be pulled automatically from their website when creating/editing a presentation, feeding both the cover slide and the finished-presentation card (both already read `customerLogoSrc`).

What was built this session:

- **Server** (`builder/server.js`): new `POST /api/fetch-customer-logo` endpoint with helpers `fetchBuffer` (http/https + redirects + timeout), `normalizeDomain`, `looksLikeImage`, `saveFetchedLogo`. Source order, best-quality-first: logo.dev (only if `LOGODEV_TOKEN` set in `.env`) → unavatar.io (keyless) → homepage scrape (apple-touch-icon / og:image / twitter:image / icon). Saves via existing `dedupUpload`, returns `{ success, src, source }`. Falls back to 404 with a "upload one manually" message.
- **Server**: persist new `customerUrl` field on the presentation record across create, replace, and PUT edit paths.
- **UI** (`builder/features/builder-ui/index.html`): "Company Website" input + "Fetch logo" button below Company Name in the Save/Edit Presentation modal. Handler pulls the saved logo back as a data URL and routes it through the SAME state as a manual upload (`saveLogoData`/`saveLogoFilename` + `setLogoPreview`), so "Upload image" still overrides it. Status line shows progress / source / errors. Field prefilled on edit from `customerUrl`.

Known limitation (tracked separately): without a logo.dev token the keyless sources return favicon/icon-quality images, not the real company logo. Manual upload remains the override. Quality upgrade tracked in `Improvement-M-2026-06-26-builder-presentation-creation-customer-logo-fetch-upgrade-quality.md`.

Verified: `node --check` passes on server.js; standalone fetch test confirmed all four test domains returned a savable image. Not yet exercised live in-browser through the auth-gated UI.

## Implementation Summary

**Problem / goal:** Let the user auto-populate the recipient company's logo from their website URL, so it appears on both the cover slide and the finished-presentation card without manual upload.

**Key discoveries during the session:**
- The deck already stores `websiteUrl`/`logo`, but that is the *presenter's* brand — not the customer's. The customer logo lives per-presentation as `customerLogoSrc`, which feeds both the cover slide (server.js ~2277) and the presentation card.
- **Clearbit's free logo API is dead** (`logo.clearbit.com` no longer resolves — retired after the HubSpot acquisition). Confirmed by live test. Original plan (Clearbit-first) was rewritten.
- Keyless sources (unavatar.io, Google favicon, homepage scrape) all return **favicon/icon-quality** images, not the real logo. Real logos require a logo.dev free token. Accepted because manual upload always overrides.

**Files changed:**
- `builder/server.js`
  - New `POST /api/fetch-customer-logo` endpoint (inserted after the deck `upload-hero-bg` route).
  - New helpers: `fetchBuffer` (http/https GET → Buffer, follows up to 4 redirects, 8s timeout), `normalizeDomain` (any URL → bare domain), `looksLikeImage` (content-type image/* + >512 bytes guard), `saveFetchedLogo` (writes via existing `dedupUpload`, picks extension from content-type).
  - Source order, best-first: logo.dev (gated on `process.env.LOGODEV_TOKEN`) → unavatar.io → homepage scrape via cheerio (`apple-touch-icon` → `og:image` → `twitter:image` → `icon`). Returns `{ success, src, source }`; 404 with manual-upload hint on miss.
  - Persisted new `customerUrl` field on the presentation record in all three write paths: create record, `replaceId` branch, and the `PUT /api/presentations/:id` field-level edit.
- `builder/features/builder-ui/index.html`
  - Added "Company Website" input (`#savePresWebsite`) + "Fetch logo" button (`#fetchLogoBtn`) + status line (`#fetchLogoStatus`) below the Company Name field in the Save/Edit Presentation modal.
  - Fetch handler calls the endpoint, then re-fetches the returned `src` as a Blob → data URL and assigns it to `saveLogoData`/`saveLogoFilename` + `setLogoPreview`, i.e. the exact same state as a manual upload, so the existing "Upload image" button still overrides it.
  - `openSavePresModal` resets/prefills the website field from `editPres.customerUrl`; save payload sends `customerUrl`.

**Verification:** `node --check` clean on server.js; a throwaway `_tmp_logo_test.js` exercised the keyless chain against github/apple/glassquality/stripe (all returned an image, all favicon-sized — glassquality worst at ~1.5 KB) and was then deleted. Live in-browser test through the auth-gated modal not yet performed.

**Follow-up:** quality upgrade (add `LOGODEV_TOKEN`) tracked in `Improvement-M-2026-06-26-builder-presentation-creation-customer-logo-fetch-upgrade-quality.md`.
