# Presentation Builder — Project Context

## What This Is
A local Express app for building and publishing customizable HTML slide presentations.
Sales teams use it to build customer-specific decks, then publish to GitHub Pages.

## Current Phase
**Phase 1** — Local app, single user, single company. Login portal + builder UI + publish to GitHub Pages.

## Architecture
- `builder/server.js` — Express server, save/upload/clone APIs
- `builder/features/builder-ui/preview.html` — Builder UI (slide editor)
- `builder/features/dashboard/index.html` — Dashboard (post-login home)
- `builder/features/dashboard/dashboard.js` — Deck manager, slide library, preview, clone
- `builder/shared/app-style.css` — Shared app stylesheet (dark/light theme, Apple Keynote style)
- `builder/features/slides/slide-NN-*.html` — Self-contained slide fragments
- `builder/features/slides/style.css` — Shared CSS for all slides (separate from app style)
- `builder/features/slides/components/` — Reusable JS components:
  - `carousel.js` — `.ls-carousel` declarative image carousel (add/delete/reorder/zoom/compare/autoplay)
  - `lightbox.js` — zoom/gallery lightbox, `data-zoom` + `data-zoom-group`, `+ Add Image` button
  - `tabs.js` — `.ls-tabs` declarative tab switcher (add/delete/rename tabs)
  - `list.js` — `ul[data-ls-list]` editable list (add/hide/delete/reorder/edit)
  - `table.js` — `table[data-ls-table]` capability matrix (rows + columns fully editable)
  - `tracker.js` — Umami analytics
- `.claude/settings.json` — Agent permission allow-list (Edit, Write, Bash)

## Style System
- **App style**: `builder/shared/app-style.css` — Apple Keynote aesthetic, dark/light via `data-theme` on `<html>`, persisted in `localStorage` as `pb-theme`
- **Theme toggle**: lives in Settings (not topbar) — applies to app shell only
- **Slide style**: `builder/features/slides/style.css` — Softsolution brand, separate from app style
- **Style mockups**: `style-mockups/` — reference HTML files for visual decisions

## Component Conventions
- Any `[data-zoom]` image → lightbox on click
- `[data-zoom-group]` on carousel wrapper → all images share a gallery
- `data-counter` on `.ls-carousel` → shows "1 / N" counter (bottom-right)
- `data-no-caption` on `.ls-carousel` → suppresses auto-caption overlay
- `data-builder-only` → element stripped in final customer output
- `data-edit="key"` → editable in builder, auto-saved to disk
- `data-ls-list` on `<ul>` → list.js takes over
- `data-ls-table` on `<table>` → table.js takes over
- Carousel/list/table saves dispatch `slide-carousel-save` custom event
- Compare slides: `ls-compare` class + `ls-cmp-left`/`ls-cmp-right` img classes, `data-compare-mode="split|reveal"`

## Completed This Project
- [x] Builder foundation: Express server, preview.html, save/upload API
- [x] Slides 01–14 created with `data-edit` + `contenteditable` on all text
- [x] All components: carousel.js, lightbox.js, tabs.js, list.js, table.js
- [x] All slides migrated to component system
- [x] Dashboard: deck manager + slide library + customer settings placeholder
- [x] `deck.json` + `slide-library.json` as source of truth; deck API endpoints
- [x] `preview.html` fetches deck from API
- [x] Full mobile responsiveness — all 14 slides fixed for iPhone 15
- [x] Full editability pass — all visible text across all 14 slides
- [x] Dashboard slide library redesign: hides in-deck slides, empty state, clone flow
- [x] Two-way slide preview with scaled iframe thumbnail + lightbox zoom
- [x] `POST /api/clone-slide` endpoint
- [x] `builder/shared/app-style.css` — shared app style with dark/light theme
- [x] GitHub repo created: `Alexochoac/app-presentation-builder`
- [x] Server-side slide preview shell (`GET /slides/preview/:id`)
- [x] Save handler bug fixed — filename derived from `SLIDES[current].file`
- [x] Mobile-first CSS conversion — all files converted to `min-width` breakpoints
- [x] `table.js` fully wired in slide-04 — restore chips, resizable column, correct classes
- [x] Settings page (`/settings`) — Theme toggle + Coming Soon sections
- [x] Dashboard renamed to Customer Settings with customer-specific fields
- [x] `style.css` shared components mobile-first (cards, kpi, two-col, split, etc.)

## Next Steps
- [ ] Per-slide inline CSS mobile audit — each slide's `<style>` block needs responsive layout
- [ ] Delete old `dashboard.css` after confirming new style works in browser
- [ ] Presentation view — clean read-only mode: visible slides full-screen + hidden slides in CTA extras menu
- [ ] Slide-06 defect selector names — move to static HTML (currently JS-generated)
- [ ] Image caption editing UI (captions come from `img.alt`, no edit path yet)
- [ ] `scripts/build.js` — assemble final customer HTML, strip `data-builder-only`
- [ ] `scripts/deploy.js` — push to GitHub Pages

## Phase Roadmap
- **Phase 1** (current) — Local app, single user, build + publish
- **Phase 2** — SaaS, multi-user, teams + permissions
- **Phase 3** — Interactive slides (polls, Q&A), custom per-slide components
- **Phase 4** — White-label, AI, CRM integrations

Last updated: 2026-04-06
