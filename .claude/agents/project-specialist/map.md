# Project Map — App Presentation Builder

Last updated: 2026-04-20 (session 6)

---

## Overview

A local web app for building customized sales presentations for Softsolution's LineScanner glass inspection product. Sales reps log in, manage their slide deck from a dashboard, customize slides (logos, text, images) in the builder UI, and save changes back to disk.

**Status:** Active — Phase 1 in development
**Runs locally at:** `http://localhost:3000`
**Start command:** `cd builder && node server.js`
**Login → Dashboard → Builder (`/slides`) → Open Builder → preview.html**

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
    ├── server.js                   ← Express server — all API endpoints + slide render functions ⚠️ SOLE SOURCE OF TRUTH FOR SLIDES
    ├── package.json                ← Dependencies: express, cheerio, dotenv, express-session
    ├── .env                        ← SESSION_SECRET, BUILDER_USER, BUILDER_PASS (not in git)
    ├── .env.example                ← Template for env vars
    ├── data/
    │   ├── deck.json               ← Slide order + visibility (librarySlideId refs)
    │   ├── slide-library.json      ← Catalog of library slides (templateId + edits)
    │   ├── slide-templates.json    ← Template definitions (id, defaultContent)
    │   ├── layouts.json            ← User-created layouts (legacy new-slide system)
    │   ├── settings.json           ← App settings (heroBg, heroBgFocal, etc.)
    │   ├── presentations.json      ← NEW (2026-04-12): Finished presentations snapshot history
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
    │   │   ├── index.html          ← Dashboard (served at /) — overview + Finished Presentations list
    │   │   ├── dashboard.css       ← Legacy styles (to be deleted)
    │   │   └── dashboard.js        ← Legacy deck manager (no longer loaded by dashboard)
    │   ├── settings/
    │   │   └── index.html          ← Settings page (/settings) — Presentation Name, sidebar nav
    │   ├── slides/
    │   │   ├── index.html          ← Builder page (/slides) — My Deck tab + Slide Manager tab; Create Presentation modal
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
    │   ├── presentation-view/      ← PLANNED: Read-only viewer page for finished presentations
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
              ├── GET /slides/:deckSlideId.html      ← renders library slide via render chain (bare fragment)
              ├── GET /slides/deck-preview/:id       ← renders deck slide + full HTML shell with component JS (carousel.js, tabs.js, etc.)
              ├── GET /slides/preview/:id            ← shell route: wraps static fragment in full HTML
              ├── Static: /slides          → features/slides/
              ├── Static: /               → features/dashboard/
              ├── GET  /settings              → features/settings/index.html
              ├── GET  /slides                → features/slides/index.html
              ├── Static: /builder        → features/builder-ui/
              ├── GET  /api/deck               → reads deck.json + enriches with library data
              ├── PUT  /api/deck               → merges into deck.json (preserves librarySlideId)
              ├── POST /api/deck/slides/:id/edits  ← saves edits to library slide
              ├── POST /api/library            ← create library slide
              ├── POST /api/library/:id/edits  ← save edits to library slide directly
              ├── GET  /api/slide-library      → reads slide-library.json
              ├── DELETE /api/slide-library/:id → removes entry
              ├── GET  /api/presentations      ← NEW (2026-04-12): returns all finished presentations
              ├── POST /api/presentations      ← NEW (2026-04-12): saves new presentation snapshot
              ├── GET  /api/presentations/:id  ← returns single presentation
              ├── PUT  /api/presentations/:id  ← NEW (2026-04-20): edit name/contact/title
              ├── DELETE /api/presentations/:id ← NEW (2026-04-20): delete presentation + deck file
              ├── GET  /view/:id              ← read-only slideshow viewer (auth-protected)
              ├── POST /api/presentations/:id/publish ← PLANNED: GitHub Pages publish
              ├── POST /api/save               → edits slide HTML via Cheerio (old slides)
              ├── POST /api/upload-image        → saves base64 image to uploads/
              ├── POST /api/save-image-src      → updates img src in slide file
              └── POST /api/clone-slide         → copies slide HTML, adds to library+deck
```

---

## presentations.json Structure (NEW 2026-04-12)

```json
{
  "presentations": [
    {
      "id": "pres-001",
      "createdAt": "2026-04-12T14:30:00Z",
      "customerName": "Acme Corp",
      "contactName": "Jane Doe",
      "contactTitle": "VP Sales",
      "slideCount": 14,
      "slides": [
        { "id": "deck-cover", "librarySlideId": "lib-cover", "name": "Cover" },
        { "id": "deck-company", "librarySlideId": "lib-company", "name": "Company" },
        ...
      ]
    }
  ]
}
```

**Note:** Finished presentations are snapshots — deck structure + library slide references recorded at creation time. Slide content still served live from library (editable).

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

**⚠️ IMPORTANT — server.js is the sole source of truth for slides:**
The `.html` files in `builder/features/slides/` and `builder/data/renderers/` are NOT served. Edits to those files have no effect. All slide CSS, HTML structure, and content must be changed inside the render functions in `server.js`. Restart the server after any change.

**Mobile carousel root cause & fix pattern (session 2, 2026-04-11):**
On mobile, `.slide-body` is `height:auto` so carousels with `flex:1` or `height:100%` collapse to 0px (invisible). Fix applied to all slides in `server.js`:
```css
.lsX .slide-body { width:100%; align-items:center; }
.lsX .ls-carousel { min-height:260px !important; height:260px !important; }
@media(min-width:769px) {
  .lsX .ls-carousel { min-height:0 !important; height:100% !important; }
}
```
Additional per-slide fixes:
- **Slide 8**: two-column flex layout — carousel `flex:1` on desktop, explicit height on mobile
- **Slide 12**: `.ls12-diagram-wrap` → `display:flex; flex-direction:column`; spec badges moved inside first carousel slide
- **Slide 14**: `overflow:hidden` removed from slide root so mobile can scroll
- **Slide 4**: vertical column headers (`writing-mode:vertical-rl`) on mobile; proc-grid forced to single column; slide scrollable

**Slide 04 mobile layout:** `.ls4-grid` uses `display:flex; flex-direction:column` on mobile. Tab 1: carousel below table (`order:1`). Tab 2: proc-grid single column (`!important`), cards stacked. Resets to `display:grid` on desktop.

---

## Navigation Structure (updated 2026-04-12)

**Sidebar nav in all pages:** Dashboard | Builder | Settings

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Dashboard | Overview + Finished Presentations list (read-only) |
| `/slides` | Builder | Active editing workspace with Create Presentation modal |
| `/settings` | Settings | Presentation config, branding |
| `/builder/preview.html` | Preview | Full-screen slide viewer |

**Builder (`/slides`) tab structure (updated 2026-04-20):**
- **My Deck tab** (default): 2-col layout (Deck list left | Slide Preview right)
  - Customer Settings section — fields wired to deck personalization (name, title, contact)
  - "Create Presentation" button in Slide Preview header → opens `#createPresentationModal`
  - Preview arrows with prev/next buttons + `N / total` slide counter
  - Slide name displays in subtitle below counter
  - Cover slide shown by default on load
  - Themed scrollbar on `.deck-list-scroll`
- **Slide Manager tab**: My Library + Templates — Add Slide modal with real template picker

**Builder preview (`/builder/preview.html`) header bar (added 2026-04-20):**
- Fixed header: ← Back (history.back), "Builder Preview" title, orange badge, slide counter
- `body { padding-top: 48px }` to prevent slide content hiding under header

**Create Presentation modal:**
- Fields: Company (required), Contact Name, Contact Title
- Calls `POST /api/presentations` with current deck snapshot
- Prepends new presentation to `presentations.json`

**Deck list behavior:** rows with drag-to-reorder, eye toggle, remove. Click slide name → renders preview via `/slides/deck-preview/:id` in right pane.

**`/slides/deck-preview/:id`:** renders deck slide via `renderLayoutToHtml` + wraps in full HTML shell with `style.css` + includes component JS scripts (carousel.js, tabs.js, lightbox.js, list.js, table.js) + runs init block calling `Carousel.init()`, `Tabs.init()`, `Lightbox.init()`, `List.init()`, `LSTable.init()`.

---

## Known Issues / Open Items

- **3-layer CSS conflict** — style.css, per-slide `<style>` blocks, and inline styles conflict. Planned fix: style.css as single source of truth
- **Slide-06 defect names** — selector button labels are JS-generated; needs testing through render path
- **Slide-12 headline split** — agent split `headline` into `headline` + `headline-emphasis` keys; may need consolidation
- **No publish yet** — `POST /api/presentations/:id/publish` not built (needs GITHUB_TOKEN + GITHUB_REPO in .env)
- **dashboard.css** — legacy file, should be deleted
- **Image caption editing** — no UI to edit `img.alt`
- **Builder header reposition** — `.builder-header` may need to move into slide container (task: builder-preview-header-move-to-slide-container)

---

## Session 6 — Completed (2026-04-20)

- Add Slide modal — real template picker replacing stub
- Builder preview nav bar — proper header (title, badge, counter, history.back)
- Builder slide preview default — cover slide shown on load
- Customer Settings — wired to deck personalization
- Edit panel text truncation — fixed
- Slide-06 defect gallery — fixed JS selectors, gallery button, add/delete image, clipping
- Cover slide gallery — fixed overlay clipping (moved to body), prefix normalization, dynamic delete/move buttons
- Edit presentation metadata — inline edit Name/Contact/Position via `PUT /api/presentations/:id`
- Delete presentation — `DELETE /api/presentations/:id` + confirmation
- Viewer cover slide gallery button — exposed in readonly mode
- Viewer carousel autoplay — fixed timing bug in iframe readonly context

---

## What's Next (updated 2026-04-20)

1. **`POST /api/presentations/:id/publish`** — GitHub Pages publish + Publish button on Dashboard ← **main Phase 1 milestone**
2. **Design system refactor** — eliminate CSS conflict; one source of truth in style.css
3. **`scripts/build.js` / `scripts/deploy.js`** — automation scripts
4. Delete old `dashboard.css`
5. Builder header reposition (move to slide container)

