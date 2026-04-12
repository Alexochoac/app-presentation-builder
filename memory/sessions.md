# Sessions

## 2026-04-12 (session 5) — Read-only viewer + PB_READONLY components

### Accomplished
- `?readonly=1` flag on `/slides/deck-preview/:id` — sets `window.PB_READONLY = true` before components load
- All 4 components updated: `carousel.js`, `tabs.js`, `list.js`, `table.js` skip edit controls when `PB_READONLY`; navigation/display features (arrows, tab switching, dot cycling) still work
- `GET /api/presentations/:id` — single presentation route added to server.js
- `GET /view/:id` — auth-protected route added; serves `features/presentation-view/index.html`
- `features/presentation-view/index.html` — full-screen dark slideshow viewer (back button, customer title, counter, iframe-per-slide, prev/next arrows, keyboard nav, slide name footer)
- Dashboard: "View" pill button added to each finished presentation row → links to `/view/:id`

### Pending
- GitHub Pages publish button (`POST /api/presentations/:id/publish`)
- Slide-06 defect gallery verification
- Design system refactor (CSS conflict)
- Add Slide modal (replace stub)
- `scripts/build.js` / `scripts/deploy.js`

---

## 2026-04-12 (session 2) — Preview fixes, Create Presentation flow, scrollbar

### Accomplished
- Slide Preview fixed: added all component JS + init to `/slides/deck-preview/:id` shell
- Preview arrows: prev/next with `N / 14` counter; subtitle updates to slide name
- Themed scrollbar on `.deck-list-scroll`
- Customer Settings removed from Builder
- Create Presentation flow: modal → `POST /api/presentations` → `presentations.json`
- Dashboard Finished Presentations list wired to real data

### Pending
- Presentation viewer, GitHub publish, Add Slide modal, Slide-06, design system refactor

---

## 2026-04-12 — UI Refactor: Dashboard / Builder / Slides separation

### Accomplished
- Dashboard cleaned to overview only + Finished Presentations skeleton
- Builder page (`/slides`): My Deck tab (2-col deck+preview) + Slide Manager tab
- Deck list: row style with drag-and-drop, eye toggle, remove button
- `GET /slides/deck-preview/:id` route: full HTML shell with style.css + component JS
- Nav synced across all pages: Dashboard | Builder | Settings

### Pending
- Finished Presentations wiring, Add Slide modal, Slide-06, design system refactor, build/deploy scripts
