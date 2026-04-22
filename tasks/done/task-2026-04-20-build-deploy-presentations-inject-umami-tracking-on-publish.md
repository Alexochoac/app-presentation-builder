---
title: Build/Deploy — Presentations — Umami — Inject tracking script and events on publish
priority: normal
status: done
area: build-deploy
---

When a finished presentation is built/published, automatically inject the correct Umami analytics configuration into the output HTML. This means: (1) add the Umami script tag with the correct website_id (one per customer presentation), and (2) ensure each interactive slide component fires umami.track() calls using the naming convention: event name = slide identifier (e.g. 'slide-overview'), with properties: component (tab/carousel/image/etc), label (visible element name), and optional action (open/close/next/prev). See umami-guidelines.md in presentation-builder-softsolution/docs for the full tracking structure and naming conventions.

Tracking code from Umami:
<script defer src="https://umami.wbtm.io/script.js" data-website-id="306f3c58-2e8f-487c-b68f-e53f3b2a0b5d"></script>
Domain: softsolution-presentations.pages.dev

## Implementation Summary

### Architecture decisions
- One Umami website ID per admin account (not per presentation) — presentations are differentiated by URL path in Umami
- website ID stored in `builder/data/settings.json` under `umamiWebsiteId`
- Script tag injected at build time by `buildFrozenPresentation()` — conditionally included only if `umamiWebsiteId` is set
- Published URL format changed to `https://app-presentation-builder.pages.dev/finished-presentations/[id]`

### Files changed

**`builder/data/settings.json`** — added `umamiWebsiteId` field with the Cloudflare Pages website ID.

**`builder/server.js`**
- `buildFrozenPresentation()`: reads `umamiWebsiteId` from settings and injects the Umami `<script defer>` tag between `</style>` and `</head>` in generated HTML
- `buildFrozenPresentation()`: added `'tracker'` to the `components` array so `tracker.js` is inlined into output HTML (was missing — caused all `umami.track()` calls to silently skip)
- `makePresId()`: changed from timestamp-based IDs (`pres-name-1776779027820`) to sequential zero-padded IDs (`name-00000001`)

**`builder/features/slides/components/tracker.js`** — rebuilt to match umami-guidelines format:
- Event name: `slide-[id]` (e.g. `slide-ls4`)
- Properties: `{ component, label, action? }`
- Added `Track.slideId(el)` DOM helper — walks up to nearest `[data-slide]` ancestor

**`builder/features/slides/components/tabs.js`** — `switchTo()` now fires `Track.tab(slideId, tabLabel)` with the actual visible tab label text; derives slide ID from DOM if `data-track` not set.

**`builder/features/slides/components/carousel.js`** — prev/next handlers now fire `Track.carousel(slideId, action, imageAlt)` with the image alt text as label; derives slide ID from DOM.

**`builder/features/slides/components/lightbox.js`** — zoom click now fires `Track.zoom(slideId, imageAlt)` using image alt as label; works without requiring `data-track` on every image.

**`builder/features/dashboard/index.html`** — presentation cards now show the published URL (`https://app-presentation-builder.pages.dev/finished-presentations/[id]`) as an informational link; fetches settings via `Promise.all` alongside presentations.

**`scripts/build.js`** — fixed `extractFn` end marker from `'\n// GET /api/presentations'` to `'\nfunction makePresId('` to avoid capturing Express route code that references `app` (caused rebuild script to crash).

### Root cause of "no events" bug
`tracker.js` was not included in the `components` array in `buildFrozenPresentation()`. The other components (`tabs.js`, `carousel.js`, `lightbox.js`) all guard with `if (window.Track)` — since `window.Track` was undefined in finished presentations, every tracking call was silently skipped. Page views worked because the Umami script tag itself was present.

### Remaining issue
Page views are confirmed working. Component events (`umami.track()`) have not yet been verified in production — a separate task has been created to confirm and debug if needed.
