# Project Map — App Presentation Builder

Last updated: 2026-04-07

---

## Overview

A local web app for building customized sales presentations for Softsolution's LineScanner glass inspection product. Sales reps log in, manage their slide deck from a dashboard, customize slides (logos, text, images) in the builder UI, and save changes back to disk.

**Status:** Active — Phase 1 in development
**Runs locally at:** `http://localhost:3000`
**Start command:** `cd builder && node server.js`
**Login → Dashboard → Open Builder → preview.html**

---

## Folder Structure

```
App-presentation-builder/
├── PLAN.md                         ← Full product roadmap + TODO
├── CONTEXT.md                      ← Project context + next steps
├── TODO.md                         ← Current task list
├── memory/sessions.md              ← Session history
│
└── builder/                        ← The runnable web app
    ├── server.js                   ← Express server — all API endpoints + static serving
    ├── package.json                ← Dependencies: express, cheerio, dotenv, express-session
    ├── .env                        ← SESSION_SECRET, BUILDER_USER, BUILDER_PASS (not in git)
    ├── .env.example                ← Template for env vars
    ├── data/
    │   ├── deck.json               ← Source of truth for slide order + visibility
    │   └── slide-library.json      ← Catalog of all available slide templates
├── IDEAS.md                        ← Mid-session ideas log (landing page, dual-preview builder)
    ├── features/
    │   ├── auth/
    │   │   ├── auth.js             ← Session auth middleware + login/logout routes
    │   │   └── login.html          ← Login page (dark theme)
    │   ├── dashboard/
    │   │   ├── index.html          ← Dashboard (served at /) — post-login home
    │   │   ├── dashboard.css       ← Dashboard styles (legacy — being replaced by app-style.css)
    │   │   └── dashboard.js        ← Deck manager + slide library + preview + drag-to-reorder
    │   ├── settings/
    │   │   └── index.html          ← Settings page (served at /settings)
    │   ├── builder-ui/
    │   │   ├── index.html          ← Stub (unused)
    │   │   └── preview.html        ← Builder UI (served at /builder/preview.html)
    │   └── slides/
    │       ├── style.css           ← Shared slide CSS — mobile-first, all 15 slides
    │       ├── slide-01-cover.html
    │       ├── ... (slides 02-15)
    │       ├── uploads/            ← Customer-uploaded images (gitignored)
    │       └── components/
    │           ├── carousel.js     ← ls-carousel: add/delete/reorder/zoom/autoplay/compare
    │           ├── lightbox.js     ← Zoom lightbox + Add Image button
    │           ├── tabs.js         ← ls-tabs: add/delete/rename tabs
    │           ├── list.js         ← ul[data-ls-list]: add/hide/delete/reorder/edit
    │           ├── table.js        ← table[data-ls-table]: row+col edit, dot cycling, resizable col
    │           └── tracker.js      ← Umami analytics tracker
    └── shared/
        ├── app-style.css           ← Shared app shell CSS (dashboard, settings, topbar — dark/light theme)
        └── assets/                 ← Brand logos, product images (served at /slides/shared/)
```

---

## Architecture

```
Browser → Express (server.js)
              ├── Auth routes (login/logout — public)
              ├── requireAuth middleware (gates everything below)
              ├── Static: /slides/uploads  → features/slides/uploads/
              ├── Static: /slides/shared   → shared/assets/
              ├── GET    /slides/preview/:id → shell route: wraps fragment in full HTML + style.css
              ├── Static: /slides          → features/slides/
              ├── Static: /shared          → shared/
              ├── Static: /               → features/dashboard/   ← dashboard served here
              ├── GET    /settings         → features/settings/index.html
              ├── Static: /builder        → features/builder-ui/  ← preview.html here
              ├── GET  /api/deck           → reads builder/data/deck.json
              ├── PUT  /api/deck           → overwrites deck.json (order + visibility)
              ├── GET  /api/slide-library  → reads builder/data/slide-library.json
              ├── POST /api/save           → edits slide HTML via Cheerio, writes to disk
              ├── POST /api/upload-image   → saves base64 image to uploads/
              ├── POST /api/save-image-src → updates img src in slide file via Cheerio
              └── POST /api/clone-slide    → copies slide HTML, resets text/images, adds to library+deck
```

---

## User Flow

1. `http://localhost:3000` → redirects to `/auth/login` if not logged in
2. Login → redirects to `/` (dashboard)
3. Dashboard: manage deck order/visibility, add/remove slides from library, preview slides
4. Click slide title → scaled iframe thumbnail preview; click thumbnail → fullscreen lightbox with Edit button
5. Click "Open Builder →" → `/builder/preview.html` with all visible slides
6. Edit any text (click to type), upload images, reorder carousel slides
7. Changes auto-save to disk every 1.5s of inactivity
8. `/settings` → Theme toggle (dark/light), Company Profile, and other Coming Soon sections

---

## Deck Config (`builder/data/deck.json`)

```json
{
  "title": "LineScanner Presentation",
  "slides": [
    { "id": "slide-01-cover", "visible": true },
    { "id": "slide-02-company", "visible": true },
    ...
  ]
}
```

- `id` matches the filename without `.html`
- `visible: false` hides a slide from the builder without removing it
- Order in array = order in presentation
- Dashboard PUT /api/deck with full array to update

---

## Slides (15 total — LineScanner product)

| File | Content | Editable text |
|------|---------|---------------|
| slide-01-cover | Hero — customer logo + tagline + bg image | headline, subheadline, badge, stats, captions |
| slide-02-company | Company stats, tabs (About/Tech/Map/IQC) | headlines, KPI values+labels, tab labels, pillar text, tech cards, map pins |
| slide-03-why | Two-column comparison list (problems vs benefits) | column headers, tier labels, list items (via list.js) |
| slide-04-linescanner | Capability matrix table + process flow | headlines, tab labels, table cells (via table.js), carousel labels, legend |
| slide-05-technology | 3-tab: How It Works / 16-bit / vs Camera | headlines, tab labels, 8 component cards, column headers, comparison labels |
| slide-06-surface | 11 defect carousels + defect selector | headlines, subtitle; defect names are JS-generated (NOT editable yet) |
| slide-07-dimension | Two info cards + main carousel | headlines, card headers, 10 list items, trigger link text |
| slide-08-screenprinting | Feature list + carousel | headline, card label, 6 list items |
| slide-09-logo-check | Logo defect tags + carousel | headline, 6 tag labels |
| slide-10-database | Two-tab: Archive / Management Console | headline, tab labels, 10 list items, 2 carousels |
| slide-11-sensitivity | Steps + carousel | headline, steps label, 5 steps, tagline |
| slide-12-footprint | Diagram + spec badges | headline, subtitle, 6 badge values |
| slide-13-integrations | 9 integration partner cards | headline, subtitle, 9 names + 9 types |
| slide-14-cta | Contact info + next steps | all text fully editable, email href syncs live |
| slide-15-clone-of-integrations | Clone of slide-13 | same as integrations |

---

## JS Components

| Component | Attribute | What it does |
|-----------|-----------|--------------|
| carousel.js | `data-edit="key"` on `.ls-carousel` | Add/delete/reorder images, zoom, autoplay toggle, compare mode (Split/Reveal) |
| lightbox.js | `data-zoom` on `<img>` | Click to zoom, gallery group, Add Image button |
| tabs.js | `.ls-tabs` wrapper | Tab switcher, add/delete/rename |
| list.js | `ul[data-ls-list]` | Add/hide/delete/reorder items, dblclick to edit |
| table.js | `table[data-ls-table]` | Row+col add/hide/delete, dot cycling (●○·), edit cells, **resizable first column** |

**Save pattern:** All components dispatch `slide-carousel-save` custom event → preview.html catches it → derives filename from `SLIDES[current].file` → POST `/api/save`

**table.js requirements:** Each `table[data-ls-table]` wrapper div must contain `[data-ls-col-restore]`, `[data-ls-row-restore]`, and `[data-ls-add-row]` elements for full functionality. Column headers need `<span class="ls-col-label">` (not `ls4-col-label`). Dot cells need `ls-dot ls-dot-on/off/red/blue` classes (not `ls4-dot-*`).

---

## Style System

- **App shell styles:** `builder/shared/app-style.css` — Apple Keynote aesthetic, dark/light via `data-theme` on `<html>`, persisted in `localStorage` as `pb-theme`
- **Theme toggle:** lives at `/settings` — works on both settings and dashboard pages via localStorage restore IIFE
- **Slide styles:** `builder/features/slides/style.css` — Softsolution brand, **mobile-first** (`min-width` breakpoints), separate from app style
- All CSS files converted to mobile-first (`max-width` → `min-width` breakpoints)
- **Standard slide anatomy** introduced 2026-04-07: all 14 content slides now use `slide-layout` / `slide-head` / `slide-body` wrapper structure (slide-01-cover exempt)
- `.slide-layout` and `.slide-body` CSS rules added to `style.css` — mobile-first, desktop via `min-width:769px`
- **Known conflict**: 3-layer CSS (style.css vs per-slide `<style>` vs inline styles) causes desktop/mobile fixes to break each other — design system refactor is top next priority

---

## Dashboard vs Settings Distinction

- **Dashboard → Customer Settings** = the company *receiving* the presentation (name, contact, logo)
- **Settings → Company Profile** = the user's own company (Softsolution/LiteSentry)

---

## Key Conventions

- `data-edit="key"` + `contenteditable=""` → text is editable, auto-saves
- `data-builder-only=""` → stripped from final customer output
- `data-ls-list` → list.js takes over the `<ul>`
- `data-ls-table` → table.js takes over the `<table>`
- `data-zoom` on `<img>` → lightbox on click
- `data-no-caption` on `.ls-carousel` → suppress auto-caption overlay
- Captions are runtime-only (generated from `img.alt`) — NOT saved to disk
- Slide preview iframes point to `/slides/preview/:id` (shell route), NOT the raw `.html` fragment

---

## Known Issues / Open Items

- **3-layer CSS conflict** — style.css, per-slide `<style>` blocks, and inline styles fight each other. Fixing one breaks the other. Planned fix: style.css is single source of truth for layout; per-slide styles handle decoration only; carousels use `aspect-ratio`; columns use `.slide-cols` class
- **Per-slide inline CSS mobile audit** — anatomy refactor done but layout still inconsistent across slides
- **Slide-06 defect names** — selector button labels are JS-generated from a hardcoded array; cannot be edited without refactoring to static HTML
- **Image caption editing** — no UI to edit `img.alt` (captions come from this)
- **No export yet** — `scripts/build.js` (strip builder-only, inject customer config) not built
- **No deploy yet** — `scripts/deploy.js` (push to GitHub Pages) not built
- **dashboard.css** — legacy file still present, should be deleted once confirmed unused

---

## What's Next

1. **Design system refactor** — eliminate CSS conflict; one source of truth in style.css; carousels use `aspect-ratio`; columns use `.slide-cols` standard class
2. Fix slide-06 defect selector names (move to static HTML)
3. Presentation view — read-only mode (visible slides + hidden slides in extras menu)
4. `scripts/build.js` — assemble final customer HTML, strip `data-builder-only`
5. `scripts/deploy.js` — push to GitHub Pages
6. Image caption editing UI
7. Dual-preview layout builder (desktop + mobile side by side) — see IDEAS.md
