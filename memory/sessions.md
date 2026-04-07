# Sessions

## 2026-04-07 — Mobile responsiveness refactor + /idea skill

### Accomplished
- **Mobile audit pass 1**: Launched parallel frontend-builder agents on all 15 slides to fix inline `<style>` blocks (grid columns, flex rows, fixed widths → mobile-first)
- **Root cause identified**: `.slide.content` uses `position:absolute; inset:0` — `height:auto` on children does nothing. Slides clip instead of scroll on mobile
- **Standard slide anatomy introduced**: Added `slide-layout` / `slide-head` / `slide-body` wrapper structure to all 14 content slides (01-cover exempt)
- **style.css updates**: Added `.slide-layout` and `.slide-body` standard CSS rules; added `height:100%` to `.slide.content` on desktop; added `align-items:center` to `.slide-layout`; added `padding-top:52px` to `.slide-layout` mobile to clear logo row
- **Per-slide bugs fixed**:
  - slide-02: wrong tab active on load (carousel hidden)
  - slide-03: `max-height:42vh` removed from mobile lists
  - slide-04: proc-table `overflow-y:auto` added, mobile padding reduced
  - slide-05: image cards `min-height:180px` added
  - slide-06: `showDefault()` now calls `Carousel.init` + `Lightbox.init`
  - slide-07/09/11/12: `position:relative` removed from root div (was breaking absolute positioning)
  - slide-08: carousel sizing added, layout `min-height` added
  - slide-09/11/12: stale carousel transforms reset to `translateX(0px)`
  - slide-10: Archive tab + panel restored (was deleted during refactor)
  - slide-14: `position:relative` removed, kept `overflow:hidden`
  - slides 06/08/11: additional stale transforms reset
- **`/idea` skill created**: Global command for capturing mid-session project ideas. Checks TODO.md → CONTEXT.md → IDEAS.md for duplicates before logging
- **IDEAS.md created**: Logged 2 ideas — Public Landing Page, Dual-Preview Layout Builder

### Pending
- **Design system refactor** (next session priority): Eliminate 3-layer CSS conflict (style.css vs per-slide `<style>` vs inline style). Plan: one source of truth in style.css, per-slide styles handle decoration only, carousels use `aspect-ratio` not `height`, columns use `.slide-cols` standard class
- Remaining mobile/desktop layout issues still present on some slides — need design system fix first
- Delete old `dashboard.css`
- Slide-06 defect selector names — static HTML
- `scripts/build.js` and `scripts/deploy.js`

---

## 2026-04-06 — Preview fix, mobile-first conversion, table fixes, settings page

### Accomplished
- **Slide preview in dashboard**: fixed iframe loading bare fragments — added server-side shell route `GET /slides/preview/:id`
- **Preview thumbnail sizing**: fixed scale computation using stable panel element measurement
- **Slide visibility bug**: shell forces `.slide { opacity:1 !important }` so slide renders without JS
- **Save handler bug**: all 3 save handlers fixed to derive filename from `SLIDES[current].file`
- **Mobile-first conversion**: converted ALL `@media (max-width)` to `@media (min-width)` across active slides, style mockups, and shared CSS files
- **table.js fixes in slide-04**: added missing restore/add-row elements; fixed class names; removed dead inline JS; fixed text-align
- **Resizable first column**: added drag handle to `table.js`
- **Settings page**: built `/settings` with Theme toggle (dark/light), Company Profile, and Coming Soon sections
- **Customer Settings**: renamed dashboard "Company Settings" → "Customer Settings" with customer-specific fields

### Pending
- Design system refactor (carried forward)
- Delete old `dashboard.css`
- Presentation view (read-only mode)
- Slide-06 defect selector names — static HTML
- `scripts/build.js` and `scripts/deploy.js`

---

## 2026-04-05 (session 2) — Dashboard redesign, style system, GitHub repo

### Accomplished
- Created GitHub repo `Alexochoac/app-presentation-builder`, pushed all code
- Dashboard slide library redesign: hides in-deck slides, clone flow, two-way preview
- Scaled thumbnail preview + lightbox zoom in dashboard
- `POST /api/clone-slide` endpoint
- `builder/shared/app-style.css` — Apple Keynote dark/light theme
- Server serves `/shared/*` for shared app assets

### Pending
- Delete old `dashboard.css`
- Presentation view
- Slide-06 defect selector names
- `scripts/build.js` and `scripts/deploy.js`
