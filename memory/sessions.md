# Sessions

## 2026-04-07 (session 2) — Sidebar nav, Slides section, layout builder, deck connection

### Accomplished
- **Collapsible sidebar nav**: replaced top-bar pill nav with mobile-first collapsible sidebar across dashboard, settings — hamburger on mobile, collapse toggle on desktop, localStorage persistence
- **Mobile click bug fixed**: `.sidebar-overlay` was blocking all taps — fixed with `pointer-events: none` when closed
- **Settings page**: added working Presentation Name field (loads/saves via `PUT /api/deck`), fixed `PUT /api/deck` to do merge instead of full overwrite (partial updates now supported)
- **Layouts → Slides section** (`/slides`): built layout builder with full-screen editor, split-pane (canvas left, preview right), preset column layouts (Full / 1/2+1/2 / 1/3+2/3 / 2/3+1/3 / thirds), row height toggles (Auto/Tall/Short), component picker, dummy content preview, Desktop/Mobile viewport toggle with phone frame
- **Slides architecture decided**: Templates → My Library → Deck (playlist model). Slides in library can be in or out of deck independently
- **Deck ↔ Library connection**: `POST /api/deck/slides` to add layout slide to deck, `DELETE /api/deck/slides/:id` to remove, `GET /api/deck` enriches layout slides with name+rows from layouts.json
- **Server-side layout renderer**: `GET /slides/deck-slide-:id.html` generates HTML fragment from layout JSON so old builder can render new slides without changes
- **Delete cloned slides**: added `DELETE /api/slide-library/:id`, delete button on custom library cards
- **Enrichment pollution fix**: `PUT /api/deck` now strips derived fields before writing — only persists `id`, `visible`, `layoutId`
- **Save bug fixed**: layout save was 404 because API response `{ success, data }` wrapper wasn't being unwrapped — fixed in createLayout and loadLayouts
- **Preview toggle fix**: `.preview-phone` `max-width: 100%` → `max-width: 390px` so mobile frame is visually distinct
- **Slides architecture saved to memory**: `memory/project_slides_architecture.md`

### Pending
- Rebuild `/slides` as 3-tab page: Templates | My Library | Layouts
- Build template gallery with visual previews (new generic templates, not product-specific)
- "Use This" flow: clone template into My Library
- "Save as Template" flow: promote library slide to template
- In Deck / Not in Deck toggle on library slide cards
- Design system refactor (carried forward — still high priority)
- Delete old `dashboard.css`

---

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

