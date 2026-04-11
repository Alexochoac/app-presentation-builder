# Project Map — App Presentation Builder

Last updated: 2026-04-11

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
├── IDEAS.md                        ← Mid-session ideas log
├── memory/sessions.md              ← Session history
│
└── builder/                        ← The runnable web app
    ├── server.js                   ← Express server — all API endpoints + slide render functions
    ├── package.json                ← Dependencies: express, cheerio, dotenv, express-session
    ├── .env                        ← SESSION_SECRET, BUILDER_USER, BUILDER_PASS (not in git)
    ├── .env.example                ← Template for env vars
    ├── data/
    │   ├── deck.json               ← Slide order + visibility (librarySlideId refs)
    │   ├── slide-library.json      ← Catalog of library slides (templateId + edits)
    │   ├── slide-templates.json    ← Template definitions (id, defaultContent)
    │   ├── layouts.json            ← User-created layouts (legacy new-slide system)
    │   ├── settings.json           ← App settings (heroBg, heroBgFocal, etc.)
    │   └── renderers/              ← Source files for per-slide render functions (agents write here)
    │       ├── slide-06-surface.js     ← renderDefectGalleryLayout
    │       ├── slide-07-dimension.js   ← renderCarouselCardsLayout
    │       ├── slide-08-screenprint.js ← renderChecklistCarouselLayout
    │       ├── slide-09-logo-check.js  ← renderCarouselTagsLayout
    │       ├── slide-10-database.js    ← renderTabsCarouselLayout
    │       ├── slide-11-sensitivity.js ← renderCarouselStepsLayout
    │       ├── slide-12-footprint.js   ← renderFullCarouselLayout
    │       ├── slide-13-integrations.js← renderCardsGridLayout
    │       └── slide-14-cta.js         ← renderCtaLayout
    ├── features/
    │   ├── auth/
    │   │   ├── auth.js             ← Session auth middleware + login/logout routes
    │   │   └── login.html          ← Login page (dark theme)
    │   ├── dashboard/
    │   │   ├── index.html          ← Dashboard (served at /) — post-login home
    │   │   ├── dashboard.css       ← Legacy styles (to be deleted)
    │   │   └── dashboard.js        ← Deck manager + slide library + preview + drag-to-reorder
    │   ├── settings/
    │   │   └── index.html          ← Settings page (/settings) — Presentation Name, sidebar nav
    │   ├── slides/
    │   │   ├── index.html          ← /slides page (Templates | My Library | Deck tabs)
    │   │   ├── style.css           ← Shared slide CSS — mobile-first, all 15 slides
    │   │   ├── slide-01-cover.html ← Original HTML fragments (source of truth for content)
    │   │   ├── ... (slides 02-15)
    │   │   ├── uploads/            ← Customer-uploaded images (gitignored)
    │   │   └── components/
    │   │       ├── carousel.js     ← ls-carousel: add/delete/reorder/zoom/autoplay/compare
    │   │       ├── lightbox.js     ← Zoom lightbox + Add Image button
    │   │       ├── tabs.js         ← ls-tabs: add/delete/rename; calls LSTable.init on tab switch
    │   │       ├── list.js         ← ul[data-ls-list]: add/hide/delete/reorder/edit
    │   │       ├── table.js        ← table[data-ls-table]: row+col edit, dot cycling, resizable col
    │   │       │                     saveTable saves parent .ls-tabs container when inside tabs
    │   │       └── tracker.js      ← Umami analytics tracker
    │   └── builder-ui/
    │       └── preview.html        ← Builder UI (served at /builder/preview.html)
    └── shared/
        ├── app-style.css           ← Shared app shell CSS (dark/light theme)
        └── assets/                 ← Brand logos (served at /slides/shared/)
```

---

## Architecture

```
Browser → Express (server.js)
              ├── Auth routes (login/logout — public)
              ├── requireAuth middleware (gates everything below)
              ├── Static: /slides/uploads  → features/slides/uploads/
              ├── Static: /slides/shared   → shared/assets/
              ├── GET /slides/:deckSlideId.html  ← NEW: renders library slide via render chain
              ├── GET /slides/preview/:id        ← shell route: wraps fragment in full HTML
              ├── Static: /slides          → features/slides/
              ├── Static: /               → features/dashboard/
              ├── GET  /settings              → features/settings/index.html
              ├── GET  /slides                → features/slides/index.html
              ├── Static: /builder        → features/builder-ui/
              ├── GET  /api/deck               → reads deck.json + enriches with library data
              ├── PUT  /api/deck               → merges into deck.json (preserves librarySlideId)
              ├── POST /api/deck/slides/:id/edits  ← NEW: saves edits to library slide
              ├── POST /api/library            ← NEW: create library slide
              ├── POST /api/library/:id/edits  ← NEW: save edits to library slide directly
              ├── GET  /api/slide-library      → reads slide-library.json
              ├── DELETE /api/slide-library/:id → removes entry
              ├── POST /api/save               → edits slide HTML via Cheerio (old slides)
              ├── POST /api/upload-image        → saves base64 image to uploads/
              ├── POST /api/save-image-src      → updates img src in slide file
              └── POST /api/clone-slide         → copies slide HTML, adds to library+deck
```

---

## Template → Library → Deck Render Chain (implemented 2026-04-11)

**The 3-level chain:**

```
slide-templates.json  →  slide-library.json  →  deck.json
  (tpl-new-cover)          (lib-cover)           (deck-cover)
  defaultContent            edits: {}             librarySlideId: "lib-cover"
                                                  visible: true
```

**How a slide renders:**

1. Browser requests `GET /slides/deck-cover.html`
2. server.js looks up `deck-cover` in deck.json → gets `librarySlideId: "lib-cover"`
3. Looks up `lib-cover` in slide-library.json → gets `templateId: "tpl-new-cover"`, `edits: {}`
4. Calls `renderLayoutToHtml(tpl, deckSlideId, savedEdits)`
5. `renderLayoutToHtml` dispatches to the correct render function by `tpl.id`
6. Returns full HTML fragment

**All 14 dispatch lines in server.js (~line 2572):**
```js
if (tplId === 'tpl-new-cover')              return renderHeroLayout(...)
if (tplId === 'tpl-new-company')            return renderCompanyLayout(...)
if (tplId === 'tpl-new-comparison')         return renderComparisonLayout(...)
if (tplId === 'tpl-new-capability-matrix')  return renderCapabilityLayout(...)
if (tplId === 'tpl-new-technology')         return renderTechnologyLayout(...)
if (tplId === 'tpl-new-defect-gallery')     return renderDefectGalleryLayout(...)
if (tplId === 'tpl-new-carousel-cards')     return renderCarouselCardsLayout(...)
if (tplId === 'tpl-new-checklist-carousel') return renderChecklistCarouselLayout(...)
if (tplId === 'tpl-new-carousel-tags')      return renderCarouselTagsLayout(...)
if (tplId === 'tpl-new-tabs-carousel')      return renderTabsCarouselLayout(...)
if (tplId === 'tpl-new-carousel-steps')     return renderCarouselStepsLayout(...)
if (tplId === 'tpl-new-full-carousel')      return renderFullCarouselLayout(...)
if (tplId === 'tpl-new-cards-grid')         return renderCardsGridLayout(...)
if (tplId === 'tpl-new-cta')               return renderCtaLayout(...)
```

**Render function pattern:**
```js
function renderXxxLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};
  // Simple text:
  applyEdit('key', 'default text', savedEdits)
  // Complex containers (tabs/carousels/lists):
  (savedEdits['key'] != null ? savedEdits['key'] : defaultHtml)
  // Returns joined array of HTML strings
}
```

**Save path for library-backed slides:**
- Text fields: `doSave()` → `POST /api/deck/slides/:id/edits` → saves to library slide's `edits`
- Carousels/tables/lists: dispatch `slide-carousel-save` event → same endpoint
- Table inside `.ls-tabs`: `saveTable` detects ancestor `.ls-tabs[data-edit]` → saves whole tabs container under tabs' `data-edit` key (not just the table)

---

## deck.json Structure (current)

```json
{
  "title": "GlassQuality",
  "slides": [
    { "id": "deck-cover",      "librarySlideId": "lib-cover",      "visible": true },
    { "id": "deck-company",    "librarySlideId": "lib-company",     "visible": true },
    { "id": "deck-comparison", "librarySlideId": "lib-comparison",  "visible": true },
    { "id": "deck-capability", "librarySlideId": "lib-capability",  "visible": true },
    { "id": "deck-technology", "librarySlideId": "lib-technology",  "visible": true },
    ... (14 total)
  ]
}
```

`PUT /api/deck` merges incoming slides with existing data — preserves `librarySlideId` even if not in incoming payload.

---

## Slides (14 active — LineScanner product)

| Deck ID | Library ID | Template ID | Render Function | Source HTML |
|---------|-----------|-------------|-----------------|-------------|
| deck-cover | lib-cover | tpl-new-cover | renderHeroLayout | slide-01-cover.html |
| deck-company | lib-company | tpl-new-company | renderCompanyLayout | slide-02-company.html |
| deck-comparison | lib-comparison | tpl-new-comparison | renderComparisonLayout | slide-03-why.html |
| deck-capability | lib-capability | tpl-new-capability-matrix | renderCapabilityLayout | slide-04-linescanner.html |
| deck-technology | lib-technology | tpl-new-technology | renderTechnologyLayout | slide-05-technology.html |
| deck-surface | lib-surface | tpl-new-defect-gallery | renderDefectGalleryLayout | slide-06-surface.html |
| deck-dimension | lib-dimension | tpl-new-carousel-cards | renderCarouselCardsLayout | slide-07-dimension.html |
| deck-screenprint | lib-screenprint | tpl-new-checklist-carousel | renderChecklistCarouselLayout | slide-08-screenprinting.html |
| deck-logo-check | lib-logo-check | tpl-new-carousel-tags | renderCarouselTagsLayout | slide-09-logo-check.html |
| deck-database | lib-database | tpl-new-tabs-carousel | renderTabsCarouselLayout | slide-10-database.html |
| deck-sensitivity | lib-sensitivity | tpl-new-carousel-steps | renderCarouselStepsLayout | slide-11-sensitivity.html |
| deck-footprint | lib-footprint | tpl-new-full-carousel | renderFullCarouselLayout | slide-12-footprint.html |
| deck-integrations | lib-integrations | tpl-new-cards-grid | renderCardsGridLayout | slide-13-integrations.html |
| deck-cta | lib-cta | tpl-new-cta | renderCtaLayout | slide-14-cta.html |

---

## JS Components

| Component | Attribute | What it does |
|-----------|-----------|--------------|
| carousel.js | `data-edit="key"` on `.ls-carousel` | Add/delete/reorder images, zoom, autoplay, compare |
| lightbox.js | `data-zoom` on `<img>` | Click to zoom, gallery group, Add Image button |
| tabs.js | `.ls-tabs` wrapper | Tab switcher, add/delete/rename; **calls LSTable.init on tab switch** |
| list.js | `ul[data-ls-list]` | Add/hide/delete/reorder items, dblclick to edit |
| table.js | `table[data-ls-table]` | Row+col add/hide/delete, dot cycling, resizable col; **saveTable saves parent .ls-tabs container** |

**Save pattern (library slides):** Components dispatch `slide-carousel-save` → preview.html catches → `POST /api/deck/slides/:id/edits` → writes to library slide's edits in slide-library.json

**table.js requirements:** Each `table[data-ls-table]` wrapper div must contain `[data-ls-col-restore]`, `[data-ls-row-restore]`, and `[data-ls-add-row]` elements. Column headers need `<span class="ls-col-label">`. Dot spans use `ls-dot ls-dot-on/off/red/blue` classes.

---

## Style System

- **App shell styles:** `builder/shared/app-style.css` — Apple Keynote aesthetic, dark/light via `data-theme`, persisted as `pb-theme`
- **Slide styles:** `builder/features/slides/style.css` — mobile-first (`min-width` breakpoints)
- **Standard slide anatomy:** all 14 content slides use `slide-layout`/`slide-head`/`slide-body` wrappers
- **Known conflict:** 3-layer CSS (style.css vs per-slide `<style>` vs inline styles) — design system refactor planned

**Slide 04 mobile fix (2026-04-11):** `.ls4-grid` uses `display:flex; flex-direction:column` on mobile with `.ls-carousel { order:-1 }` to show carousel above table. Resets to `display:grid` on desktop.

---

## Known Issues / Open Items

- **3-layer CSS conflict** — style.css, per-slide `<style>` blocks, and inline styles conflict. Planned fix: style.css as single source of truth
- **Slide-06 defect names** — selector button labels are JS-generated; needs testing through render path
- **Slide-12 headline split** — agent split `headline` into `headline` + `headline-emphasis` keys; may need consolidation
- **No export yet** — `scripts/build.js` not built
- **No deploy yet** — `scripts/deploy.js` not built
- **dashboard.css** — legacy file, should be deleted
- **Image caption editing** — no UI to edit `img.alt`

---

## What's Next

1. **Test all 14 slides** visually against originals — fix per-slide issues as found
2. **Slide-06 defect gallery** — verify JS defect selector works through render path
3. **Design system refactor** — eliminate CSS conflict; one source of truth in style.css
4. `scripts/build.js` / `scripts/deploy.js`
5. Presentation view — read-only mode
