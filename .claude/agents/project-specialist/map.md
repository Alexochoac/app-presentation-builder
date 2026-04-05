# Project Map — App Presentation Builder

Last updated: 2026-04-05

---

## Overview

A local web app for building customized sales presentations for Softsolution's LineScanner glass inspection product. Sales reps select and customize HTML slides (logos, text, images) through a browser UI, preview the result, and save changes back to disk.

**Status:** Active — in development
**Runs locally at:** `http://localhost:3000`
**Start command:** `cd builder && node server.js`

---

## Folder Structure

```
App-presentation-builder/
├── slide-library/                  ← Source slide templates (master copies)
│   ├── README.md                   ← How to use the library
│   ├── _base.css                   ← All component CSS (CSS variables, no hardcoded colors)
│   ├── _theme-starglass.css        ← Starglass blue theme
│   └── linescanner/                ← 14 slide HTML files (self-contained <div> blocks)
│
└── builder/                        ← The runnable web app
    ├── server.js                   ← Express server — all API endpoints + static serving
    ├── package.json                ← Dependencies: express, cheerio, dotenv, express-session
    ├── .env                        ← SESSION_SECRET and auth password (not in git)
    ├── .env.example                ← Template for env vars
    ├── features/
    │   ├── auth/
    │   │   ├── auth.js             ← Session auth middleware + login/logout routes
    │   │   └── login.html          ← Login page
    │   ├── builder-ui/
    │   │   ├── index.html          ← Main builder interface (served at /)
    │   │   └── preview.html        ← Presentation preview
    │   └── slides/
    │       ├── style.css           ← Slide styles for the builder
    │       ├── slide-01-cover.html ← 14 editable slide files
    │       ├── ... (slides 02-14)
    │       ├── uploads/            ← Customer-uploaded images (logos, photos)
    │       └── components/         ← JS components: carousel, lightbox, list, table, tabs, tracker
    └── shared/
        └── assets/                 ← Shared brand assets (logos, product images)
```

---

## Architecture

```
Browser → Express (server.js)
              ├── Auth middleware (requireAuth)
              ├── Static: /slides/uploads → features/slides/uploads/
              ├── Static: /slides/shared  → shared/assets/
              ├── Static: /slides         → features/slides/
              ├── Static: /              → features/builder-ui/
              ├── POST /api/save          → edits slide HTML via Cheerio, writes to disk
              ├── POST /api/upload-image  → saves base64 image to uploads/
              └── POST /api/save-image-src → updates img src in slide file via Cheerio
```

**Key pattern:** Slides use `data-edit="key"` attributes. The builder UI reads these, lets the user edit, then posts changes to `/api/save`. Cheerio on the server finds `[data-edit="key"]` elements and updates their innerHTML, writing the modified HTML back to disk.

---

## Slides (14 total — LineScanner product)

| File | Content |
|------|---------|
| slide-01-cover.html | Hero — customer logo + tagline + bg image |
| slide-02-company.html | KPI cards — company stats |
| slide-03-why.html | Why LineScanner — feature cards + image split |
| slide-04-linescanner.html | LineScanner product overview |
| slide-05-technology.html | 16-bit technology — numbered steps + image |
| slide-06-surface.html | Surface quality — defect tags + scan images |
| slide-07-dimension.html | Dimensional control — two-column + screenshot |
| slide-08-screenprinting.html | Screen printing / logo check |
| slide-09-logo-check.html | Logo check detail |
| slide-10-database.html | Database / traceability — feature list + images |
| slide-11-sensitivity.html | Sensitivity settings |
| slide-12-footprint.html | Physical footprint / installation |
| slide-13-integrations.html | Integration partners grid |
| slide-14-cta.html | Next steps CTA |

---

## JS Components (builder/features/slides/components/)

| File | Purpose |
|------|---------|
| carousel.js | Image carousel for slides |
| lightbox.js | Image lightbox viewer |
| list.js | Dynamic list rendering |
| table.js | Table component |
| tabs.js | Tab switcher |
| tracker.js | Progress/step tracker |

---

## Key Decisions

- **Cheerio for server-side HTML editing** — avoids a database; slides stay as plain HTML files
- **No framework** — vanilla JS throughout, keeps it simple and portable
- **Auth via express-session** — basic password protection, not multi-user
- **Uploads stored on disk** — `/features/slides/uploads/` — not in a CDN or database
- **`data-edit` attribute pattern** — marks editable regions in slide HTML; consistent across all slides

---

## Open Questions / Known Issues

- No export/PDF functionality yet
- No way to create a new presentation (customer folder) from the UI — done manually
- Uploads folder not gitignored (large binary files)
- Session secret falls back to `'dev-secret-change-me'` if `.env` is missing

---

## What's Next

(Update this after each session wrap)
