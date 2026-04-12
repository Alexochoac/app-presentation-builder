# Sessions

## 2026-04-12 — UI Refactor: Dashboard / Builder / Slides separation

### Accomplished
- **Architecture planned**: separated Dashboard (overview), Builder (active editing), Slides (management) into distinct sections with clear mental model
- **Dashboard cleaned up**: removed Slide Library panel, Your Presentation panel, and Customer Settings — now shows only "Finished Presentations" skeleton; nav reduced to Dashboard | Builder | Settings
- **Builder section restructured** (`/slides` route):
  - Page renamed "Builder" with two top-level tabs: **My Deck** and **Slide Manager**
  - My Deck tab: 2-col layout (Your Presentation deck left, Slide Preview right), Customer Settings below
  - Slide Manager tab: My Library + Templates (slide management, no deck editing)
  - Deck list now uses row style with drag handle, drag-and-drop reorder, eye toggle, remove — matching old dashboard style
  - Click on slide name → renders preview in right pane via new `/slides/deck-preview/:id` route
  - Fixed card height: both panels fixed at 420px, deck list scrolls inside
- **New server route**: `GET /slides/deck-preview/:id` — renders deck slide via `renderLayoutToHtml` and wraps in full HTML shell with `/slides/style.css` (fixes missing styles in preview iframe)
- **Nav synced** across all 4 pages: `settings/index.html`, `layouts/index.html`, `slides/index.html`, `dashboard/index.html`
- **Deck loads on page open**: added `renderDeckList()` call inside `loadLibrary()` init so deck is populated on first load

### Pending
- Finished Presentations: wire up real data + link to read-only preview
- Add Slide modal (+ Add Slide button is a stub calling openNewSlideModal for now)
- Customer Settings: wire fields to actual deck personalization
- Slide-06 defect gallery: verify JS works through render path
- Design system refactor (carried)
- `scripts/build.js` and `scripts/deploy.js`

---

## 2026-04-11 — Mobile carousel fixes across all slides

### Accomplished
- **Root cause identified**: on mobile, `.slide-body` is `height:auto` so carousels with `flex:1` or `height:100%` collapse to 0px — invisible
- **Fix pattern established**: add `.lsX .slide-body { width:100%; align-items:center; }` + `.lsX .ls-carousel { min-height:260px !important; height:260px !important; }` scoped per slide; override to `height:100%` at desktop breakpoint
- **Critical discovery**: all fixes must go in `server.js` render functions — the `.html` files and `builder/data/renderers/` are NOT served; `server.js` is the single source of truth
- **All slides fixed** (6, 7, 8, 9, 10, 11, 12, 14 + 2, 4, 5)

### Pending
- Slide-06 defect gallery: verify JS defect selector works through render path
- Design system refactor (carried)
- `scripts/build.js` and `scripts/deploy.js`
- Presentation view (read-only mode)
- Delete old `dashboard.css`

---

## 2026-04-11 — Server-side render functions for all 14 slides

### Accomplished
- **All 14 slides** now have dedicated server-side render functions wired in `renderLayoutToHtml`
- **table.js save fix**: `saveTable` detects when table is inside `.ls-tabs[data-edit]` — fixes column-hide persistence
- **tabs.js fix**: `switchTo` calls `LSTable.init(activePanel)` on tab switch
- **Slide 04 mobile fix**: carousel moved above table on mobile using `order:-1`

### Pending
- Test each slide visually against originals
- Slide-06 defect selector JS
- Design system refactor (carried)
- `scripts/build.js` and `scripts/deploy.js`
