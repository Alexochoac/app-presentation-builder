# Session Handoff — 2026-05-10

## What This Session Did

We executed a large UI restructure of the App Presentation Builder — a local Node.js/Express app
with vanilla HTML/CSS/JS, file-based JSON storage. No framework, no build step.

---

## Tasks Completed

### Task 1 — Nav + section restructure ✅
**File:** `Feature-H-2026-05-10-nav-merge-builder-decks-restructure-sections.md`

- All 5 nav pages updated to a flat 4-link sidebar: Dashboard `/`, Builder `/builder`, Slides `/slides`, Settings `/settings`
- `/layouts` route now redirects to `/slides` (in `server.js`)
- "Finished Presentations" panel removed from `dashboard/index.html`
- Dashboard keeps only the Views Overview chart + a minimal fetch-and-dispatch IIFE so Chart.js still works

### Task 2 — Builder section full rewrite ✅
**File:** `Feature-H-2026-05-10-builder-full-screen-deck-preview-slide-panel-reorder.md`

`builder/features/builder-ui/index.html` completely rewritten as a 3-zone layout:
- **Left sidebar (280px)** — deck list from `GET /api/decks`, click to set active via `POST /api/decks/active`, rename/duplicate/delete per deck
- **Slide panel (bottom strip)** — 112×63px thumbnail iframes, drag-to-reorder (HTML5 drag API → `PUT /api/deck`), eye toggle (`visible` flag), remove button, "+ Add Slide" opens pick-mode
- **Main canvas** — 1920×1080 iframe scaled to fill available space (`Math.min(availW/1920, availH/1080)`), inline editing ON, auto-saves via `POST /api/deck/slides/:id/edits`
- **Finished presentations strip** — collapsible, loads `GET /api/presentations` filtered by deck, publish button triggers save modal → `POST /api/presentations`
- The "+ Add Slide" button now calls `openPickMode()` which builds `/slides?mode=pick&deck=<id>&deckName=<name>`

One item still not wired: "Edit in Slide Editor" button from canvas header (noted in task file).

### Task 3 — Slides section three-tab restructure ✅
**File:** `Feature-H-2026-05-10-slides-section-my-library-templates-slide-builder-tabs.md`

`builder/features/slides/index.html` fully rewritten with three top-level tabs:

**My Library tab**
- Grid of library slides from `GET /api/slide-library`
- Each card: scaled thumbnail iframe (via new `GET /slides/library-preview/:id` endpoint), editable name, template origin
- Actions: Edit (opens Slide Builder tab with template rows), Duplicate (`POST /api/slide-library/:id/duplicate`), Delete (`DELETE /api/slide-library/:id`)
- Pick-mode: shows "Add to [DeckName]" button → `POST /api/deck/slides` → redirects to `/builder`

**Templates tab**
- Filter pills by category (new/all/Cover/Content/Visual/Metrics/Data/CTA)
- Template cards with mini layout preview diagram
- "Use Template" → opens name modal → creates library slide → adds to My Library
- "Edit Template" → opens Slide Builder tab with that template's rows pre-loaded
- Pick-mode: "Use & Add to [DeckName]" → creates library slide + adds to deck → redirects

**Slide Builder tab**
- Inline (not full-screen overlay) — embedded in the tab panel
- Top bar: slide name input, Desktop/Mobile viewport toggle, "Save as Template" (`POST /api/layouts` or `PUT /api/layouts/:id`), "Save to Library" (`POST /api/library`), save status
- Split pane: canvas (left, row/col/component builder) + live preview (right, desktop or mobile phone frame)
- Auto-saves template edits on debounce (800ms) when editing an existing template

**New server endpoints added in Task 3:**
- `GET /slides/library-preview/:id` — renders a library slide as read-only HTML (no deck context needed)
- `POST /api/slide-library/:id/duplicate` — duplicates a library slide with "(Copy)" suffix

### Task 4 — Settings split (global vs per-deck) ✅
**File:** `Feature-H-2026-05-10-settings-split-global-vs-per-deck.md`

`builder/features/settings/index.html` stripped to global-only settings:
- **Removed:** Presentation Name section, Logo section, Hero Background section, old Theme/Branding section
- **Now contains:** App Appearance (builder UI dark/light toggle), New Deck Defaults (default theme + primary color, saved to `/api/settings`), App Language (Coming Soon), Account (Coming Soon), Integrations (Coming Soon)

Per-deck settings **drawer** added to `builder/features/builder-ui/index.html`:
- Gear icon (⚙) appears on the active deck row in the left sidebar
- "Deck Settings" added to every deck's 3-dot dropdown menu
- Right-side slide-in drawer (340px, `translateX` transition) with: Deck Name (saves on blur/Enter), Dark/Light theme toggle, Primary Color picker (debounced 600ms), Logo upload/remove, Hero Background upload/remove + focal point grid (3×3 by default, configurable)
- All changes auto-save to `PUT /api/decks/:id`
- Logo: `POST /api/decks/:id/upload-logo` (existing)
- Hero bg: `POST /api/decks/:id/upload-hero-bg` (new endpoint added)

**New server endpoints added in Task 4:**
- `POST /api/decks/:id/upload-hero-bg` — same pattern as upload-logo, saves to `deck.heroBg`
- `heroBgFocalGrid` added to allowed fields in `PUT /api/decks/:id`

### Task 5 — Slide Builder enhancements ✅
**File:** `Feature-M-2026-05-10-slide-builder-component-palette-canvas-mobile-preview.md`

All changes in `builder/features/slides/index.html`:

**Expanded component palette (10 types, grouped):**
- Replaced flat `COMPONENT_TYPES` with `COMPONENT_GROUPS` — two sections: Content (Title, Text Block, List, Section Label, Stat Block) and Interactive (Tabs, Carousel, Button, Image, Matrix)
- Picker now shows group headers + description line per component

**Functional row drag-to-reorder:**
- Every canvas row is `draggable="true"`
- HTML5 `dragstart/dragover/drop/dragend` events reorder `currentLayout.rows` in place, re-render canvas + preview, schedule save

**Preview popup:**
- "Preview" button in builder top bar opens a full-screen popup overlay
- Three viewport tabs: Desktop (16:9 CSS frame), Tablet (768px 4:3 frame), Mobile (375px phone frame)
- Renders the same CSS-based mock-up at each size
- Backdrop click or ✕ closes

**New preview renderers:** Image (placeholder icon), Stat Block (large number + label), Section Label (uppercase bordered label), Matrix (same as Table)

---

## Architecture Reference

### Tech stack
- Node.js + Express, `builder/server.js`
- Vanilla HTML/CSS/JS — no framework, no build step
- File-based storage: `builder/data/*.json`

### Key files
| File | Purpose |
|------|---------|
| `builder/server.js` | All routes and APIs |
| `builder/features/builder-ui/index.html` | Builder section (Tasks 2 + 4) |
| `builder/features/slides/index.html` | Slides section (Tasks 3 + 5) |
| `builder/features/dashboard/index.html` | Dashboard (Task 1, Task 7 pending) |
| `builder/features/settings/index.html` | Settings (Task 4) |
| `builder/shared/app-style.css` | Global CSS variables + shared components |

### CSS variables (from `app-style.css`)
`--border`, `--border-hov`, `--surface`, `--surface-hov`, `--bg`, `--muted`, `--dim`, `--text`, `--accent`, `--accent-dim`, `--accent-glow`, `--radius-btn`, `--radius-card`, `--sidebar-w` (220px), `--sidebar-collapsed-w` (64px), `--font`, `--input-bg`, `--nav-active`, `--topbar-bg`, `--remove-hov-fg`, `--remove-hov-bg`

### Data model
- `builder/data/presentations.json` — finished presentations
- `builder/data/slide-library.json` — library slides (`{ slides: [{ id, name, templateId, edits: {} }] }`)
- `builder/data/slide-library.json` also stores `deckEdits: { [deckId]: { [fieldKey]: value } }` for per-deck overrides
- `builder/data/decks/` — per-deck folders, each with `deck.json` (`{ id, name, slides: [{ id, librarySlideId, visible }] }`)
- `builder/data/decks.json` — deck registry (`{ decks: [{ id, name, logo, heroBg, heroBgFocal, heroBgFocalGrid, theme, colors }], activeDeckId }`)
- `builder/data/translations.json` — translation data
- `builder/data/layouts.json` — layout templates (slide structure / rows)

### Slide rendering pipeline
1. `GET /slides/deck-preview/:id` — takes a deck slide ID, looks up library slide + template, calls `renderLayoutToHtml()`, wraps in full HTML page. Add `?readonly=1` to strip contenteditable.
2. `GET /slides/library-preview/:id` — same but takes library slide ID directly, always readonly.
3. `renderLayoutToHtml(tpl, slideId, edits)` — in `server.js`, assembles the slide HTML from template rows + edit overrides.

### Sidebar collapse
`.app-body` uses `margin-left: var(--sidebar-w)`. When sidebar collapses, `.app-body.sidebar-collapsed` switches to `margin-left: var(--sidebar-collapsed-w)`. Builder page overrides this with `display: flex` on `.builder-app`.

---

## Remaining Tasks

### Task 6 — Template update notifications (LOW) ← START HERE
**File:** `Feature-L-2026-05-10-template-update-notifications-diff-and-review-flow.md`
**Status:** pending

When a template's structure (rows/cols/components) changes, library slides based on it should show an "Update available" badge in My Library tab. Clicking it opens a diff/review flow where the user can accept or dismiss the update.

### Task 7 — Dashboard analytics real data (LOW)
**File:** `Feature-L-2026-05-10-dashboard-repurpose-as-analytics-only.md`
**Status:** pending

Connect the Chart.js bar chart to real data from `GET /api/presentations`. Add summary cards (total presentations, total decks, last published). Add a recent activity list. Expand the chart panel to full width.

---

## Open Issue (not yet worked)
**File:** `Issue-M-2026-04-30-slides-css-responsive-layout-tablet-landscape-image-display.md`
Medium priority — responsive CSS issue on tablet landscape. Not investigated yet.

---

## Prompt for Next Session

Paste this into a new Claude session:

---

> We are continuing a UI restructure of the **App Presentation Builder** project at:
> `C:\Users\Alex\Alex-Projects\active\App-presentation-builder`
>
> It is a local Node.js/Express app with vanilla HTML/CSS/JS, file-based JSON storage, no framework or build step.
>
> **Tasks 1–5 are done** (nav restructure, Builder full rewrite, Slides 3-tab restructure, Settings split global/per-deck, Slide Builder palette + drag + preview popup).
> Read the full handoff at: `tasks/SESSION-HANDOFF-2026-05-10.md`
>
> **Two tasks remain:**
>
> **Task 6** — Read the spec at `tasks/Feature-L-2026-05-10-template-update-notifications-diff-and-review-flow.md`
> When a template's row/col/component structure changes, library slides based on it should show an "Update available" badge in the My Library tab of `builder/features/slides/index.html`. Clicking the badge opens a side-by-side diff or review flow where the user can accept (apply the new structure) or dismiss. The badge state should be computed by comparing the template's current `rows` hash against a stored `templateVersion` on each library slide.
>
> **Task 7** — Read the spec at `tasks/Feature-L-2026-05-10-dashboard-repurpose-as-analytics-only.md`
> In `builder/features/dashboard/index.html`, connect the existing Chart.js bar chart to real data from `GET /api/presentations`. Add 3 summary cards at the top: total presentations published, total decks, and date of last publish. Add a recent activity list below the chart (last 5 finished presentations). Expand the chart panel to full width.
>
> Go one task at a time and wait for approval before moving to the next.
