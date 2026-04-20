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

## Standard Slide Anatomy (introduced 2026-04-07)
All content slides now use this structure:
```html
<div class="slide content lsX">
  <div class="slide-logo-row">...</div>
  <div class="slide-layout">
    <header class="slide-head">
      <div class="section-label">...</div>
      <h1 class="slide-title">...</h1>
      <p class="slide-subtitle">...</p>  <!-- optional -->
    </header>
    <div class="slide-body">
      <!-- tabs, carousel, grid, table, etc. -->
    </div>
  </div>
</div>
```

## Style System
- **App style**: `builder/shared/app-style.css` — Apple Keynote aesthetic, dark/light via `data-theme` on `<html>`, persisted in `localStorage` as `pb-theme`
- **Slide style**: `builder/features/slides/style.css` — Softsolution brand, separate from app style
- **Known issue**: 3-layer CSS conflict (style.css vs per-slide `<style>` blocks vs inline styles) — design system refactor planned for next session

## Component Conventions
- Any `[data-zoom]` image → lightbox on click
- `data-counter` on `.ls-carousel` → shows "1 / N" counter
- `data-no-caption` on `.ls-carousel` → suppresses auto-caption overlay
- `data-builder-only` → element stripped in final customer output
- `data-edit="key"` → editable in builder, auto-saved to disk
- `data-ls-list` on `<ul>` → list.js takes over
- `data-ls-table` on `<table>` → table.js takes over

## Completed This Project
- [x] Builder foundation: Express server, preview.html, save/upload API
- [x] Slides 01–15 created with `data-edit` + `contenteditable` on all text
- [x] All components: carousel.js, lightbox.js, tabs.js, list.js, table.js
- [x] Dashboard: deck manager + slide library + customer settings placeholder
- [x] `deck.json` + `slide-library.json` as source of truth; deck API endpoints
- [x] Full mobile responsiveness pass — all slides
- [x] Full editability pass — all visible text across all slides
- [x] Dashboard slide library redesign: hides in-deck slides, clone flow
- [x] Two-way slide preview with scaled iframe thumbnail + lightbox zoom
- [x] `POST /api/clone-slide` endpoint
- [x] `builder/shared/app-style.css` — shared app style with dark/light theme
- [x] GitHub repo created: `Alexochoac/app-presentation-builder`
- [x] Server-side slide preview shell (`GET /slides/preview/:id`)
- [x] Save handler bug fixed — filename derived from `SLIDES[current].file`
- [x] Mobile-first CSS conversion — all files converted to `min-width` breakpoints
- [x] `table.js` fully wired in slide-04 — restore chips, resizable column, correct classes
- [x] Settings page (`/settings`) — Theme toggle + Coming Soon sections
- [x] Customer Settings on dashboard with customer-specific fields
- [x] Standard slide anatomy (`slide-layout`/`slide-head`/`slide-body`) added to all 14 content slides
- [x] `/idea` skill created for mid-session idea capture
- [x] `IDEAS.md` created with 2 logged ideas
- [x] Template→Library→Deck render chain: server-side render functions for all 14 slides
- [x] `table.js` saveTable fixed — saves parent `.ls-tabs` container (fixes column-hide persistence)
- [x] `tabs.js` fixed — calls `LSTable.init` on tab switch (fixes table buttons on non-active tabs)
- [x] Slide 04 mobile: carousel above table via `order:-1`
- [x] `builder/data/renderers/` — individual render function files for slides 06–14
- [x] Mobile carousel fix — all slides (6–12, 14, 2, 4, 5): `min-height` pattern, `slide-body width:100%`, `overflow:hidden` removed from slide-14
- [x] Slide 8 desktop fix — two-column flex layout with carousel filling right column
- [x] Slide 12 — badges moved inside first carousel slide; `.ls12-diagram-wrap` made flex column
- [x] Slide 4 mobile — vertical column headers, proc-grid single column, scrollable
- [x] Root cause documented: `server.js` is the only source of truth for rendered slides

## Next Steps
- [x] Presentation view — `/view/:id` read-only slideshow viewer (session 5)
- [x] `PB_READONLY` mode — all 4 components skip edit controls (session 5)
- [x] Add Slide modal — replaced stub with real template picker (2026-04-20)
- [x] Builder preview nav bar — proper header with counter, badge, history.back (2026-04-20)
- [x] Slide-06 defect gallery — fixed JS selector, gallery button, add/delete, clipping (2026-04-20)
- [x] Cover slide gallery — fixed overlay, prefix normalization, delete/move buttons (2026-04-20)
- [x] Edit presentation metadata — inline edit Name/Contact/Position via PUT API (2026-04-20)
- [x] Delete presentation — confirmation + DELETE API, removes entry + deck file (2026-04-20)
- [x] Viewer cover slide gallery button — exposed in readonly mode (2026-04-20)
- [x] Viewer carousel autoplay — fixed timing bug in iframe readonly context (2026-04-20)
- [x] **Asset cleanup** — moved all slide-library images to uploads/, deleted slide-library/ folder (2026-04-20)
- [x] `scripts/build.js` — assemble final customer HTML, strip `data-builder-only` (2026-04-20)
- [x] `buildFrozenPresentation()` in server.js — auto-runs on every `POST /api/presentations` (2026-04-20)
- [x] `finished-presentations/[presId]/index.html` — self-contained frozen output per presentation (2026-04-20)
- [x] Shared asset pool — `finished-presentations/shared/` deduplicated across all presentations (2026-04-20)
- [x] Delete frozen folder on dashboard delete — `fs.rmSync` in DELETE endpoint (2026-04-20)
- [x] `/finished/:presId/` static route — serves frozen file; `/view/:id` redirects to it (2026-04-20)
- [x] **Dashboard list/grid view toggle** — ☰/▪▪ toggle in panel header, localStorage persistence (2026-04-20)
- [x] **Grid cards with customer logo** — logo fills card; initials fallback; `customerLogoSrc` stored at save time (2026-04-20)
- [x] **slideCount fix** — only counts visible slides (2026-04-20)
- [ ] **GitHub Pages publish** — `POST /api/presentations/:id/publish` + Publish button on Dashboard
- [ ] **Design system refactor** (carried) — eliminate 3-layer CSS conflict; one source of truth in style.css
- [ ] Delete old `dashboard.css`
- [ ] `scripts/deploy.js` — push to GitHub Pages

## Phase Roadmap
- **Phase 1** (current) — Local app, single user, build + publish
- **Phase 2** — SaaS, multi-user, teams + permissions
- **Phase 3** — Interactive slides (polls, Q&A), multiple companies per user
- **Phase 4** — Advanced (white-label, AI, CRM integrations)

Last updated: 2026-04-20 (session 4)
