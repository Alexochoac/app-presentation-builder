# Project Map — App Presentation Builder

Last updated: 2026-05-27 (session 20)

---

## Overview

A local web app for building customized sales presentations for Softsolution's LineScanner glass inspection product. Sales reps log in, manage slide decks, customize slides, and publish to GitHub Pages / Cloudflare Pages.

**Status:** Active — Phase 1 in development
**Runs locally at:** `http://localhost:3000`
**Start command:** `cd builder && node server.js`
**Prod URL:** `https://put-a-presentation.wbtm.io` (Docker + Cloudflare Tunnel)
**Flow:** Login → Dashboard → Builder (`/builder`) → Slides (`/slides`) → Settings (`/settings`)

---

## Folder Structure

```
App-presentation-builder/
├── PLAN.md                         ← Full product roadmap + TODO
├── CONTEXT.md                      ← Project context + completed history
├── README.md                       ← Install instructions (Docker + from source)
├── CHANGELOG.md                    ← Release history (Keep a Changelog format)
├── VERSIONS.md                     ← Docker image registry + deploy workflow
├── docker-compose.yml              ← Local/dev compose (builds from source)
├── tasks/                          ← Pending task specs
│   └── done/                       ← Completed task specs
├── prod/                           ← Prod runtime data (gitignored)
│   ├── data/                       ← Prod JSON data (separate from dev)
│   ├── uploads/                    ← Prod uploaded images
│   └── finished-presentations/     ← Prod frozen presentation outputs
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
    │   ├── decks/                  ← Per-deck folders
    │   │   └── [deckId]/
    │   │       ├── deck.json       ← { id, name, slides: [{ id, librarySlideId, visible }] }
    │   │       └── translations.json ← Per-deck translations (see Translation System section)
    │   ├── slide-library.json      ← Library slides catalog + deckEdits per-deck overrides
    │   ├── slide-templates.json    ← Canvas-builder template definitions (id, defaultContent, rows)
    │   ├── templates.json          ← HTML template catalog (TEMPLATE_CATALOG_PATH) — wizard + zone-builder templates
    │   ├── layout-skeletons.json   ← 10 zone-builder layout skeletons (id, name, bodyZone, defaultComponents)
    │   ├── layouts.json            ← User-created layout templates (Slide Builder system)
    │   ├── settings.json           ← App settings: umamiWebsiteId, logos, heroBg, defaultPrimaryColor
    │   ├── presentations.json      ← Finished presentations snapshot history
    │   └── languages.json          ← 103 world languages (ISO 639-1)
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
    │   │   ├── ... (slides 02-24)  ← HTML source fragments; not served directly (server.js is source of truth)
    │   │   ├── uploads/            ← Customer-uploaded images (gitignored)
    │   │   └── components/
    │   │       ├── carousel.js     ← ls-carousel: add/delete/reorder/zoom/autoplay/compare
    │   │       ├── lightbox.js     ← Zoom lightbox + Add Image button
    │   │       ├── tabs.js         ← ls-tabs: add/delete/rename; calls LSTable.init on tab switch
    │   │       ├── list.js         ← ul[data-ls-list]: add/hide/delete/reorder/edit
    │   │       ├── table.js        ← table[data-ls-table]: row+col edit, dot cycling, resizable col
    │   │       ├── button.js       ← auto-attaches Track.click() to .slide-btn
    │   │       ├── tags.js         ← auto-attaches Track.click() to .slide-tag
    │   │       ├── gallery.js      ← image gallery component (new)
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
- Date range dropdown (Last 24h / Last 7 days / Last 30 days / Custom flatpickr) — default **7 days**
- Summary cards: total presentations, total decks, last published
- Publications bar chart (`#viewsChart`, Chart.js 4) — real data from `/api/presentations`
- Presentations multi-select dropdown with search
- **Recent Activity** inside as collapsible subsection (`pb-recentact-collapsed`, default open) — last 10 published

### 3. Engagement Analytics (below Publication Activity, **starts collapsed**)
Full analytics panel with two chart modes and a 4-level drill-down filter hierarchy.

**Filter hierarchy (left to right in filter bar):**
- `#engDeckDropdown` — All Decks → specific deck (filters `#engPresDropdown` to that deck's Live presentations)
- `#engPresDropdown` — All Presentations → specific presentation (multi-select)
- Date range dropdown (same options as Publication Activity) — default 7 days

**State variables (key):**
```js
engMode        // 'pageviews' | 'events'
engEventsMode  // 'popularity' | 'timeseries'  (only relevant when engMode='events')
engDrillSlide  // null | slide-id string (drill into one slide's per-pres breakdown)
engDeckId      // null | deck-id string
engPresIds     // [] = all from current scope; specific IDs = filtered
_engAllLivePres // master list, never filtered — source of truth
_engLivePres   // active list — filtered by deck when engDeckId is set
engYMax        // sticky max: only grows, never shrinks (niceMax() steps: 10,20,50,100,200,500,1000)
```

**`getActivePresIds()` helper** — resolves `engPresIds` in context:
- `engPresIds.length > 0` → return those IDs
- `engDeckId !== null` → return deck's presentation IDs (or `null` if deck has no Live presentations)
- otherwise → return `[]` (server default = all Live)
- Returns `null` → caller renders empty chart without API call

**Chart modes:**
- **Pageviews mode** — bar chart (Chart.js 4), x=date, y=pageviews+sessions overlay. External HTML tooltip (scrollable per-presentation breakdown). Click a bar → enters Events mode.
- **Events mode / Popularity** — horizontal bar chart sorted by event frequency. Click a bar → drills to per-presentation breakdown for that slide.
- **Events mode / Over Time** — line chart per slide, colored, date x-axis. Slide color legend below chart.
- **Back button** — exits drill → exits events → returns to pageviews.
- Single toggle button flips Popularity ↔ Over Time.

**External tooltip (pageviews bar chart):**
- `pointer-events:auto` HTML div, 180ms hide delay, mouseenter on tooltip cancels hide
- Shows date, totals (pageviews orange / sessions blue), scrollable list of all presentations sorted by views desc (max-height 150px overflow-y:auto)

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
- Grid/list view of library slides from `GET /api/slide-library`
- Search, folder filter, sort
- Card actions: gear ⚙ dropdown + 3-dots (⋮) upward dropdown; double-click thumbnail = edit in Slide Builder
- Scaled thumbnails via `GET /slides/library-preview/:id` (always readonly)
- Duplicate (`POST /api/slide-library/:id/duplicate`), Delete (`DELETE /api/slide-library/:id`)
- Pick-mode: "Add to [DeckName]" → `POST /api/deck/slides` → redirects to `/builder`

**Templates tab**
- Filter pills by category (Cover / Content / Visual / Stats / CTA / Data)
- "New Template" button → opens Slide Builder tab
- "Import" button → opens import modal
- **Template Detail View** — full-screen modal: live template preview iframe + theme picker sidebar (~35 colored swatches), slide name input, Create button
  - Picking a theme reloads iframe with `?theme=filename.css`
  - "Create Slide" → `POST /api/library` with `{ templateId, name, themeId }` → server reads `themes/[themeId].css`, stores `styleCss` on the new library slide
- Pick-mode: "Use & Add to [DeckName]" → creates library slide + adds to deck

**Slide Builder tab**
- Top bar: slide name, Desktop/Mobile viewport toggle, "Save as Template" (`POST /api/layouts` or `PUT /api/layouts/:id`), "Save to Library" (`POST /api/library`)
- Split pane: canvas (row/col/component builder) + live preview
- Auto-saves on 800ms debounce when editing existing template

**New Slide Modal** (opens from "My Library" empty state or "+ New Slide"):
- 860px centered popup (not full-screen takeover)
- Shows template picker grid with filter pills
- Footer: "New Template" (→ zone builder), "Import", "Cancel"

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
| GET | `/api/layouts` | List layout templates (canvas builder) |
| POST | `/api/layouts` | Create layout template |
| PUT | `/api/layouts/:id` | Update layout template |
| DELETE | `/api/layouts/:id` | Delete layout |
| GET | `/api/layout-skeletons` | List layout skeletons from `layout-skeletons.json` |
| GET | `/api/templates` | List HTML template catalog (`templates.json`) |
| POST | `/api/templates` | Register HTML template |
| DELETE | `/api/templates/:id` | Deregister template (keeps HTML file) |
| POST | `/api/slide-builder/save` | Save assembled HTML as template to `templates.json`; `{ slideName, savedTemplateId, layoutId, category, html }` → `{ ok, templateId }` |
| GET | `/api/themes` | List all theme files with `{ id, name, file, bgColor, accentColor }` |
| POST | `/api/themes/regenerate` | Regenerate all `.css` theme files from style references |
| GET | `/themes/:file.css` | Serve theme CSS to browser (no auth) |
| GET | `/slides/template-preview/:id` | Render template; `?theme=x.css` injects theme CSS, `?style=x.html` legacy path |

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

### Analytics (Umami proxy + direct Postgres)
| Method | Path | What it does |
|--------|------|-------------|
| GET | `/api/analytics/batch?startAt=&endAt=` | Stats for all presentations in parallel (visitors, visits, pageviews, bounces, totaltime) |
| GET | `/api/analytics/presentation/:id?startAt=&endAt=` | Stats for one presentation by URL `/finished/:id/` |
| GET | `/api/analytics/pageviews-multi?startAt=&endAt=&presIds=` | Time-series pageviews + sessions + per-presentation breakdown; `presIds` CSV optional (omit = all Live) |
| GET | `/api/analytics/events?startAt=&endAt=&presIds=` | Slide event popularity (click counts per slide-id, sorted desc) |
| GET | `/api/analytics/event-series?startAt=&endAt=&slideId=&presIds=` | Time-series events per-day for one slide, grouped by presentation |
| GET | `/api/analytics/slide-events?startAt=&endAt=&slideId=&presId=` | Per-slide event breakdown for one presentation |

**Umami auth pattern:** Server calls `POST /api/auth/login` with `UMAMI_USERNAME` + `UMAMI_PASSWORD` (self-hosted v1 has no API key UI). JWT cached 23h. Results cached 15min. `getUmamiToken(cb)` + `umamiGet(path, cb)` helpers.

**Direct Postgres pattern (for analytics endpoints the Umami API can't filter):** `pg.Pool` reads from `UMAMI_DB_URL`. Queries `website_event` table — `event_type=1` = pageview, `event_type=2` = custom event. Slide events: `event_name LIKE 'slide-%'` from URLs matching `/finished/*/`. `dbPresTimeSeriesWithBreakdown()` runs a single GROUP BY `url_path + day` query and returns `{ pageviews, sessions, breakdown }`.

**`slugToTitle(slug)` helper:** converts `slide-cover-main` → `Cover Main` for display.

### Settings & Translation
| Method | Path | What it does |
|--------|------|-------------|
| GET/POST | `/api/settings` | Read/write `settings.json` |
| GET | `/api/languages` | List 103 languages |
| GET | `/api/translations` | Read active deck's `translations.json` |
| POST | `/api/translations/translate` | Translate per-slide fields via OpenRouter; returns `{ success, data, translated, failed, errors }` |
| POST | `/api/translations/translate-all` | Translate all dirty/missing fields across all deck slides; returns `{ success, data, translated, failed, errors }` |
| PATCH | `/api/translations/field` | Save manual correction for a specific slide field |
| POST | `/api/translations/restore` | Restore previous translation version |
| PUT | `/api/translations/settings` | Update active deck's languages / default |
| GET | `/api/translations/fields-summary` | Return translatable rows for Translation Center (active deck slides only) |

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
    "deckId": "deck-abc123",
    "publishedAt": "2026-04-26T10:00:00Z",
    "archivedAt": null,
    "replacedAt": null
  }]
}
```

**Presentation ID format:** numeric only (`00000001`, `00000002`, …) — `makePresId()`.

---

## Template Lifecycle (conceptual overview)

See [`architecture/template-lifecycle.md`](../../architecture/template-lifecycle.md) for a full plain-language breakdown of how a slide moves through all four stages: Template → Library Slide → Deck Slide → Frozen Presentation. Covers what each stage adds, where data is stored, and how the render chain works.

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
- **Slide CSS:** `builder/features/slides/style.css` — mobile-first (`min-width` breakpoints); holds `:root` default variable values + bridge variables
- **24-variable theme system:** `builder/themes/*.css` — 35 auto-generated theme files (one per style-reference). Each is a `:root {}` block setting all 24 slide variables. Generated by `node builder/generate-themes.js`. Per-slide `styleCss` field stores the theme at create time; `library-preview`, `library-edit`, and `deck-preview` routes inject it into the page `<head>`. **Priority: slide `styleCss` > deck `styleCss`**.
- **24 slide variables:** `--bg`, `--slide-hero-bg`, `--slide-hero-rgb`, `--text`, `--text-muted`, `--accent`, `--accent-rgb`, `--accent-mid`, `--accent-light`, `--font-body`, `--font-heading`, `--hero-overlay-angle/start/end`, `--card-bg`, `--card-border`, `--card-radius`, `--card-shadow`, `--badge-bg/border/radius/color`, `--logo-bg/border/radius`
- **Bridge variables** in `style.css`: `--bg-card: var(--card-bg)`, `--border: var(--card-border)` etc. — old templates respond to theme changes automatically
- **Deck accent CSS** (`deckAccentCss`): deck's `colors.primary` overrides `--accent` + `--accent-rgb`; hero bg color mode injects `--slide-hero-bg` + hides hero image
- **CSS scoping in preview.html:** `scopeDeckCss()` rewrites `:root {}` → `.slides-container {}` before injection to prevent builder UI chrome bleed
- **Known conflict:** 3-layer CSS (style.css vs per-slide `<style>` vs inline) — design system refactor planned

---

## Translation System

**Store:** `builder/data/decks/[deckId]/translations.json` (one file per deck, no global store)
```json
{
  "languages": ["en", "es"],
  "defaultLanguage": "en",
  "slides": {
    "[librarySlideId]": {
      "[fieldKey]": {
        "en": "English text",
        "es": { "current": "Spanish text", "previous": null, "dirty": false }
      }
    }
  }
}
```
- `en` is always a plain string (canonical source)
- Other languages: `{ current, previous, dirty }` — `dirty: true` when English changes after translation exists
- No `fields` section — global field translations were removed; all data is per-slide

**Translator:** `builder/lib/translator.js` — OpenRouter API, `anthropic/claude-haiku-4-5`, 20 fields/chunk, 30s timeout via `AbortSignal.timeout(30000)`. Returns `{ ok, fields, error }`.

**Builder UI:**
- Language switcher in toolbar — switches preview between EN/other; non-English fields stay editable, `focusout` saves typed text directly to per-deck translations
- Translate badge (dirty field count from per-slide data)
- Per-field popover (click any `data-edit` element when in non-EN mode)
- **Translation Settings modal** — add/remove languages; "Open Translation Center" button auto-saves language selection then opens TC
- **Translation Center** — full-screen panel; per-slide/per-field grid; inline editable Spanish textareas; "Translate Missing & Changed" button with per-slide progress bar and failure reporting

**Finished presentations:** `buildFrozenPresentation()` reads translations from `presentation.deckId`'s per-deck file; `bakeLanguageSpans()` wraps `[data-edit]` elements in `<span data-lang="en">` / `<span data-lang="es" hidden="">` sibling spans; `language-switcher.js` inlined into frozen HTML.

**Error handling:** Both translate endpoints return `{ translated: N, failed: M, errors: [...] }`; TC progress bar shows batch failure count; Translation Settings shows inline red error div.

**Open gap:**
- Language re-apply on slide navigate uses fragile `setTimeout(50)` — not yet replaced with reliable slide-ready signal

---

## Known Issues / Open Items

- **3-layer CSS conflict** — style.css, per-slide `<style>` blocks, inline styles. Design system refactor planned
- **Tablet landscape responsive issue** — `Issue-M-2026-04-30-slides-css-responsive-layout-tablet-landscape-image-display.md`
- **dashboard.css** — legacy file, should be deleted
- **Translation — Preview navigate fix** — language re-apply on slide navigate uses `setTimeout(50)`; not yet replaced with reliable slide-ready signal
- **Template update notifications** — when template rows change, library slides don't show an "Update available" badge yet (`Feature-L-2026-05-10-template-update-notifications-diff-and-review-flow.md`)
- **Umami API token** — user's self-hosted Umami is v1 (no API key UI); using username/password auth + direct Postgres for filtered queries. Credentials in `.env` as `UMAMI_USERNAME` + `UMAMI_PASSWORD` + `UMAMI_DB_URL`
- **fpDelete modal** — Finished Presentations delete in builder-ui still uses native `confirm()` instead of proper modal
- **Tabs language switch** — ✅ fixed in v1.1.2: `applyPreviewLang` resets `_lsTabsInit` and re-calls `Tabs.init` after every language switch; `tabs.js` removes duplicate `ls-tab-add` buttons on re-init

---

## Docker & Deployment

- **Dockerfile:** `builder/Dockerfile` — Node 20 Alpine, `npm install --omit=dev`, `node server.js`
- **Dev compose:** `docker-compose.yml` (project root) — builds from source, mounts `builder/data/` + `builder/.../uploads/` + `finished-presentations/`
- **Prod compose:** `C:/Users/Alex/n8n-projects/docker-compose.yml` — `presentation-builder` service using `ghcr.io/alexochoac/app-presentation-builder:latest`, mounts `prod/` folders
- **Image registry:** `ghcr.io/alexochoac/app-presentation-builder` — v1.1.2 + latest published
- **GitHub Release:** `github.com/Alexochoac/app-presentation-builder/releases/tag/v1.0`
- **Prod stack:** `C:/Users/Alex/put-a-presentation/v1.1.0/` — project `put-a-presentation-v1-1-0`; builder on port 3005, umami on 3004, umami-db on 5434
- **Patch release workflow:** build → push to ghcr.io → update `v1.1.0/docker-compose.yml` image tag → `docker compose -p put-a-presentation-v1-1-0 up -d --no-deps --pull always builder`
- **Full release workflow:** documented in `.claude/commands/release.md`

**Volume mounts (prod):**
| Host | Container |
|------|-----------|
| `prod/data/` | `/app/data` |
| `prod/uploads/` | `/app/features/slides/uploads` |
| `prod/finished-presentations/` | `/finished-presentations` |

---

## What's Next

1. **Hero bg color fix** — opacity/color not updating in canvas (`Issue-H-2026-05-17`)
2. **Translation — Preview navigate fix** — replace `setTimeout(50)` with reliable slide-ready signal
3. **Dashboard — Engagement chart filter** — live-only filter, multi-select checkbox dropdown, card image shortcut (`Feature-M-2026-05-22`)
4. **Dashboard — Events chart** — slide popularity + time-series + drill-down sub-events (`Feature-M-2026-05-22`)
5. **fpDelete modal** — replace native `confirm()` with proper modal in builder-ui Finished Presentations
6. **Design system refactor** — eliminate 3-layer CSS conflict (partially addressed by 24-var theme system)
7. **Template update notifications** — "Update available" badge in My Library when template rows change
8. **App UI icons standardise** — minimalist icon set across all pages
9. **Slide 11 tag carousel double-stack** — empty-state CSS flex refactor causes two carousels to stack on tag button click (`Issue-M-2026-05-25`)
