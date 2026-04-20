# Sessions

## 2026-04-20 — Asset cleanup: slide-library consolidated into uploads

### Accomplished
- Audited `slide-library/` vs `builder/features/slides/uploads/` and `builder/shared/assets/`
- Confirmed all slide-referenced images were already present in `uploads/` and `shared/assets/`
- Copied 166 new images from `Slide Images/` and `General Slide Images/` into `uploads/`
- Deleted entire `slide-library/` folder (archive-only, not referenced by any app code)

### Pending
- GitHub Pages publish button (`POST /api/presentations/:id/publish`)
- Design system refactor (CSS conflict, carried)
- Delete old `dashboard.css`
- `scripts/build.js` / `scripts/deploy.js`

---

## 2026-04-20 — Builder polish: Add Slide modal, cover gallery, viewer fixes, dashboard actions

### Accomplished
- **Add Slide modal** — replaced stub with real template picker (slide library browser)
- **Builder preview nav bar** — replaced floating back link with proper header bar (title, badge, counter, history.back)
- **Builder slide preview default** — cover slide shown automatically on load instead of empty state
- **Customer Settings wired up** — fields now drive deck personalization (name, title, contact)
- **Edit panel text truncation** — fixed text fields showing only half the content
- **Slide-06 defect gallery** — fixed JS selector bugs, gallery button click, add/delete image, visibility clipping
- **Cover slide gallery** — fixed overlay clipping (moved to body on open), fixed old prefix normalization, added delete + move buttons injected dynamically
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
- All 4 components updated: `carousel.js`, `tabs.js`, `list.js`, `table.js` skip edit controls when `PB_READONLY`
- `GET /api/presentations/:id` — single presentation route added to server.js
- `GET /view/:id` — auth-protected route; serves `features/presentation-view/index.html`
- `features/presentation-view/index.html` — full-screen dark slideshow viewer
- Dashboard: "View" pill button added to each finished presentation row

### Pending
- GitHub Pages publish button
- Design system refactor
- Add Slide modal
- `scripts/build.js` / `scripts/deploy.js`
