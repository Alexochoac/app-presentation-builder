---
id: Feature-H-2026-05-27-deploy-v1-1-0-public-url-nav-bar-umami-tracking-routing
title: "v1.1.0 — Public URL, nav bar, Umami tracking, and /public vs /finished routing"
status: done
priority: high
area: build-deploy
created_at: 2026-05-26
completed_at: 2026-05-27
---

## What Was Done

Set up the production v1.1.0 container to serve presentations correctly, with a proper public URL, nav bar, Umami analytics tracking, and split routing between internal preview and customer-facing public view.

---

## Problems Solved

### 1. Share links showed wrong URL (`app-presentation-builder.pages.dev`)

The builder UI and dashboard had the old Cloudflare Pages domain hardcoded in two places each. When a user published a presentation, the share link shown in the Finished Presentations panel was wrong.

**Fix:** Added `publicBaseUrl` to the `/api/settings` response (populated from `PUBLIC_BASE_URL` env var). Both `builder-ui/index.html` and `dashboard/index.html` now fetch `/api/settings` on load and overwrite the JS variable before rendering any links.

```javascript
// server.js — /api/settings
data.publicBaseUrl = PUBLIC_BASE_URL;

// builder-ui/index.html — on DOMContentLoaded
fetch('/api/settings').then(r => r.json()).then(res => {
  if (res.success && res.data.publicBaseUrl) publicBaseUrl = res.data.publicBaseUrl;
});
```

---

### 2. No split between internal preview and public customer view

`/finished/` was served as open static files (no auth). There was no customer-facing URL.

**Fix:**
- `/public/:id/` — mounted **before** the global `requireAuth` middleware → open to anyone, no login needed
- `/finished/:id/` — remains after the auth wall → login required, internal preview only

```javascript
// Before requireAuth wall
app.use('/public', express.static(path.join(__dirname, '..', 'finished-presentations')));

// After requireAuth wall (protected by global middleware)
app.use('/finished', express.static(path.join(__dirname, '..', 'finished-presentations')));
```

**Key learning:** The app uses a global `app.use(requireAuth)` at line ~58 of server.js. Routes registered before it are public. Routes registered after it are all auth-protected automatically. Always check where in the file a new route lands relative to this middleware.

---

### 3. No nav bar on frozen presentations

Customers and internal users had no way to navigate back from a published presentation.

**Fix:** Injected a floating nav bar into every frozen HTML at publish time. The bar uses JS to detect the current path at runtime and shows the appropriate button:

- On `/finished/` → "← Back to Dashboard" (links to `/builder/`)
- On `/public/` → "← Company Webpage" (links to deck's `websiteUrl`, hidden if not set)

The deck's `websiteUrl` is baked in at publish time from deck settings.

```javascript
// Injected into frozen HTML before </body>
'var websiteUrl = ' + JSON.stringify(presDeck.websiteUrl || '') + ';',
'if (window.location.pathname.indexOf("/finished/") === 0) {',
'  label.textContent = "Back to Dashboard"; btn.href = "/builder/";',
'} else if (websiteUrl) {',
'  label.textContent = "Company Webpage"; btn.href = websiteUrl; btn.target = "_blank";',
'} else {',
'  document.getElementById("_pb-nav-bar").style.display = "none";',
'}',
```

---

### 4. No "Company Webpage" field in Deck Settings

The nav bar needs a URL to link to, but deck settings had no such field.

**Fix:** Added a "Company Webpage" input to the Deck Settings drawer in `builder-ui/index.html`, saved as `websiteUrl` on the deck JSON via the existing `PUT /api/deck` endpoint (which accepts any field via `Object.assign`).

---

### 5. Umami analytics queried `/finished/` paths — customers visit `/public/`

All analytics API endpoints (batch stats, pageviews, events, event-series, slide-events) built Umami URL filter paths using `/finished/:id/`. Since customers now visit `/public/:id/`, Umami logs `/public/` paths and the dashboard would show zero data.

**Fix:** Updated all six analytics endpoints to use `/public/` path format instead of `/finished/`.

---

### 6. Git remote URL accumulated credentials on every container restart

The startup code injected `user:token@` into the git remote URL but didn't strip existing credentials first. On each restart, it prepended another `user:token@` to an already-tokenized URL, creating an infinitely long string.

**Fix:** Strip all credentials with a greedy regex before injecting the current token:

```javascript
// Before (non-greedy — stops at first @, leaves the rest)
var cleanRemote = currentRemote.replace(/https:\/\/[^@]+@/, 'https://');

// After (greedy — eats all user:pass@ segments up to the last @)
var cleanRemote = currentRemote.replace(/https:\/\/.+@/, 'https://');
```

---

### 7. `PUBLIC_BASE_URL` was wrong for the new routing

Was set to `https://alexochoac.github.io/put-a-presentation-published` (GitHub Pages). Changed to `https://put-a-presentation.wbtm.io` since presentations are now served directly by the app.

Updated in:
- `builder/server.js` — default fallback changed to `http://localhost:3000`
- `builder/.env.prod`
- `C:/Users/Alex/put-a-presentation/v1.1.0/.env`

The share modal `baseUrl` and the publish endpoint `publicUrl` were also updated from `/finished-presentations/` to `/public/`.

---

## Files Changed

| File | Change |
|---|---|
| `builder/server.js` | `/api/settings` exposes `publicBaseUrl`; `/public` route added before auth wall; `/finished` kept after auth wall; nav bar injected into frozen HTML; `websiteUrl` baked in at publish; all analytics endpoints use `/public/` paths; git remote strip regex fixed to greedy |
| `builder/features/builder-ui/index.html` | Fetches `/api/settings` on load to set `publicBaseUrl`; both link-building functions use the variable; "Company Webpage" field added to Deck Settings drawer with save wiring |
| `builder/features/dashboard/index.html` | Fetches `/api/settings` on load to set `publicBaseUrl`; `buildFpLinkEl` uses the variable |
| `builder/.env.prod` | `PUBLIC_BASE_URL` updated to `https://put-a-presentation.wbtm.io` |
| `C:/Users/Alex/put-a-presentation/v1.1.0/.env` | Same update |

---

## Deployment

- Docker image rebuilt three times during this session (two crashes fixed)
- Container recreated clean from final image: `put-a-presentation-v1-1-0-builder-1`
- Git remote reset manually inside running container after accumulation bug was found
- Image tagged as both `v1.1.0` and `latest` on GHCR

## Next Steps

- Set **Company Webpage** URL in Deck Settings for each deck
- Re-publish existing presentations so the nav bar is baked in and share links use `/public/`
- Verify Umami dashboard shows engagement at `/public/` paths after republish
