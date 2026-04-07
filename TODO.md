# TODO — Presentation Builder

## High Priority
- [ ] **Design system refactor** — eliminate 3-layer CSS conflict (style.css vs per-slide `<style>` vs inline styles). One source of truth in style.css. Carousels use `aspect-ratio`. Columns use `.slide-cols` standard class. Per-slide styles handle decoration only.

## Dashboard & UI
- [ ] Presentation view — clean read-only mode (visible slides + hidden slides in CTA extras menu)
- [ ] Customer Settings — wire up fields to actual deck personalization
- [ ] Delete old `dashboard.css` after confirming `app-style.css` works

## Slides
- [ ] Slide-06 defect selector names — JS-generated, move to static HTML
- [ ] Image caption editing UI (captions come from `img.alt`, no edit path yet)

## Build & Deploy
- [ ] `scripts/build.js` — assemble customer HTML, strip `data-builder-only` elements
- [ ] `scripts/deploy.js` — push assembled output to GitHub Pages

## Ideas (see IDEAS.md)
- [ ] Public landing page (pricing, examples, investor section, integrations)
- [ ] Dual-preview layout builder (desktop + mobile side by side)

## Completed
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
