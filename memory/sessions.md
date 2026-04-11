# Sessions

## 2026-04-11 — Mobile carousel fixes across all slides

### Accomplished
- **Root cause identified**: on mobile, `.slide-body` is `height:auto` so carousels with `flex:1` or `height:100%` collapse to 0px — invisible
- **Fix pattern established**: add `.lsX .slide-body { width:100%; align-items:center; }` + `.lsX .ls-carousel { min-height:260px !important; height:260px !important; }` scoped per slide; override to `height:100%` at desktop breakpoint
- **Critical discovery**: all fixes must go in `server.js` render functions — the `.html` files and `builder/data/renderers/` are NOT served; `server.js` is the single source of truth
- **All slides fixed** (6, 7, 8, 9, 10, 11, 12, 14 + 2, 4, 5):
  - Slides 6, 7, 9, 11: direct flex carousel — `min-height` fix applied
  - Slide 8: two-column flex layout (text left, carousel right) — `width:100%` on slide-body, `flex:1` on carousel desktop
  - Slide 10: carousels inside tabs — same `min-height` pattern
  - Slide 12: `.ls12-diagram-wrap` was `display:block` — changed to `display:flex; flex-direction:column`; badges moved inside first carousel slide so they don't float over all images
  - Slide 14: `overflow:hidden` on slide root blocked mobile scroll — removed
  - Slide 2: company carousel in tabs panel — same `min-height` fix
  - Slide 4: vertical column headers on mobile (`writing-mode:vertical-rl`); tab 2 proc-grid forced to single column with `!important`; slide scrollable on mobile
  - Slide 5: tabs with carousels — same `min-height` fix

### Pending
- Slide-06 defect gallery: verify JS defect selector works through render path
- Design system refactor (carried)
- `scripts/build.js` and `scripts/deploy.js`
- Presentation view (read-only mode)
- Delete old `dashboard.css`

---

## 2026-04-11 — Server-side render functions for all 14 slides

### Accomplished
- **Continued Template→Library→Deck render chain**: all 14 slides now have dedicated server-side render functions wired in `renderLayoutToHtml`
- **Slides 01–05** were merged in prior part of session; this session completed the remaining 9
- **Parallel agents (×9)**: launched agents for slides 06–14 each writing to `builder/data/renderers/slide-XX.js`, then merged all via a single Node.js script
- **All dispatch lines wired**: `renderLayoutToHtml` now dispatches all 14 `tpl-new-*` template IDs to their render functions
- **table.js save fix**: `saveTable` now detects when a table is inside `.ls-tabs[data-edit]` and saves the whole tabs container instead of just the table — fixes column-hide persistence across reloads
- **tabs.js fix**: `switchTo` now calls `LSTable.init(activePanel)` when switching tabs — fixes column hide/show buttons not initializing on non-default tabs
- **Slide 04 mobile fix**: carousel moved above table on mobile using `order:-1`; carousel has fixed height; table is scrollable below

### Pending
- Test each slide visually against originals — fix per-slide issues as found
- Slide-06 defect selector JS — verify defect gallery behavior works via render path
- Design system refactor (carried)
- `scripts/build.js` and `scripts/deploy.js`

---

## 2026-04-07 (session 2) — Sidebar nav, Slides section, layout builder, deck connection

### Accomplished
- **Collapsible sidebar nav**: replaced top-bar pill nav with mobile-first collapsible sidebar across dashboard, settings — hamburger on mobile, collapse toggle on desktop, localStorage persistence
- **Mobile click bug fixed**: `.sidebar-overlay` was blocking all taps — fixed with `pointer-events: none` when closed
- **Settings page**: added working Presentation Name field (loads/saves via `PUT /api/deck`), fixed `PUT /api/deck` to do merge instead of full overwrite (partial updates now supported)
- **Layouts → Slides section** (`/slides`): built layout builder with full-screen editor, split-pane (canvas left, preview right), preset column layouts, row height toggles, component picker, dummy content preview, Desktop/Mobile viewport toggle
- **Slides architecture decided**: Templates → My Library → Deck (playlist model)
- **Deck ↔ Library connection**: `POST /api/deck/slides`, `DELETE /api/deck/slides/:id`, enriched `GET /api/deck`
- **Server-side layout renderer**: `GET /slides/deck-slide-:id.html`
- **Delete cloned slides**: `DELETE /api/slide-library/:id`
- **Enrichment pollution fix**: `PUT /api/deck` strips derived fields before writing

### Pending
- Test all 14 rendered slides against originals
- Design system refactor (carried)
- Delete old `dashboard.css`
- `scripts/build.js` and `scripts/deploy.js`
