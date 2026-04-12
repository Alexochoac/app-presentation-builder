# TODO — Presentation Builder

## High Priority — Next Session
- [ ] **Slide-06 defect gallery**: verify JS defect selector works through render path; fix if broken

## High Priority — Carried
- [ ] **Design system refactor** — eliminate 3-layer CSS conflict (style.css vs per-slide `<style>` vs inline styles). One source of truth in style.css.

## Dashboard & UI
- [ ] **Presentation viewer** — `/view/:id` read-only full-screen slideshow (click from Dashboard)
- [ ] **GitHub publish** — "Publish to GitHub Pages" button on finished presentation
- [ ] Add Slide modal — replace stub with real template picker modal
- [ ] Customer Settings — wire up fields to actual deck personalization
- [ ] Delete old `dashboard.css`

## Slides
- [ ] Image caption editing UI

## Build & Deploy
- [ ] `scripts/build.js` — assemble customer HTML, strip `data-builder-only` elements
- [ ] `scripts/deploy.js` — push assembled output to GitHub Pages

## Ideas (see IDEAS.md)
- [ ] Public landing page (pricing, examples, investor section, integrations)
- [ ] Dual-preview layout builder (desktop + mobile side by side)

## Completed
- [x] UI refactor: Dashboard / Builder / Slides separated into distinct sections
- [x] Dashboard cleaned up: overview only, Finished Presentations skeleton added
- [x] Builder page: My Deck tab (2-col deck+preview) + Customer Settings + Slide Manager tab
- [x] Deck list: row style with drag-and-drop, eye toggle, remove button
- [x] Slide preview in Builder: click slide → renders in right pane via `/slides/deck-preview/:id`
- [x] `GET /slides/deck-preview/:id` server route (full HTML shell with style.css)
- [x] Nav synced across all pages: Dashboard | Builder | Settings
- [x] Slide Preview: component JS added to deck-preview shell (carousels/tabs now render correctly)
- [x] Slide Preview: prev/next arrows with slide counter
- [x] Deck list scrollbar: theme-sensitive (dark/light mode)
- [x] Create Presentation modal: customer fields → saves to presentations.json
- [x] `POST /api/presentations` + `GET /api/presentations` server routes
- [x] `presentations.json` data store created
- [x] Dashboard Finished Presentations: wired to real data from API
- [x] Mobile carousel fix — all slides: `min-height:260px !important` pattern on mobile, `height:100%` desktop
- [x] `server.js` confirmed as sole source of truth for rendered slides (HTML files and renderers/ are not served)
- [x] Slide 8: two-column flex desktop layout (text + carousel)
- [x] Slide 12: badges inside first carousel slide; `.ls12-diagram-wrap` flex column; `overflow:hidden` removed from slide root
- [x] Slide 14: `overflow:hidden` removed from slide root — mobile scrollable
- [x] Slide 4: vertical column headers on mobile; tab 2 single-column; slide scrollable
- [x] All 14 slides have server-side render functions (`renderXxxLayout`) in `server.js`
- [x] `renderLayoutToHtml` dispatches all 14 `tpl-new-*` template IDs
- [x] `table.js` saveTable: saves parent `.ls-tabs` container when inside tabs (column-hide persists)
- [x] `tabs.js`: calls `LSTable.init` on tab switch (table buttons on non-active tabs)
- [x] Slide 04 mobile: carousel above table via `order:-1`; table scrollable below
- [x] `builder/data/renderers/` — render function source files for slides 06–14
- [x] Collapsible sidebar nav (mobile hamburger + desktop collapse) across all pages
- [x] Mobile click bug fixed (sidebar overlay pointer-events)
- [x] Presentation Name field in settings — saves via PUT /api/deck
- [x] PUT /api/deck supports partial updates (merge, not overwrite)
- [x] /slides page with layout builder (split pane, preset cols, component picker, dummy preview)
- [x] Slides architecture defined: Templates → My Library → Deck (playlist model)
- [x] POST /api/deck/slides + DELETE /api/deck/slides/:id (reference model)
- [x] GET /api/deck enriches layout slides with name+rows from layouts.json
- [x] Server-side layout renderer (GET /slides/deck-slide-:id.html)
- [x] DELETE /api/slide-library/:id + delete button on custom library cards
- [x] Enrichment pollution fix in PUT /api/deck
- [x] Builder foundation: Express server, preview.html, save/upload API
- [x] `carousel.js`, `lightbox.js`, `tabs.js`, `list.js`, `table.js` components
- [x] All slides 01–15 created and migrated to component system
- [x] Dashboard built — deck manager + slide library
- [x] `deck.json` + `slide-library.json` as source of truth
- [x] Full editability pass — all visible text in all slides
- [x] Dashboard slide library redesign: clone flow, two-way preview
- [x] Scaled iframe thumbnail + lightbox zoom in dashboard
- [x] `builder/shared/app-style.css` — Apple Keynote dark/light theme
- [x] GitHub repo: `Alexochoac/app-presentation-builder`
- [x] Server-side slide preview shell (`GET /slides/preview/:id`)
- [x] Save handler bug fixed
- [x] Mobile-first CSS conversion — all `max-width` → `min-width`
- [x] `table.js` fully wired in slide-04
- [x] Settings page (`/settings`) — Theme toggle + Coming Soon sections
- [x] Customer Settings on dashboard
- [x] Standard slide anatomy (`slide-layout`/`slide-head`/`slide-body`) on all 14 content slides
- [x] `/idea` skill for mid-session idea capture
