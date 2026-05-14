# Project Map — App Presentation Builder

Last updated: 2026-05-14 (session 15)

---

## Overview

A local web app for building customized sales presentations for Softsolution's LineScanner glass inspection product. Sales reps log in, manage slide decks, customize slides, and publish to GitHub Pages / Cloudflare Pages.

**Status:** Active — Phase 1 in development
**Runs locally at:** `http://localhost:3000`
**Start command:** `cd builder && node server.js`
**Flow:** Login → Dashboard → Builder (`/builder`) → Slides (`/slides`) → Settings (`/settings`)

---

## Folder Structure

```
App-presentation-builder/
├── PLAN.md                         ← Full product roadmap + TODO
├── CONTEXT.md                      ← Project context + completed history
├── tasks/                          ← Pending task specs
│   └── done/                       ← Completed task specs
├── scripts/
│   ├── build.js                    ← CLI to rebuild frozen presentations (no server needed)
│   └── deploy.js                   ← git add→commit→push for one or all presentations
├── finished-presentations/         ← Self-contained frozen presentation outputs
│   ├── [presId]/
│   │   └── index.html              ← Frozen output (CSS+JS inlined, images via ../shared/)
│   └── shared/                     ← Deduplicated image pool
│
└── builder/                        ← The runnable web app
    ├── server.js                   ← Express server — ALL API endpoints + slide render functions
    │                                 ⚠️ SOLE SOURCE OF TRUTH FOR SLIDES
    ├── package.json
    ├── lib/
    │   └── translator.js           ← OpenRouter API translation; translate(fields, lang) → { ok, fields, error }
    ├── .env                        ← SESSION_SECRET, BUILDER_USER, BUILDER_PASS, OPENROUTER_API_KEY,
    │                                 UMAMI_USERNAME, UMAMI_PASSWORD, UMAMI_BASE_URL (not in git)
    ├── data/
    │   ├── decks.json              ← Deck registry: { decks: [{ id, name, logo, heroBg, theme, colors, ... }], activeDeckId }
    │   ├── decks/                  ← Per-deck folders: decks/[deckId]/deck.json
    │   │   └── [deckId]/deck.json  ← { id, name, slides: [{ id, librarySlideId, visible }] }
    │   ├── slide-library.json      ← Library slides catalog + deckEdits per-deck overrides
    │   ├── slide-templates.json    ← Template definitions (id, defaultContent, rows for new system)
    │   ├── layouts.json            ← User-created layout templates (Slide Builder system)
    │   ├── settings.json           ← App settings: umamiWebsiteId, logos, heroBg, defaultPrimaryColor
    │   ├── presentations.json      ← Finished presentations snapshot history
    │   ├── languages.json          ← 103 world languages (ISO 639-1)
    │   └── translations.json       ← Per-deck translation store
    ├── features/
    │   ├── auth/
    │   │   ├── auth.js             ← Session auth middleware + login/logout routes
    │   │   └── login.html          ← Login page
    │   ├── dashboard/
    │   │   └── index.html          ← Dashboard (served at /) — see Dashboard section below
    │   ├── builder-ui/
    │   │   ├── index.html          ← Builder section (/builder) — 3-zone layout, deck manager
    │   │   └── preview.html        ← Legacy full-screen slide viewer (still in use)
    │   ├── slides/
    │   │   ├── index.html          ← Slides section (/slides) — 3-tab: My Library / Templates / Slide Builder
    │   │   ├── style.css           ← Shared slide CSS (mobile-first, all slides)
    │   │   ├── slide-01-cover.html ← Original HTML fragments (source of truth for content structure)
    │   │   ├── ... (slides 02-15)
    │   │   ├── uploads/            ← Customer-uploaded images (gitignored)
    │   │   └── components/
    │   │       ├── carousel.js     ← ls-carousel: add/delete/reorder/zoom/autoplay/compare
    │   │       ├── lightbox.js     ← Zoom lightbox + Add Image button
    │   │       ├── tabs.js         ← ls-tabs: add/delete/rename; calls LSTable.init on tab switch
    │   │       ├── list.js         ← ul[data-ls-list]: add/hide/delete/reorder/edit
    │   │       ├── table.js        ← table[data-ls-table]: row+col edit, dot cycling, resizable col
    │   │       ├── button.js       ← auto-attaches Track.click() to .slide-btn
    │   │       ├── tags.js         ← auto-attaches Track.click() to .slide-tag
    │   │       ├── language-switcher.js ← client-side lang switcher for finished presentations
    │   │       └── tracker.js      ← Umami analytics tracker
    │   ├── layouts/
    │   │   └── index.html          ← Redirects to /slides
    │   ├── presentation-view/
    │   │   └── index.html          ← Read-only viewer fallback (when no frozen file exists)
    │   └── settings/
    │       └── index.html          ← Settings (/settings) — global only (app appearance, new deck defaults)
    └── shared/
        ├── app-style.css           ← Shared app shell CSS (dark/light theme, CSS vars)
        └── assets/                 ← Brand logos (served at /slides/shared/)
```

---

## Navigation (current — 4 sidebar links)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Dashboard | Analytics overview + Finished Presentations CRUD |
| `/builder` | Builder | 3-zone layout: deck list + slide panel + main canvas |
| `/slides` | Slides | 3-tab: My Library / Templates / Slide Builder |
| `/settings` | Settings | Global app settings only |

`/layouts` redirects to `/slides`.

---

## Dashboard (`builder/features/dashboard/index.html`)

Three panels stacked vertically:

### 1. Finished Presentations (top)
- Filter bar: search (name + customer), flatpickr date range, sort dropdown (Newest / Oldest / Name A–Z)
- Grid/List toggle in panel header — state saved to `localStorage` `pb-fp-view`
- Paginated list (10/page) — each card shows: name, customer · slide count, relative time, **Umami metrics strip** (visitors / views / bounce rate / avg duration — loaded via `/api/analytics/batch` after render)
- Actions per card: **View** (`/view/:id`), **Re-publish** (`POST /api/presentations/:id/publish`), **Delete** (archive → hard delete)

### 2. Publication Activity (below FP, **starts collapsed**)
- Collapse toggle (`#pubActHeader` / `#pubActBody`), state saved to `pb-pubact-collapsed` (default `'1'` = collapsed)
- Date range dropdown (7d / 24h / 30d / Custom flatpickr)
- Summary cards: total presentations, total decks, last published
- Publications bar chart (`#viewsChart`, Chart.js 4) — real data from `/api/presentations`
- Presentations multi-select dropdown with search
- **Engagement chart** (`#engagementChart`) — Umami pageviews + visitors line chart, lazy-loaded on panel open via `/api/analytics/pageviews`
- **Recent Activity** inside as collapsible subsection (`pb-recentact-collapsed`, default open) — last 10 published

### Key CSS notes
- `.panel` has `overflow:hidden` in `app-style.css` — date dropdowns use `overflow:visible` inline to escape
- Grid mode: `.fp-list.fp-grid-mode` uses CSS grid `auto-fill minmax(240px,1fr)`

---

## Builder (`builder/features/builder-ui/index.html`)

Three-zone layout:

| Zone | Width | Content |
|------|-------|---------|
| Left sidebar | 280px | Deck list (from `GET /api/decks`), active deck set via `POST /api/decks/active`, rename/duplicate/delete/settings per deck |
| Slide panel | bottom strip | 112×63px thumbnail iframes, drag-to-reorder (HTML5 drag API → `PUT /api/deck`), eye toggle, remove, "+ Add Slide" → opens `/slides?mode=pick` |
| Main canvas | fills remaining | 1920×1080 iframe scaled to fit, inline editing ON, auto-saves via `POST /api/deck/slides/:id/edits` |

**Deck Settings drawer** (340px right slide-in):
- Opens via ⚙ icon or deck `⋯` menu → "Deck Settings"
- Fields: Deck Name, Dark/Light theme toggle, Primary Color picker, Logo upload/remove, Hero Background upload/remove + focal point grid
- Auto-saves to `PUT /api/decks/:id`
- Logo: `POST /api/decks/:id/upload-logo`
- Hero bg: `POST /api/decks/:id/upload-hero-bg`

**Finished presentations strip** (collapsible, inside builder):
- Lists presentations filtered by current deck
- Publish button → save modal → `POST /api/presentations`

---

## Slides Section (`builder/features/slides/index.html`)

Three top-level tabs:

**My Library tab**
- Grid of library slides from `GET /api/slide-library`
- Scaled thumbnails via `GET /slides/library-preview/:id` (always readonly)
- Actions: Edit (opens Slide Builder tab), Duplicate (`POST /api/slide-library/:id/duplicate`), Delete (`DELETE /api/slide-library/:id`)
- Pick-mode: "Add to [DeckName]" → `POST /api/deck/slides` → redirects to `/builder`

**Templates tab**
- Filter pills by category (Cover / Content / Visual / Metrics / Data / CTA)
- "Use Template" → name modal → creates library slide
- "Edit Template" → opens Slide Builder tab with template rows pre-loaded
- Pick-mode: "Use & Add to [DeckName]" → creates library slide + adds to deck

**Slide Builder tab**
- Top bar: slide name, Desktop/Mobile viewport toggle, "Save as Template" (`POST /api/layouts` or `PUT /api/layouts/:id`), "Save to Library" (`POST /api/library`)
- Split pane: canvas (row/col/component builder) + live preview
- Auto-saves on 800ms debounce when editing existing template

---

## Settings (`builder/features/settings/index.html`)

Global-only settings (per-deck settings moved to Builder deck drawer):
- App Appearance: dark/light builder UI toggle
- New Deck Defaults: default theme + primary color (`/api/settings`)
- App Language: Coming Soon
- Account: Coming Soon
- Integrations: Coming Soon

---

## API Endpoints (`server.js`)

### Decks
| Method | Path | What it does |
|--------|------|-------------|
| GET | `/api/decks` | List all decks from `decks.json` |
| POST | `/api/decks` | Create new deck |
| POST | `/api/decks/active` | Set active deck |
| GET | `/api/deck` | Get active deck slides |
| PUT | `/api/deck` | Reorder/update deck slides |
| PUT | `/api/decks/:id` | Update deck metadata (name, theme, colors, heroBgFocalGrid) |
| DELETE | `/api/decks/:id` | Delete deck |
| POST | `/api/decks/:id/upload-logo` | Upload deck logo |
| POST | `/api/decks/:id/upload-hero-bg` | Upload deck hero background |
| POST | `/api/deck/slides` | Add slide to active deck |
| POST | `/api/deck/slides/:id/edits` | Save edits to a deck slide |
| DELETE | `/api/deck/slides/:id` | Remove slide from deck |

### Slide Library
| Method | Path | What it does |
|--------|------|-------------|
| GET | `/api/slide-library` | List all library slides |
| POST | `/api/library` | Create library slide |
| DELETE | `/api/slide-library/:id` | Delete library slide |
| POST | `/api/slide-library/:id/duplicate` | Duplicate with "(Copy)" suffix |
| GET | `/slides/library-preview/:id` | Render library slide as read-only HTML |
| GET | `/slides/deck-preview/:id` | Render deck slide + full HTML shell |

### Layouts / Templates
| Method | Path | What it does |
|--------|------|-------------|
| GET | `/api/layouts` | List layout templates |
| POST | `/api/layouts` | Create layout template |
| PUT | `/api/layouts/:id` | Update layout template |
| DELETE | `/api/layouts/:id` | Delete layout |

### Presentations
| Method | Path | What it does |
|--------|------|-------------|
| GET | `/api/presentations` | List all finished presentations |
| POST | `/api/presentations` | Save new presentation snapshot (runs `buildFrozenPresentation`) |
| GET | `/api/presentations/:id` | Get single presentation |
| PUT | `/api/presentations/:id` | Update metadata |
| DELETE | `/api/presentations/:id` | Hard delete (requires `archivedAt` first) |
| POST | `/api/presentations/:id/archive` | Soft delete (sets `archivedAt`) |
| POST | `/api/presentations/:id/unarchive` | Restore from archive |
| POST | `/api/presentations/:id/duplicate` | Clone with new customer info |
| POST | `/api/presentations/:id/publish` | git add→commit→push; returns `{ success, url, alreadyPublished }` |
| POST | `/api/presentations/rebuild-all` | Regenerate all frozen HTML files |
| GET | `/finished/:presId/` | Static: serves frozen output |
| GET | `/view/:id` | Redirect to `/finished/:id/` if frozen exists; else live viewer |

### Analytics (Umami proxy)
| Method | Path | What it does |
|--------|------|-------------|
| GET | `/api/analytics/batch?startAt=&endAt=` | Stats for all presentations in parallel (visitors, visits, pageviews, bounces, totaltime) |
| GET | `/api/analytics/presentation/:id?startAt=&endAt=` | Stats for one presentation by URL `/finished/:id/` |
| GET | `/api/analytics/pageviews?startAt=&endAt=&presId=` | Time-series pageviews + sessions for engagement chart |

**Umami auth pattern:** Server calls `POST /api/auth/login` with `UMAMI_USERNAME` + `UMAMI_PASSWORD` (self-hosted v1 has no API key UI). JWT cached 23h. Results cached 15min. `getUmamiToken(cb)` + `umamiGet(path, cb)` helpers.

### Settings & Translation
| Method | Path | What it does |
|--------|------|-------------|
| GET/POST | `/api/settings` | Read/write `settings.json` |
| GET | `/api/languages` | List 103 languages |
| GET | `/api/translations` | Read `translations.json` |
| POST | `/api/translations/translate` | Translate dirty fields via OpenRouter (20 fields/chunk) |
| PATCH | `/api/translations/field` | Save manual correction |
| POST | `/api/translations/restore` | Restore previous translation version |
| PUT | `/api/translations/settings` | Update deck languages / default |

---

## Data Models

### `decks.json`
```json
{
  "decks": [{
    "id": "deck-abc123",
    "name": "GlassQuality Demo",
    "logo": "/slides/uploads/logo.png",
    "heroBg": "/slides/uploads/hero.jpeg",
    "heroBgFocal": "25% 75%",
    "heroBgFocalGrid": 5,
    "theme": "dark",
    "colors": { "primary": "#F5A623" }
  }],
  "activeDeckId": "deck-abc123"
}
```

### `decks/[deckId]/deck.json`
```json
{
  "id": "deck-abc123",
  "name": "GlassQuality Demo",
  "slides": [
    { "id": "deck-lib-cover-xxx", "librarySlideId": "lib-cover", "visible": true }
  ]
}
```

### `presentations.json`
```json
{
  "presentations": [{
    "id": "00000001",
    "createdAt": "2026-04-12",
    "presentationName": "Q2 Demo",
    "customerName": "Acme Corp",
    "contactName": "Jane Doe",
    "contactTitle": "VP Sales",
    "customerLogoSrc": "/slides/uploads/logo.png",
    "slideCount": 3,
    "slides": [{ "id": "...", "librarySlideId": "lib-cover", "name": "Cover", "visible": true }],
    "publishedAt": "2026-04-26T10:00:00Z",
    "archivedAt": null,
    "replacedAt": null
  }]
}
```

**Presentation ID format:** numeric only (`00000001`, `00000002`, …) — `makePresId()`.

---

## Template → Library → Deck Render Chain

```
slide-templates.json  →  slide-library.json  →  decks/[id]/deck.json
  (tpl-new-cover)          (lib-cover)           slides[].librarySlideId
  defaultContent            edits: {}
```

`GET /slides/deck-preview/:id` → looks up deck slide → library slide → template → calls `renderLayoutToHtml(tpl, deckSlideId, savedEdits)` → dispatches to render function → returns full HTML page with component JS.

**⚠️ server.js is the SOLE source of truth for slide structure.** The `.html` files in `features/slides/` are not served — they are reference only. All slide changes must go into render functions in `server.js`.

---

## Slide Render Functions (14 active)

| Template ID | Render Function |
|-------------|----------------|
| tpl-new-cover | renderHeroLayout |
| tpl-new-company | renderCompanyLayout |
| tpl-new-comparison | renderComparisonLayout |
| tpl-new-capability-matrix | renderCapabilityLayout |
| tpl-new-technology | renderTechnologyLayout |
| tpl-new-defect-gallery | renderDefectGalleryLayout |
| tpl-new-carousel-cards | renderCarouselCardsLayout |
| tpl-new-checklist-carousel | renderChecklistCarouselLayout |
| tpl-new-carousel-tags | renderCarouselTagsLayout |
| tpl-new-tabs-carousel | renderTabsCarouselLayout |
| tpl-new-carousel-steps | renderCarouselStepsLayout |
| tpl-new-full-carousel | renderFullCarouselLayout |
| tpl-new-cards-grid | renderCardsGridLayout |
| tpl-new-cta | renderCtaLayout |

---

## Style System

- **App shell:** `builder/shared/app-style.css` — Apple Keynote aesthetic, dark/light via `data-theme` on `<html>`, persisted as `pb-theme`
- **CSS variables:** `--border`, `--border-hov`, `--surface`, `--surface-hov`, `--bg`, `--muted`, `--dim`, `--text`, `--accent`, `--accent-dim`, `--accent-glow`, `--radius-btn`, `--radius-card`, `--sidebar-w` (220px), `--sidebar-collapsed-w` (64px), `--font`, `--input-bg`, `--nav-active`, `--topbar-bg`, `--remove-hov-fg`, `--remove-hov-bg`
- **Slide CSS:** `builder/features/slides/style.css` — mobile-first (`min-width` breakpoints)
- **Known conflict:** 3-layer CSS (style.css vs per-slide `<style>` vs inline) — design system refactor planned

---

## Translation System

**Store:** `builder/data/translations.json`
- `en` is canonical (plain string); other languages have `{ current, previous, dirty }`
- `dirty: true` set when English changes after a translation exists

**Translator:** `builder/lib/translator.js` — OpenRouter API, `anthropic/claude-haiku-4-5`, 20 fields/chunk

**Builder UI:** Language switcher in toolbar, Translate badge (dirty field count), per-field popover, Translation Settings modal

**Known gaps:**
- Finished presentation has no language switcher yet (baking deferred — task `Feature-H-...-bake-language-spans`)
- Badge overcounts image/non-text fields
- Dirty flag not hooked into library slide edits
- Language re-apply on slide navigate uses fragile `setTimeout(50)`

---

## Known Issues / Open Items

- **3-layer CSS conflict** — style.css, per-slide `<style>` blocks, inline styles. Design system refactor planned
- **Tablet landscape responsive issue** — `Issue-M-2026-04-30-slides-css-responsive-layout-tablet-landscape-image-display.md`
- **dashboard.css** — legacy file, should be deleted
- **Translation gaps** — see Translation section above
- **Template update notifications** — when template rows change, library slides don't show an "Update available" badge yet (`Feature-L-2026-05-10-template-update-notifications-diff-and-review-flow.md`)
- **Umami API token** — user's self-hosted Umami is v1 (no API key UI); using username/password auth. Credentials in `.env` as `UMAMI_USERNAME` + `UMAMI_PASSWORD`

---

## What's Next

1. **Translation — Finished presentation baking** — `[data-lang]` spans + inject `language-switcher.js` at Create time
2. **Translation — Badge overcount fix** — skip non-text fields from badge count
3. **Translation — Dirty flag for library slides** — hook into `POST /api/deck/slides/:id/edits`
4. **Translation — Preview navigate fix** — replace `setTimeout(50)` with reliable slide-ready signal
5. **Template update notifications** — "Update available" badge in My Library when template rows change
6. **Design system refactor** — eliminate 3-layer CSS conflict
7. Delete old `dashboard.css`
8. **App UI icons standardise** — minimalist icon set across all pages
