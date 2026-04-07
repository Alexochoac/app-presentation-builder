# TODO — Presentation Builder

## High Priority — Next Session
- [ ] **Rebuild `/slides` as 3-tab page**: Templates | My Library | Layouts
- [ ] **Template gallery**: new generic templates with dummy data, visual preview, "Use This" → clones to My Library
- [ ] **My Library tab**: slide cards with In Deck toggle, Edit button, Save as Template, Delete
- [ ] **"Save as Template" flow**: promote a library slide to a reusable template

## High Priority — Carried
- [ ] **Design system refactor** — eliminate 3-layer CSS conflict (style.css vs per-slide `<style>` vs inline styles). One source of truth in style.css.

## Dashboard & UI
- [ ] Presentation view — clean read-only mode
- [ ] Customer Settings — wire up fields to actual deck personalization
- [ ] Delete old `dashboard.css`

## Slides
- [ ] Slide-06 defect selector names — JS-generated, move to static HTML
- [ ] Image caption editing UI

## Build & Deploy
- [ ] `scripts/build.js` — assemble customer HTML, strip `data-builder-only` elements
- [ ] `scripts/deploy.js` — push assembled output to GitHub Pages

## Ideas (see IDEAS.md)
- [ ] Public landing page (pricing, examples, investor section, integrations)
- [ ] Dual-preview layout builder (desktop + mobile side by side)

## Completed
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
- [x] `GET/PUT /api/deck`, `GET /api/slide-library`, `POST /api/clone-slide` endpoints
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
