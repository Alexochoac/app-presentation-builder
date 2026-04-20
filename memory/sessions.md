# Sessions

## 2026-04-20 — Builder polish: Add Slide modal, cover gallery, viewer fixes, dashboard actions

### Accomplished
- **Add Slide modal** — replaced stub with real template picker (slide library browser)
- **Builder preview nav bar** — replaced floating back link with proper header bar (title, badge, counter, history.back)
- **Builder slide preview default** — cover slide shown automatically on load instead of empty state
- **Customer Settings wired up** — fields now drive deck personalization (name, title, contact)
- **Edit panel text truncation** — fixed text fields showing only half the content
- **Slide-06 defect gallery** — fixed JS selector bugs, gallery button click, add/delete image, visibility clipping
- **Cover slide gallery** — fixed overlay clipping (moved to body on open), fixed old prefix normalization, added delete + move buttons injected dynamically
- **Builder preview nav bar** (header refactor task completed)
- **Edit presentation metadata** — inline edit for Name, Contact name, Position; `PUT /api/presentations/:id`
- **Delete presentation** — confirmation prompt + `DELETE /api/presentations/:id`, removes entry + deck file
- **Viewer — cover slide gallery button** — removed `data-builder-only` from trigger + overlay; kept on edit-only controls
- **Viewer — carousel autoplay fix** — fixed timing bug in readonly iframe context

### Pending
- GitHub Pages publish button (`POST /api/presentations/:id/publish`)
- Design system refactor (CSS conflict, carried)
- Delete old `dashboard.css`
- `scripts/build.js` / `scripts/deploy.js`

---

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

